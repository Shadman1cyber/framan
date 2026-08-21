"use client";

import { useEffect } from "react";

// Route-level boundary for the authenticated app: keeps the shell alive and
// offers a retry when a page-level render or server action fails.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[farman] route error:", error);
  }, [error]);

  const isNetwork = /fetch|network/i.test(error.message);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-line bg-surface p-7 text-center">
        <div className="mx-auto mb-4 h-11 w-11 rounded-xl border border-bad/30 bg-bad/10 text-bad flex items-center justify-center text-lg font-semibold">
          !
        </div>
        <h1 className="text-[15px] font-semibold">
          {isNetwork ? "Connection to FARMAN lost" : "This page hit an error"}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
          {isNetwork
            ? "The server is unreachable — it may have restarted. Refresh the page to reconnect; your data is safe."
            : "An unexpected error occurred. You can retry — the rest of FARMAN keeps running."}
        </p>
        {error.digest && (
          <p className="num mt-3 text-[10.5px] text-ink-faint">digest: {error.digest}</p>
        )}
        <div className="mt-5 flex items-center justify-center gap-2.5">
          <button
            onClick={reset}
            className="h-9 rounded-lg bg-accent px-4 text-[13px] font-semibold text-[#04211d] hover:bg-accent-strong transition-colors"
          >
            Retry
          </button>
          <a
            href="/dashboard"
            className="h-9 inline-flex items-center rounded-lg border border-line-strong px-4 text-[13px] font-medium text-ink-dim hover:text-ink transition-colors"
          >
            Back to Command Center
          </a>
        </div>
      </div>
    </div>
  );
}
