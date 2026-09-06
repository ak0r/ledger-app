import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Core boundary (AGENTS.md rule #17; docs/06-architecture.md "Domain boundary";
  // analysis/folioman-vs-ledger/08-target-architecture-implementation-plan.md
  // Phase 1a) — src/core (formerly src/domain) is pure TypeScript with zero
  // framework/ORM/DB dependencies, enforced here so the boundary is a
  // build-time guarantee, not a convention.
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "src/core must stay framework-free (docs/06-architecture.md)." },
            { name: "react-dom", message: "src/core must stay framework-free." },
            { name: "next", message: "src/core must stay framework-free." },
            { name: "drizzle-orm", message: "src/core must not depend on the ORM. Persistence belongs in src/server." },
            { name: "better-sqlite3", message: "src/core must not depend on the DB driver." },
          ],
          patterns: [
            { group: ["next/*"], message: "src/core must stay framework-free." },
            {
              group: ["@/server/*", "@/app/*", "../server/*", "../../server/*", "../app/*", "../../app/*"],
              message: "src/core must not import from src/server or src/app.",
            },
          ],
        },
      ],
    },
  },
  // Ledger/Portfolio delink (Ledger/Portfolio Delink decision,
  // analysis/folioman-vs-ledger/06-pwa-validation-and-domain-delink.md) —
  // Portfolio must never depend on Ledger's transaction/posting engine.
  // Enforced from day one, while core/portfolio is still small, specifically
  // so the eventual Portfolio module build can't accidentally reach into
  // core/ledger the way the pre-delink Instrument model did.
  {
    files: ["src/core/portfolio/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/core/ledger", "@/core/ledger/*", "../ledger/*", "../../ledger/*", "../../../ledger/*"],
              message: "core/portfolio must not depend on core/ledger (Ledger/Portfolio delink decision).",
            },
          ],
        },
      ],
    },
  },
  // Host-agnostic application layer (target-architecture Phase 1b,
  // analysis/folioman-vs-ledger/08-target-architecture-implementation-plan.md)
  // — services/repositories/persistence/importers must stay callable by any
  // future host (Desktop), not just Next.js. src/server/actions and src/app/
  // are exempt: they're host-specific glue by design.
  {
    files: ["src/server/{services,repositories,persistence,importers,portfolioImporters,priceFeeds}/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "This layer must stay host-agnostic — no framework coupling." },
          ],
          patterns: [
            {
              group: ["next/*"],
              message: "This layer must stay host-agnostic — Server Actions/Components belong in src/server/actions or src/app.",
            },
            {
              group: ["@/app/*", "@/components/*"],
              message: "This layer must not import the UI/route layer — dependency runs the other way.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Defensive: stray renamed/leftover Next build caches (e.g. from manual
    // recovery after a locked .next directory) should never be linted.
    ".next-*/**",
  ]),
]);

export default eslintConfig;
