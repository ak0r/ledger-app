import { db } from "@/server/persistence/client";
import { requireActiveProfile } from "@/server/authz";
import { listPortfolioAccounts } from "@/server/services/portfolioAccounts";
import { listFolios } from "@/server/services/folios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PortfolioAccountFormSheet } from "@/components/portfolio-account-form-sheet";
import { FolioFormSheet } from "@/components/folio-form-sheet";
import { humanizeEnum } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Portfolio Accounts / Folios (Portfolio Adoption Plan §2) —
// PortfolioAccount -> Folio, one card per broker/RTA-level account with its
// Folios listed inside. No edit/delete yet (V1, create-only).
export default async function PortfolioAccountsPage() {
  const { profile } = await requireActiveProfile();
  const accounts = listPortfolioAccounts(db, profile.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Portfolio Accounts</h1>
        <PortfolioAccountFormSheet />
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Portfolio Accounts yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => {
            const folios = listFolios(db, account.id);
            return (
              <Card key={account.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{account.name}</CardTitle>
                    <Badge variant="outline">{humanizeEnum(account.type)}</Badge>
                  </div>
                  {account.provider && <CardDescription>{account.provider}</CardDescription>}
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {folios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No Folios yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {folios.map((folio) => (
                        <li key={folio.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{folio.number}</span>
                          {folio.amcCode && <span className="text-muted-foreground">{folio.amcCode}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <FolioFormSheet portfolioAccountId={account.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
