import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/persistence/schema.ts",
  out: "./src/server/persistence/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/ledger.db",
  },
});
