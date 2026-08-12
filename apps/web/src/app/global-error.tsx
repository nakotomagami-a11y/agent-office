"use client";

/**
 * Root-level error boundary. Rendered when the app-router root layout
 * itself throws. Must include its own <html> and <body> since it
 * replaces the layout entirely.
 *
 * Defining this prevents Next.js from generating a pages-router
 * fallback `_error` chunk that imports `<Html>` from `next/document`
 * and crashes the production build.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24, textAlign: "center", maxWidth: 480 }}>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.1, opacity: 0.6 }}>
              Fatal error
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>The app crashed while loading</h1>
            <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>
              {error.message || "Something went wrong before the layout rendered."}
            </p>
            {error.digest ? (
              <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, opacity: 0.5, margin: 0 }}>
                digest: {error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
