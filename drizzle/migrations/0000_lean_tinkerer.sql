-- Note: auth.users table already exists in Supabase, we only reference it

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS "extension_downloads" CASCADE;
DROP TABLE IF EXISTS "extension_reviews" CASCADE;
DROP TABLE IF EXISTS "extension_screenshots" CASCADE;
DROP TABLE IF EXISTS "extension_versions" CASCADE;
DROP TABLE IF EXISTS "extensions" CASCADE;
DROP TABLE IF EXISTS "publishers" CASCADE;
DROP TABLE IF EXISTS "categories" CASCADE;
DROP TABLE IF EXISTS "public"."users" CASCADE;
DROP TYPE IF EXISTS "extension_status" CASCADE;
DROP TYPE IF EXISTS "version_status" CASCADE;
--> statement-breakpoint

CREATE TYPE "public"."extension_status" AS ENUM('draft', 'pending_review', 'published', 'rejected', 'unlisted');
--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'pending_review', 'published', 'rejected');
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"user_id" uuid,
	"ip_hash" text,
	"user_agent" text,
	"platform" text,
	"app_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_id" uuid NOT NULL,
	"version" text NOT NULL,
	"changelog" text,
	"bundle_path" text NOT NULL,
	"bundle_size" integer NOT NULL,
	"bundle_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"min_app_version" text,
	"max_app_version" text,
	"permissions" text[],
	"status" "version_status" DEFAULT 'draft' NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"category_id" uuid,
	"extension_id" text NOT NULL,
	"public_key" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"short_description" text NOT NULL,
	"description" text NOT NULL,
	"icon_url" text,
	"status" "extension_status" DEFAULT 'draft' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"total_downloads" integer DEFAULT 0 NOT NULL,
	"average_rating" integer,
	"review_count" integer DEFAULT 0 NOT NULL,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "publishers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"website" text,
	"email" text,
	"verified" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extension_downloads" ADD CONSTRAINT "extension_downloads_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_downloads" ADD CONSTRAINT "extension_downloads_version_id_extension_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."extension_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_downloads" ADD CONSTRAINT "extension_downloads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_reviews" ADD CONSTRAINT "extension_reviews_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_reviews" ADD CONSTRAINT "extension_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_screenshots" ADD CONSTRAINT "extension_screenshots_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_versions" ADD CONSTRAINT "extension_versions_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extensions" ADD CONSTRAINT "extensions_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extensions" ADD CONSTRAINT "extensions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishers" ADD CONSTRAINT "publishers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "extension_downloads_extension_idx" ON "extension_downloads" USING btree ("extension_id");--> statement-breakpoint
CREATE INDEX "extension_downloads_version_idx" ON "extension_downloads" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "extension_downloads_created_idx" ON "extension_downloads" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "extension_reviews_user_extension_idx" ON "extension_reviews" USING btree ("extension_id","user_id");--> statement-breakpoint
CREATE INDEX "extension_reviews_extension_idx" ON "extension_reviews" USING btree ("extension_id");--> statement-breakpoint
CREATE INDEX "extension_reviews_rating_idx" ON "extension_reviews" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "extension_screenshots_extension_idx" ON "extension_screenshots" USING btree ("extension_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extension_versions_unique_idx" ON "extension_versions" USING btree ("extension_id","version");--> statement-breakpoint
CREATE INDEX "extension_versions_extension_idx" ON "extension_versions" USING btree ("extension_id");--> statement-breakpoint
CREATE INDEX "extension_versions_status_idx" ON "extension_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "extensions_slug_idx" ON "extensions" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "extensions_public_key_idx" ON "extensions" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "extensions_publisher_idx" ON "extensions" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "extensions_category_idx" ON "extensions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "extensions_status_idx" ON "extensions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "extensions_downloads_idx" ON "extensions" USING btree ("total_downloads");--> statement-breakpoint
CREATE UNIQUE INDEX "publishers_user_id_idx" ON "publishers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publishers_slug_idx" ON "publishers" USING btree ("slug");