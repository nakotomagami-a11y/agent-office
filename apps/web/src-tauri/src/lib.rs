use std::process::Child;
use std::sync::{Arc, Mutex};
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg(not(debug_assertions))]
fn wait_for_port(port: u16, timeout_secs: u64) -> bool {
    use std::net::TcpStream;
    use std::time::{Duration, Instant};
    let addr = format!("127.0.0.1:{port}");
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        if TcpStream::connect(&addr).is_ok() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMABUF renderer is the GPU-accelerated compositing path.
    // Forcing WEBKIT_DISABLE_DMABUF_RENDERER=1 drops the whole webview onto a
    // slow (often software/llvmpipe) rasteriser — scrolling, animation AND text
    // input all crawl, while the same app stays smooth in Chromium. That flag
    // was a blunt workaround for a WebKitGTK 2.40-era Intel/Wayland bug (office
    // canvas not repainting, glitchy WebGL); it's fixed in the WebKitGTK that
    // ships on current distros, so we leave DMABUF (GPU compositing) ON.
    //
    // Escape hatch: we only force-disable it when the user opts in by setting
    // AO_DISABLE_DMABUF=1 before launch (for the rare old-WebKitGTK box that
    // still corrupts). We never override a value the user set themselves.
    #[cfg(target_os = "linux")]
    if std::env::var_os("AO_DISABLE_DMABUF").is_some()
        && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let server: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let server_setup = server.clone();
    let server_close = server.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(not(debug_assertions))]
            {
                use std::process::Command;
                use tauri::Manager;

                let resource_dir = app
                    .path()
                    .resource_dir()
                    .expect("resource dir not found");

                #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
                let node_bin_name = "node-x86_64-unknown-linux-gnu";
                #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
                let node_bin_name = "node-aarch64-unknown-linux-gnu";
                #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
                let node_bin_name = "node-aarch64-apple-darwin";
                #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
                let node_bin_name = "node-x86_64-apple-darwin";
                #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
                let node_bin_name = "node-x86_64-pc-windows-msvc.exe";

                let node_bin = resource_dir
                    .join("binaries")
                    .join(node_bin_name);
                // pnpm monorepo: standalone output nests the app under apps/web/
                let server_js = resource_dir
                    .join("server")
                    .join("apps")
                    .join("web")
                    .join("server.js");

                #[cfg(target_os = "linux")]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut perms = std::fs::metadata(&node_bin)
                        .expect("node binary missing from resources")
                        .permissions();
                    perms.set_mode(0o755);
                    // Ignore error — dpkg installs binaries as root-owned; they're already executable.
                    let _ = std::fs::set_permissions(&node_bin, perms);
                }

                let child = Command::new(&node_bin)
                    .arg(&server_js)
                    .env("PORT", "5173")
                    .env("HOSTNAME", "127.0.0.1")
                    .env("NODE_ENV", "production")
                    .spawn()
                    .expect("failed to spawn bundled server");

                *server_setup.lock().unwrap() = Some(child);

                if !wait_for_port(5173, 30) {
                    panic!("server did not become ready within 30 s");
                }
            }

            // Suppress unused-variable warning in debug builds where the
            // server_setup block above is compiled out.
            #[cfg(debug_assertions)]
            let _ = &server_setup;

            // Clamp the launch size to the monitor's usable work area so the
            // window never opens taller/wider than the screen (a frameless
            // window opening past the top edge hides its own header — the OS
            // won't offer a title bar to drag it back). Also clamp the minimum
            // constraint: if min_inner_size exceeds the display the OS forces
            // the window oversized regardless of the requested inner_size.
            let (mut width, mut height) = (1400.0_f64, 900.0_f64);
            let (mut min_w, mut min_h) = (1100.0_f64, 720.0_f64);
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let scale = monitor.scale_factor();
                let area = monitor.work_area();
                // work_area is physical px; the builder takes logical px.
                let avail_w = area.size.width as f64 / scale;
                let avail_h = area.size.height as f64 / scale;
                // Small margin so the frameless window isn't flush to the edges.
                let max_w = (avail_w - 40.0).max(640.0);
                let max_h = (avail_h - 40.0).max(480.0);
                width = width.min(max_w);
                height = height.min(max_h);
                min_w = min_w.min(max_w);
                min_h = min_h.min(max_h);
            }

            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("http://localhost:5173".parse().unwrap()),
            )
            .title("Agent Office")
            .inner_size(width, height)
            .min_inner_size(min_w, min_h)
            .resizable(true)
            .fullscreen(false)
            .decorations(false)
            .transparent(true)
            .center()
            .build()?;

            Ok(())
        })
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    if let Ok(mut guard) = server_close.lock() {
                        if let Some(ref mut child) = *guard {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
