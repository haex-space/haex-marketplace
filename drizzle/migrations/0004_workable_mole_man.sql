DROP INDEX "extensions_public_key_idx";--> statement-breakpoint
CREATE INDEX "extensions_public_key_idx" ON "extensions" USING btree ("public_key");