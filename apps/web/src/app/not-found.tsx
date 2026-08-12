/**
 * App-router 404 page. Explicitly defining this prevents Next.js from
 * falling back to the legacy pages-dir error page during prerender,
 * which imports <Html> from next/document and crashes production builds.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-0 text-txt">
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-txt-3">
          404
        </div>
        <h1 className="text-[18px] font-semibold">Not found</h1>
        <p className="text-[13px] text-txt-2 max-w-[420px]">
          The page you asked for does not exist. It may have moved, or the
          link may be stale.
        </p>
      </div>
    </div>
  );
}
