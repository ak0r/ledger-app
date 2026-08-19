"use client";

import { Button } from "@/components/ui/button";

// Next 16.3 renamed this boundary's recovery callback from `reset` to
// `retry` (see node_modules/next/dist/docs/.../error.md Version History).
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-4 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button type="button" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
