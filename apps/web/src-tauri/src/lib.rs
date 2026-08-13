use std::process::Child;
use std::sync::{Arc, Mutex};
use tauri::{WebviewUrl, WebviewWindowBuilder};

// Ask the OS for an unused loopback port instead of hardcoding one. A fixed
// port (we used to pin 5173 — the Vite/Next dev default) collides with
// whatever the user already has running, and our target audience is
// developers who very plausibly have a dev server on it. On collision the
// bundled server can't bind and exits, while the readiness probe happily
// connects to the *stranger* on that port and the webview then renders
// against someone else's server.
//
// The listener is dropped before node starts, so there is a brief window
// where another process could take the port. That race is unavoidable
// without passing a bound socket to the child, and is vastly narrower than
// the guaranteed collision a hardcoded port gives us.
#[cfg(not(debug_assertions))]
fn pick_free_port() -> u16 {
    use std::net::TcpListener;
    TcpListener::bind("127.0.0.1:0")
        .expect("no free TCP port available for the bundled server")
        .local_addr()
        .expect("failed to read local address of probe socket")
        .port()
}

// Wait until the bundled server actually serves HTTP, not merely until
// something accepts a TCP connection. A bare connect() cannot tell our
// server from an unrelated process, and it also returns true the instant
// the socket is listening — before Next.js can serve a request.
//
// Polling the child means a server that dies on startup fails immediately
// with its exit status, instead of stalling for the full timeout and
// reporting a misleading "not ready in time".
#[cfg(not(debug_assertions))]
fn wait_for_server(port: u16, child: &mut Child, timeout_secs: u64) -> Result<(), String> {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::{Duration, Instant};

    let addr = format!("127.0.0.1:{port}");
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!("bundled server exited during startup ({status})"))
            }
            Ok(None) => {}
            Err(err) => return Err(format!("could not poll bundled server: {err}")),
        }

        if let Ok(mut stream) = TcpStream::connect(&addr) {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let req = format!(
                "GET /api/health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n"
            );
            let mut body = String::new();
            if stream.write_all(req.as_bytes()).is_ok()
                && stream.read_to_string(&mut body).is_ok()
                && body.starts_with("HTTP/1.1 200")
            {
                return Ok(());
            }
        }

        if Instant::now() >= deadline {
            return Err(format!("server did not become ready within {timeout_secs} s"));
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

            // Dev builds point at the Next dev server on its well-known port;
            // release builds use the ephemeral port the bundled server was
            // told to bind.
            #[cfg(debug_assertions)]
            let port: u16 = 5173;

            #[cfg(not(debug_assertions))]
            let port: u16 = {
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

                let port = pick_free_port();

                let mut child = Command::new(&node_bin)
                    .arg(&server_js)
                    .env("PORT", port.to_string())
                    .env("HOSTNAME", "127.0.0.1")
                    .env("NODE_ENV", "production")
                    .spawn()
                    .expect("failed to spawn bundled server");

                // Hold the child locally until it is known good, so a failed
                // startup reaps it here rather than leaving an orphan holding
                // a port for the rest of the session.
                if let Err(err) = wait_for_server(port, &mut child, 30) {
                    let _ = child.kill();
                    let _ = child.wait();
                    panic!("{err}");
                }

                *server_setup.lock().unwrap() = Some(child);

                port
            };

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

            // 127.0.0.1 rather than "localhost": the server binds IPv4
            // loopback, but "localhost" can resolve to ::1 first and fail.
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(
                    format!("http://127.0.0.1:{port}")
                        .parse()
                        .expect("failed to build server URL"),
                ),
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // RunEvent::Exit covers every ordinary shutdown path — window close,
        // Cmd+Q, and app-initiated exit. The previous WindowEvent::Destroyed
        // handler only fired on the first of those, so quitting any other way
        // left the node server running and holding its port indefinitely.
        //
        // Nothing can catch SIGKILL or a hard crash, so an orphan is still
        // possible there; the ephemeral port above means a leftover one no
        // longer breaks the next launch.
        .run(move |_app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut guard) = server_close.lock() {
                    if let Some(ref mut child) = *guard {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}
