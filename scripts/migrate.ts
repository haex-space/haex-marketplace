import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

console.log("🚀 Running migrations...");

await migrate(db, { migrationsFolder: "./drizzle/migrations" });

console.log("✅ Migrations complete!");

// Apply RLS policies (idempotent - can be re-run safely)
console.log("🔒 Applying RLS policies...");
const rlsSQL = readFileSync(join(import.meta.dir, "../drizzle/rls-policies.sql"), "utf-8");
await client.unsafe(rlsSQL);
console.log("✅ RLS policies applied!");

await client.end();
