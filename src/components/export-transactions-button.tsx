"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportTransactionsCsvAction } from "@/server/actions/export";

export function ExportTransactionsButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    setPending(true);
    const result = await exportTransactionsCsvAction();
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }

    const blob = new Blob([result.data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ledger-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" onClick={onClick} disabled={pending}>
        {pending ? "Exporting…" : "Export Data"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
