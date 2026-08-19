"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CLASSIFICATIONS, INSTRUMENT_TYPES, type Classification, type InstrumentType } from "@/domain";
import { humanizeEnum } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClassificationCards } from "@/components/classification-cards";
import { TagInput } from "@/components/tag-input";
import { IconPicker } from "@/components/icon-picker";
import { createAccountAction, editAccountAction } from "@/server/actions/accounts";

// Client-local schema — shape-only, for fast UX feedback. The real
// enforcement point is createAccountSchema/editAccountSchema in
// src/server/actions/schemas.ts, run again inside the Server Action
// (rule #17). No Label/Opening-balance fields (product-polish pass): an
// opening balance is a normal double-entry Transaction, not special
// Account-creation state (see src/server/use-cases/accounts.ts).
const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  currencyId: z.string().min(1, "Currency is required"),
  classification: z.enum(CLASSIFICATIONS),
  instrumentType: z.enum(INSTRUMENT_TYPES),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

interface AccountFormProps {
  familyId: string;
  memberId: string;
  currencies: { id: string; code: string; symbol: string; minorUnitScale: number }[];
  mode: "create" | "edit";
  existingTags?: string[];
  account?: {
    id: string;
    currencyId: string;
    currencyCode: string;
    name: string;
    classification: Classification;
    instrumentType: InstrumentType;
    tags: string[] | null;
    icon: string | null;
  };
  // Modal usage (AccountFormSheet) passes these to close itself instead of
  // navigating — same optional-override posture as TransactionForm's own
  // onCancel/onSuccess (transaction-edit-drawer.tsx). Page usages
  // (accounts/new, accounts/[id]/settings) omit them and keep the original
  // router.push behavior unchanged.
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AccountForm({
  familyId,
  memberId,
  currencies,
  mode,
  existingTags = [],
  account,
  onSuccess,
  onCancel,
}: AccountFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(account?.tags ?? []);
  const [icon, setIcon] = useState<string | undefined>(account?.icon ?? undefined);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: account
      ? {
          name: account.name,
          currencyId: account.currencyId,
          classification: account.classification,
          instrumentType: account.instrumentType,
        }
      : {
          currencyId: currencies[0]?.id ?? "",
          classification: "ASSET",
          instrumentType: "BANK",
        },
  });

  const onSubmit = async (values: AccountFormValues) => {
    setServerError(null);

    const result =
      mode === "create"
        ? await createAccountAction(familyId, {
            memberId,
            currencyId: values.currencyId,
            name: values.name,
            classification: values.classification,
            instrumentType: values.instrumentType,
            tags: tags.length > 0 ? tags : undefined,
            icon,
          })
        : await editAccountAction(familyId, {
            memberId,
            accountId: account?.id,
            name: values.name,
            classification: values.classification,
            instrumentType: values.instrumentType,
            tags: tags.length > 0 ? tags : undefined,
            icon,
          });

    if (!result.success) {
      setServerError(result.error);
      return;
    }
    if (onSuccess) {
      onSuccess();
    } else {
      router.push(`/f/${familyId}/m/${memberId}/accounts`);
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input id="account-name" placeholder="e.g. HDFC Bank" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      {mode === "create" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-currency">Currency</Label>
          <Controller
            control={control}
            name="currencyId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="account-currency">
                  <SelectValue placeholder="Select a currency">
                    {(value: string) => {
                      const currency = currencies.find((c) => c.id === value);
                      return currency ? `${currency.code} (${currency.symbol})` : "Select a currency";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.id} value={currency.id}>
                      {currency.code} ({currency.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      ) : (
        account && (
          <div className="flex flex-col gap-1.5">
            <Label>Currency</Label>
            <p className="text-sm text-muted-foreground">{account.currencyCode} — not editable</p>
          </div>
        )
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Classification</Label>
        <Controller
          control={control}
          name="classification"
          render={({ field }) => (
            <ClassificationCards name="classification" value={field.value} onChange={field.onChange} />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-type">Account Type</Label>
        <Controller
          control={control}
          name="instrumentType"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="account-type">
                <SelectValue>{(value: string) => humanizeEnum(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INSTRUMENT_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanizeEnum(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Icon</Label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Tags</Label>
        <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      {/* Explicit Save/Cancel pair (docs/design/design.md §12). Cancel
          returns to the account detail page when editing (nothing to roll
          back — no persisted draft, ADR-023), or the list when creating —
          unless `onCancel` overrides it (modal usage). */}
      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Link
            href={
              mode === "edit" && account
                ? `/f/${familyId}/m/${memberId}/accounts/${account.id}`
                : `/f/${familyId}/m/${memberId}/accounts`
            }
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Saving…" : mode === "create" ? "Create account" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
