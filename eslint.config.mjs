import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Domain boundary (AGENTS.md rule #17; docs/06-architecture.md "Domain boundary").
  // src/domain is pure TypeScript with zero framework/ORM/DB dependencies —
  // enforced here so the boundary is a build-time guarantee, not a convention.
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "src/domain must stay framework-free (docs/06-architecture.md)." },
            { name: "react-dom", message: "src/domain must stay framework-free." },
            { name: "next", message: "src/domain must stay framework-free." },
            { name: "drizzle-orm", message: "src/domain must not depend on the ORM. Persistence belongs in src/server." },
            { name: "better-sqlite3", message: "src/domain must not depend on the DB driver." },
          ],
          patterns: [
            { group: ["next/*"], message: "src/domain must stay framework-free." },
            {
              group: ["@/server/*", "@/app/*", "../server/*", "../../server/*", "../app/*", "../../app/*"],
              message: "src/domain must not import from src/server or src/app.",
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
