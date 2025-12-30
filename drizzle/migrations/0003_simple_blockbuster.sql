CREATE TABLE "publisher_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publisher_api_keys" ADD CONSTRAINT "publisher_api_keys_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publisher_api_keys_publisher_idx" ON "publisher_api_keys" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "publisher_api_keys_hash_idx" ON "publisher_api_keys" USING btree ("key_hash");