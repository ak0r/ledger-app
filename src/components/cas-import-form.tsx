"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previewCasImportAction, runCasImportAction } from "@/server/actions/casImport";
import type { CasImportPreview, CasImportResult } from "@/server/services/casImport";

// Upload -> Parse -> Preview -> Validate -> Commit (UX review, 2026-09-05
// accepted correction) — mirrors the shape of Ledger's own bank-statement
// import (upload -> review -> approve), scaled down: Portfolio import has
// nothing to edit row-by-row, so its "review" is the counts+warnings
// summary below, not a transaction table. `file`/`password` live in React
// state rather than the DOM form so the exact same upload can be re-sent
// for the real commit after the user confirms the preview, without asking
// them to pick the file twice.
export function CasImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<CasImportPreview | null>(null);
  const [result, setResult] = useState<CasImportResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildFormData(): FormData {
    const formData = new FormData();
    if (file) formData.set("file", file);
    formData.set("password", password);
    return formData;
  }

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const onPreview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setPending(true);
    const actionResult = await previewCasImportAction(buildFormData());
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
    const actionResult = await runCasImportAction(buildFormData());
    setPending(false);
    if (!actionResult.success) {
      setError(actionResult.error);
      return;
    }
    setResult(actionResult.data);
    setPreview(null);
    setFile(null);
    setPassword("");
    router.refresh();
  };

  if (preview) {
    const hasWarnings = preview.unresolvedSchemeCount > 0 || preview.duplicateCount > 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">Statement: {file?.name}</p>

          <div>
            <p className="text-muted-foreground">Found</p>
            <p>
              {preview.folioCount} folio{preview.folioCount === 1 ? "" : "s"} · {preview.mutualFundCount} mutual
              fund{preview.mutualFundCount === 1 ? "" : "s"} · {preview.transactionCount} transaction
              {preview.transactionCount === 1 ? "" : "s"}
            </p>
          </div>

          {hasWarnings && (
            <div>
              <p className="text-muted-foreground">Warnings</p>
              {preview.unresolvedSchemeCount > 0 && (
                <p>
                  {preview.unresolvedSchemeCount} scheme{preview.unresolvedSchemeCount === 1 ? "" : "s"} with no ISIN
                  or AMFI code — its transactions will be skipped
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
        <Label htmlFor="cas-file">CAS PDF (CAMS / KFin)</Label>
        <Input id="cas-file" name="file" type="file" accept="application/pdf" required onChange={onFileChange} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cas-password">PDF password</Label>
        <Input
          id="cas-password"
          name="password"
          type="password"
          placeholder="Usually your PAN"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Processed locally on this machine — never sent anywhere else.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <p className="text-sm text-muted-foreground">
          Imported {result.transactionsCreated} transaction{result.transactionsCreated === 1 ? "" : "s"} across{" "}
          {result.schemesProcessed} scheme{result.schemesProcessed === 1 ? "" : "s"}
          {result.transactionsSkipped > 0 ? ` (${result.transactionsSkipped} skipped)` : ""}.
        </p>
      )}

      <Button type="submit" disabled={pending || !file}>
        {pending ? "Reviewing…" : "Review"}
      </Button>
    </form>
  );
}
