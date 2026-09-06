"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortfolioAccountFormSheet } from "@/components/portfolio-account-form-sheet";
import { FolioFormSheet } from "@/components/folio-form-sheet";
import { previewTradebookImportAction, runTradebookImportAction } from "@/server/actions/tradebookImport";
import type { TradebookImportPreview, TradebookImportResult } from "@/server/services/tradebookImport";

export interface TradebookPortfolioAccount {
  id: string;
  name: string;
  folios: { id: string; number: string }[];
}

// Upload -> Parse -> Preview -> Validate -> Commit, same two-step shape as
// `CasImportForm` — the one thing a tradebook needs that a CAS doesn't: a
// PortfolioAccount+Folio picker, since a tradebook carries no account
// identity of its own to resolve from (Stock tradebook import plan,
// 2026-09-06). "+ New" reuses the exact Sheets already built for
// /portfolio/accounts — creating one there calls `router.refresh()`
// itself, which re-fetches this page's `accounts` prop from the server, so
// the new option just appears in the Select below without any extra
// plumbing here.
export function TradebookImportForm({ accounts }: { accounts: TradebookPortfolioAccount[] }) {
  const router = useRouter();
  const [portfolioAccountId, setPortfolioAccountId] = useState("");
  const [folioId, setFolioId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TradebookImportPreview | null>(null);
  const [result, setResult] = useState<TradebookImportResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = accounts.find((a) => a.id === portfolioAccountId);
  const canReview = Boolean(file && folioId);

  function buildFormData(): FormData {
    const formData = new FormData();
    if (file) formData.set("file", file);
    formData.set("portfolioAccountId", portfolioAccountId);
    formData.set("folioId", folioId);
    return formData;
  }

  const onAccountChange = (value: string | null) => {
    setPortfolioAccountId(value ?? "");
    setFolioId("");
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const onPreview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canReview) return;
    setError(null);
    setPending(true);
    const actionResult = await previewTradebookImportAction(buildFormData());
    setPending(false);
    if (!actionResult.success) {
      setError(actionResult.error);
      return;
    }
    setPreview(actionResult.data);
  };

  const onImport = async () => {
    setError(null);
    setPending(true);
    const actionResult = await runTradebookImportAction(buildFormData());
    setPending(false);
    if (!actionResult.success) {
      setError(actionResult.error);
      return;
    }
    setResult(actionResult.data);
    setPreview(null);
    setFile(null);
    router.refresh();
  };

  if (preview) {
    const hasWarnings = preview.unresolvedCount > 0 || preview.duplicateCount > 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">File: {file?.name}</p>
          <p className="text-muted-foreground">
            Into {selectedAccount?.name} · {accounts.flatMap((a) => a.folios).find((f) => f.id === folioId)?.number}
          </p>

          <div>
            <p className="text-muted-foreground">Found</p>
            <p>
              {preview.transactionCount} transaction{preview.transactionCount === 1 ? "" : "s"}
            </p>
          </div>

          {hasWarnings && (
            <div>
              <p className="text-muted-foreground">Warnings</p>
              {preview.unresolvedCount > 0 && (
                <p>
                  {preview.unresolvedCount} row{preview.unresolvedCount === 1 ? "" : "s"} with no ISIN — will be
                  skipped
                </p>
              )}
              {preview.duplicateCount > 0 && (
                <p>
                  {preview.duplicateCount} transaction{preview.duplicateCount === 1 ? "" : "s"} already imported —
                  won&apos;t be duplicated
                </p>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={pending}>
            Back
          </Button>
          <Button type="button" onClick={onImport} disabled={pending}>
            {pending ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onPreview} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tradebook-account">Portfolio Account</Label>
        <div className="flex gap-2">
          <Select value={portfolioAccountId} onValueChange={onAccountChange}>
            <SelectTrigger id="tradebook-account" className="flex-1">
              <SelectValue placeholder="Select an account">
                {(value: string) => accounts.find((a) => a.id === value)?.name ?? "Select an account"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PortfolioAccountFormSheet />
        </div>
      </div>

      {portfolioAccountId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tradebook-folio">Demat account (Folio)</Label>
          <div className="flex gap-2">
            <Select value={folioId} onValueChange={(value) => setFolioId(value ?? "")}>
              <SelectTrigger id="tradebook-folio" className="flex-1">
                <SelectValue placeholder="Select a demat account">
                  {(value: string) => selectedAccount?.folios.find((f) => f.id === value)?.number ?? "Select a demat account"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {selectedAccount?.folios.map((folio) => (
                  <SelectItem key={folio.id} value={folio.id}>
                    {folio.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FolioFormSheet portfolioAccountId={portfolioAccountId} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tradebook-file">Tradebook (CSV)</Label>
        <Input id="tradebook-file" name="file" type="file" accept=".csv" required onChange={onFileChange} />
        <p className="text-xs text-muted-foreground">
          Equity delivery trades only — export from your broker (e.g. Zerodha Console &gt; Reports &gt;
          Tradebook &gt; Equity &gt; CSV). Processed locally on this machine.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <p className="text-sm text-muted-foreground">
          Imported {result.transactionsCreated} transaction{result.transactionsCreated === 1 ? "" : "s"}
          {result.transactionsSkipped > 0 ? ` (${result.transactionsSkipped} skipped)` : ""}.
        </p>
      )}

      <Button type="submit" disabled={pending || !canReview}>
        {pending ? "Reviewing…" : "Review"}
      </Button>
    </form>
  );
}
