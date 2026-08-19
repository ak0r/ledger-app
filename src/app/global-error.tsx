"use client";

// Only fires if the root layout itself throws. Must define its own
// html/body and cannot rely on globals.css or shadcn tokens (doc note:
// "global-error... does not include your global styles").
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "1rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h2>Something went wrong</h2>
        <p>{error.message || "An unexpected error occurred."}</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            borderRadius: "8px",
            padding: "0.375rem 0.75rem",
            background: "black",
            color: "white",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
