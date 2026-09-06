"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previewEcasImportAction, runEcasImportAction } from "@/server/actions/ecasImport";
import type { EcasImportPreview, EcasImportResult } from "@/server/services/ecasImport";

// Same Upload -> Parse -> Preview -> Validate -> Commit shape as
// CasImportForm — an eCAS has no account/folio picker (both are
// auto-resolved from the file's own dp_id/client_id, services/
// ecasImport.ts), so this form is even simpler: PDF + password only.
export function EcasImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<EcasImportPreview | null>(null);
  const [result, setResult] = useState<EcasImportResult | null>(null);
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
    const actionResult = await previewEcasImportAction(buildFormData());
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
    const actionResult = await runEcasImportAction(buildFormData());
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
    const hasWarnings = preview.unresolvedEquityCount > 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">Statement: {file?.name}</p>

          <div>
            <p className="text-muted-foreground">Found</p>
            <p>
              {preview.accountCount} demat account{preview.accountCount === 1 ? "" : "s"} · {preview.equityCount}{" "}
              holding{preview.equityCount === 1 ? "" : "s"}
            </p>
          </div>

          {preview.dematAccountNumbers.length > 0 && (
            <div>
              <p className="text-muted-foreground">Demat account{preview.dematAccountNumbers.length === 1 ? "" : "s"}</p>
              <p className="font-mono text-xs">{preview.dematAccountNumbers.join(", ")}</p>
            </div>
          )}

          {hasWarnings && (
            <div>
              <p className="text-muted-foreground">Warnings</p>
              <p>
                {preview.unresolvedEquityCount} holding{preview.unresolvedEquityCount === 1 ? "" : "s"} with no ISIN —
                will be skipped
              </p>
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
        <Label htmlFor="ecas-file">Demat eCAS PDF (NSDL / CDSL)</Label>
        <Input id="ecas-file" name="file" type="file" accept="application/pdf" required onChange={onFileChange} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ecas-password">PDF password</Label>
        <Input
          id="ecas-password"
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
        <div className="text-sm text-muted-foreground">
          <p>
            Recorded {result.holdingsRecorded} holding{result.holdingsRecorded === 1 ? "" : "s"} across{" "}
            {result.accountsProcessed} demat account{result.accountsProcessed === 1 ? "" : "s"}
            {result.equitiesSkipped > 0 ? ` (${result.equitiesSkipped} skipped)` : ""}.
          </p>
          {result.dematAccountNumbers.length > 0 && (
            <p className="mt-1">
              To match this against a tradebook import, use the same demat account number as its Folio:{" "}
              <span className="font-mono">{result.dematAccountNumbers.join(", ")}</span>
            </p>
          )}
        </div>
      )}

      <Button type="submit" disabled={pending || !file}>
        {pending ? "Reviewing…" : "Review"}
      </Button>
    </form>
  );
}
