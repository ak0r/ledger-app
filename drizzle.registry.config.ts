import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/registry-schema.ts",
  out: "./src/server/db/registry-migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/registry.db",
  },
});
