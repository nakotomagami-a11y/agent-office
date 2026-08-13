import createNextIntlPlugin from "next-intl/plugin";
import { createRequire } from "module";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");
const __dirname = dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

let gitSha = "";
try {
  gitSha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
} catch {
  // Not a git checkout (e.g. standalone build) — leave commit blank.
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Constrain file tracing to the monorepo root. Without this, on Windows the
  // tracer follows pnpm junctions into the user profile and hits NTFS junction
  // points (e.g. "Application Data") it can't enumerate.
  outputFileTracingRoot: join(__dirname, "../../"),
  // The tracing root is the monorepo root, so without this the tracer sweeps a
  // previous Tauri build's `src-tauri/server` + `src-tauri/target` back into
  // `.next/standalone`, which prepare-bundle then copies into `src-tauri/server`
  // again — nesting one level deeper every build (runaway disk + memory). None
  // of src-tauri belongs in the traced server graph.
  outputFileTracingExcludes: {
    "*": ["**/src-tauri/**"],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
  output: "standalone",
  reactStrictMode: true,
  // Hide the default `X-Powered-By: Next.js` header — fingerprint
  // suppression, defense-in-depth.
  poweredByHeader: false,
  transpilePackages: ["@agent-office/domain", "@agent-office/pixel-icons", "@agent-office/pixel-planets"],
  // better-sqlite3 is a native module; `bindings` is its runtime resolver.
  // Both must stay external so they load from node_modules at runtime instead
  // of being bundled into the server graph (Turbopack honours this for RSC).
  serverExternalPackages: ["better-sqlite3", "bindings"],
  // Resolve next-intl's request config under Turbopack. Declared explicitly so
  // it does not depend on next-intl's `process.env.TURBOPACK` detection, which
  // is not guaranteed to be set when the config is evaluated.
  turbopack: {
    resolveAlias: {
      "next-intl/config": join(__dirname, "src/i18n/request.ts"),
    },
  },
  /**
   * Global security headers. Applied to every response — cheap and
   * catches whole classes of browser-side attacks.
   *
   *   X-Content-Type-Options   — no MIME sniffing (blocks a class of XSS).
   *   X-Frame-Options          — deny framing (clickjacking).
   *   Referrer-Policy          — leak nothing on cross-origin nav.
   *   Permissions-Policy       — turn off features we don't use.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options",        value: "DENY" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
