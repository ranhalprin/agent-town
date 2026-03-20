"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#1a1814",
          color: "#ef4444",
          fontFamily: "monospace",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 16, marginBottom: 16 }}>Something went wrong</div>
          <div style={{ color: "#a09888", fontSize: 10 }}>{error.message}</div>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "8px 24px",
              border: "3px solid #4a4238",
              borderRadius: 6,
              background: "#322c24",
              color: "#e8e2d8",
              fontFamily: "inherit",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
