"use client";

import { buttonVariants } from "@/components/ui/button";
import { useTransactionWorkspace } from "@/components/transaction-workspace";

// Opens TransactionCreateDrawer — a client component wrapper because
// transactions/page.tsx (server component) can't call openCreateTransaction
// directly from an onClick (same pattern as other page-level triggers this
// session).
export function TransactionCreateTrigger() {
  const { openCreateTransaction } = useTransactionWorkspace();
  return (
    <button type="button" className={buttonVariants()} onClick={openCreateTransaction}>
      New Transaction
    </button>
  );
}
