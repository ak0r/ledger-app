import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/app-schema.ts",
  out: "./src/server/db/app-migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/app.db",
  },
});
