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
  // Constrain @vercel/nft file tracing to the monorepo root. Without this,
  // on Windows the tracer follows pnpm junctions into the user profile and
  // hits NTFS junction points (e.g. "Application Data") it can't enumerate.
  outputFileTracingRoot: join(__dirname, "../../"),
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
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        "better-sqlite3",
        "bindings",
      ];
    }
    // pnpm uses symlinks extensively. On Windows, following those symlinks can
    // lead webpack outside the project tree into NTFS junction points (e.g.
    // "Application Data") that aren't enumerable, causing fatal EPERM errors.
    config.resolve.symlinks = false;
    return config;
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
