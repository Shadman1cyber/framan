"use client";

// Root error boundary — network failures / server action errors land here
// with a friendly retry instead of a raw TypeError overlay.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isNetwork = /fetch|network/i.test(error.message);
  return (
    <html lang="en">
      <body style={{ background: "#0a0d12", color: "#e9edf5", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 480, border: "1px solid #1e2531", borderRadius: 12, padding: 28, background: "#10141b" }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              {isNetwork ? "Connection to FARMAN lost" : "Something went wrong"}
            </h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#9aa4ba" }}>
              {isNetwork
                ? "The server is unreachable — it may have restarted. Give it a few seconds and try again. If you opened an old tab, refresh to get a fresh session."
                : "An unexpected error occurred while rendering this page."}
            </p>
            {error.digest && (
              <p style={{ fontSize: 11, color: "#66718a", marginTop: 10, fontFamily: "monospace" }}>digest: {error.digest}</p>
            )}
            <button
              onClick={reset}
              style={{ marginTop: 18, height: 38, padding: "0 18px", borderRadius: 8, background: "#17b8a6", color: "#04211d", fontWeight: 600, fontSize: 13.5, border: "none", cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
