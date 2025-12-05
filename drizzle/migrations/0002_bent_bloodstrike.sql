-- Drop RLS policies that depend on status column
DROP POLICY IF EXISTS "Extension versions are readable" ON extension_versions;--> statement-breakpoint
DROP POLICY IF EXISTS "Extensions are readable" ON extensions;--> statement-breakpoint

-- Drop indexes
DROP INDEX IF EXISTS "extension_versions_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "extensions_status_idx";--> statement-breakpoint

-- Drop status columns
ALTER TABLE "extension_versions" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
ALTER TABLE "extensions" DROP COLUMN IF EXISTS "status";--> statement-breakpoint

-- Drop enum types
DROP TYPE IF EXISTS "public"."extension_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."version_status";--> statement-breakpoint

-- Recreate RLS policies without status
CREATE POLICY "Extension versions are readable"
  ON extension_versions FOR SELECT
  USING (
    extension_id IN (
      SELECT e.id FROM extensions e
      JOIN publishers p ON e.publisher_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
    OR true
  );--> statement-breakpoint

CREATE POLICY "Extensions are readable"
  ON extensions FOR SELECT
  USING (true);