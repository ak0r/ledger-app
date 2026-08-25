"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CLASSIFICATIONS,
  CREATABLE_CLASSIFICATIONS,
  INSTRUMENT_TYPES,
  TYPES_BY_CLASSIFICATION,
  type Classification,
  type InstrumentType,
} from "@/domain";
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

// The instrument type a Classification lands on when it has no real Type
// step of its own (2026-08-19 delta §19.1 — Income/Expense have no Account
// Type, Balancing is system-managed) — same single value that classification
// has always used (`INCOME`/`EXPENSE`/`BALANCING`), just made explicit now
// that there's no picker for the user to (implicitly) confirm it through.
function defaultInstrumentTypeFor(classification: Classification): InstrumentType {
  const types = TYPES_BY_CLASSIFICATION[classification];
  if (types) return types[0];
  return classification === "INCOME" ? "INCOME" : classification === "EXPENSE" ? "EXPENSE" : "BALANCING";
}

interface AccountFormProps {
  profileId: string;
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
  // Sheet-usage-only (edit-visual-behaviour delta §12) — the wrapping Sheet
  // gates its own close attempts on this rather than the form owning any
  // "are you sure" UI itself, so the confirmation pattern lives in exactly
  // one place (`AccountFormSheet`) instead of duplicated per form.
  onDirtyChange?: (dirty: boolean) => void;
}

export function AccountForm({
  profileId,
  currencies,
  mode,
  existingTags = [],
  account,
  onSuccess,
  onCancel,
  onDirtyChange,
}: AccountFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(account?.tags ?? []);
  const [icon, setIcon] = useState<string | undefined>(account?.icon ?? undefined);
  // `tags`/`icon` live outside react-hook-form (plain useState, same as
  // ever) — `formState.isDirty` below only tracks RHF-registered fields,
  // so a Tags/Icon-only change needs its own comparison against the
  // initial values to count as "dirty" too. `useRef` so the *initial*
  // value stays stable across re-renders (not re-captured every render).
  const initialTags = useRef(account?.tags ?? []).current;
  const initialIcon = useRef(account?.icon ?? undefined).current;
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty: fieldsAreDirty },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    // Every registered field path must appear here, even for create mode
    // — a key missing from defaultValues but present on the rendered form
    // makes react-hook-form's `formState.isDirty` true from the very first
    // render, before any user interaction (see TransactionForm's identical
    // fix/comment for the full mechanism). `name` was missing here.
    defaultValues: account
      ? {
          name: account.name,
          currencyId: account.currencyId,
          classification: account.classification,
          instrumentType: account.instrumentType,
        }
      : {
          name: "",
          currencyId: currencies[0]?.id ?? "",
          classification: "ASSET",
          instrumentType: defaultInstrumentTypeFor("ASSET"),
        },
  });

  const tagsChanged =
    tags.length !== initialTags.length || tags.some((tag, index) => tag !== initialTags[index]);
  const isDirty = fieldsAreDirty || tagsChanged || icon !== initialIcon;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const classification = watch("classification");
  // `undefined` for Income/Expense/Balancing — absence from the map *is*
  // the "no Type step for this classification" signal (domain's own doc
  // comment on TYPES_BY_CLASSIFICATION).
  const typeOptions = TYPES_BY_CLASSIFICATION[classification];
  // Editing an account whose classification is Balancing (only ever the
  // one seeded "Opening Balance" account) shows Classification as static
  // text instead of the picker — see the JSX below.
  const isEditingBalancing = mode === "edit" && account?.classification === "BALANCING";

  const onSubmit = async (values: AccountFormValues) => {
    setServerError(null);

    const result =
      mode === "create"
        ? await createAccountAction(profileId, {
            profileId,
            currencyId: values.currencyId,
            name: values.name,
            classification: values.classification,
            instrumentType: values.instrumentType,
            tags: tags.length > 0 ? tags : undefined,
            icon,
          })
        : await editAccountAction(profileId, {
            profileId,
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
      router.push(`/p/${profileId}/accounts`);
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
        {isEditingBalancing ? (
          // Balancing is system-managed (the one seeded "Opening Balance"
          // account) — not reassignable to/from via the normal picker,
          // same "not editable" pattern as Currency above.
          <p className="text-sm text-muted-foreground">Balancing — not editable</p>
        ) : (
          <Controller
            control={control}
            name="classification"
            render={({ field }) => (
              <ClassificationCards
                name="classification"
                value={field.value}
                classifications={CREATABLE_CLASSIFICATIONS}
                onChange={(next) => {
                  field.onChange(next);
                  setValue("instrumentType", defaultInstrumentTypeFor(next));
                }}
              />
            )}
          />
        )}
      </div>

      {/* Only Asset/Liability have a real Type step (2026-08-19 delta
          §19.1) — Income/Expense go straight from Classification to Name/
          Currency, no Account Type field at all. */}
      {typeOptions && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-type">Account Type</Label>
          <Controller
            control={control}
            name="instrumentType"
            render={({ field }) => (
              // `key={classification}` forces a fresh base-ui Select
              // instance whenever the option set actually changes —
              // `SelectContent`'s children are an entirely different key
              // set per classification (no shared `SelectItem` keys to
              // reconcile against), and reusing the same Select instance
              // across that swap left it permanently showing a blank
              // trigger after the value changed underneath it (reproduced
              // via a real Asset→Liability switch: not just the one-frame
              // `null` the `SelectValue` fallback above guards against —
              // the trigger stayed blank indefinitely). A fresh instance
              // per classification sidesteps whatever internal state
              // caused that rather than fighting it.
              <Select key={classification} value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="account-type">
                  {/* `value` can still be `null` for the instance's first
                      render, briefly, before react-hook-form's `setValue`
                      call (which resets `instrumentType` to match the new
                      classification) commits — base-ui passes `null` here
                      rather than an unmatched string in that window. */}
                  <SelectValue>{(value: string | null) => (value ? humanizeEnum(value) : "")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanizeEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

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
                ? `/p/${profileId}/accounts/${account.id}`
                : `/p/${profileId}/accounts`
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
