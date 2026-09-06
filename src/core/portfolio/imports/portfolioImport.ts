// PortfolioImport (Portfolio Adoption Plan §1, "ImportJob adopt now") —
// deliberately simplified from Folioman's ImportJobStatus: no `running`/
// `completed_with_warnings`/`needs_confirmation` states (those exist there
// for async processing, partial-history chaining, and destructive-eCAS
// confirmation — all explicitly deferred, plan §3/§4). V1 runs
// synchronously and reports one of three outcomes.
export const PORTFOLIO_IMPORT_KINDS = ["CAS", "ECAS", "CSV", "MANUAL"] as const;
export type PortfolioImportKind = (typeof PORTFOLIO_IMPORT_KINDS)[number];

export const PORTFOLIO_IMPORT_STATUSES = ["PENDING", "SUCCESS", "FAILED"] as const;
export type PortfolioImportStatus = (typeof PORTFOLIO_IMPORT_STATUSES)[number];
