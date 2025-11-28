import { defineConfig, type Config } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
  // Only include our tables, exclude auth.users (managed by Supabase)
  tablesFilter: [
    "publishers",
    "categories",
    "extensions",
    "extension_versions",
    "extension_screenshots",
    "extension_reviews",
    "extension_downloads",
  ],
}) satisfies Config;
