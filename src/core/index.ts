// Convenience barrel for consumers outside `core/` (server/, components/) that
// legitimately need more than one domain at once (e.g. a transaction use-case
// needs both core/ledger's Transaction validation and core/portfolio's
// Quantity type). Nothing inside core/ imports this file — ledger/, portfolio/,
// and shared/ import each other's specific packages directly (subject to the
// portfolio-must-not-import-ledger ESLint rule), never through this umbrella.
export * from "./shared";
export * from "./ledger";
export * from "./portfolio";
