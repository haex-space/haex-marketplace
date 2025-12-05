DROP INDEX "extension_versions_status_idx";--> statement-breakpoint
DROP INDEX "extensions_status_idx";--> statement-breakpoint
ALTER TABLE "extension_versions" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "extensions" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."extension_status";--> statement-breakpoint
DROP TYPE "public"."version_status";