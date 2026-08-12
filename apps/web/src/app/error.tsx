"use client";

/**
 * App-router error boundary. Explicitly defining this stops Next.js from
 * generating a pages-router fallback `/_error` chunk that imports
 * `<Html>` from `next/document` and crashes the production build.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-0 text-txt">
      <div className="flex flex-col items-center gap-4 p-8 text-center max-w-[480px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-txt-3">
          Something broke
        </div>
        <h1 className="text-[18px] font-semibold">Unexpected error</h1>
        <p className="text-[13px] text-txt-2">
          {error.message || "The app hit an error while rendering this page."}
        </p>
        {error.digest ? (
          <p className="font-mono text-[10px] text-txt-4">digest: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-2 px-4 py-2 rounded-md bg-bg-2 border border-line text-txt hover:bg-bg-3"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
