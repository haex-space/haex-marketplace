import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = postgres(connectionString);

console.log("Applying RLS policies...");

const rlsSQL = readFileSync(join(import.meta.dir, "../drizzle/rls-policies.sql"), "utf-8");

await client.unsafe(rlsSQL);

console.log("RLS policies applied!");

await client.end();
