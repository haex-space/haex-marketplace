import {
  pgTable,
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Reference to Supabase auth schema
const authSchema = pgSchema("auth");

// Reference to Supabase auth.users table (not managed by Drizzle migrations)
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// Enums
export const extensionStatusEnum = pgEnum("extension_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "unlisted",
]);

export const versionStatusEnum = pgEnum("version_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
]);

// Publishers (developers who publish extensions)
export const publishers = pgTable(
  "publishers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    slug: text("slug").notNull(), // URL-safe identifier (e.g., "haex-space")
    description: text("description"),
    website: text("website"),
    email: text("email"),
    verified: boolean("verified").default(false).notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("publishers_user_id_idx").on(table.userId),
    uniqueIndex("publishers_slug_idx").on(table.slug),
  ]
);

// Categories for extensions
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    icon: text("icon"), // Icon identifier
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("categories_slug_idx").on(table.slug)]
);

// Extensions (the main extension entity)
export const extensions = pgTable(
  "extensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publisherId: uuid("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),

    // Extension identifier (matches manifest)
    extensionId: text("extension_id").notNull(), // e.g., "haex-pass"
    publicKey: text("public_key").notNull(), // Public key for verification

    // Metadata
    name: text("name").notNull(),
    slug: text("slug").notNull(), // URL-safe (e.g., "haex-pass")
    shortDescription: text("short_description").notNull(), // Max ~150 chars for listings
    description: text("description").notNull(), // Full markdown description
    iconUrl: text("icon_url"),

    // Status
    status: extensionStatusEnum("status").default("draft").notNull(),
    verified: boolean("verified").default(false).notNull(), // Official/verified badge

    // Stats (denormalized for performance)
    totalDownloads: integer("total_downloads").default(0).notNull(),
    averageRating: integer("average_rating"), // Stored as 0-500 (0.0-5.0 * 100)
    reviewCount: integer("review_count").default(0).notNull(),

    // Tags for search
    tags: text("tags").array(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("extensions_slug_idx").on(table.slug),
    uniqueIndex("extensions_public_key_idx").on(table.publicKey),
    index("extensions_publisher_idx").on(table.publisherId),
    index("extensions_category_idx").on(table.categoryId),
    index("extensions_status_idx").on(table.status),
    index("extensions_downloads_idx").on(table.totalDownloads),
  ]
);

// Extension versions
export const extensionVersions = pgTable(
  "extension_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extensionId: uuid("extension_id")
      .notNull()
      .references(() => extensions.id, { onDelete: "cascade" }),

    // Version info
    version: text("version").notNull(), // Semver (e.g., "1.0.0")
    changelog: text("changelog"),

    // Bundle storage
    bundlePath: text("bundle_path").notNull(), // Path in Supabase Storage
    bundleSize: integer("bundle_size").notNull(), // Size in bytes
    bundleHash: text("bundle_hash").notNull(), // SHA-256 hash for integrity

    // Manifest snapshot (stored for historical reference)
    manifest: jsonb("manifest").notNull(),

    // Compatibility
    minAppVersion: text("min_app_version"), // Minimum haex-vault version
    maxAppVersion: text("max_app_version"), // Maximum haex-vault version

    // Permissions required by this version
    permissions: text("permissions").array(),

    // Status
    status: versionStatusEnum("status").default("draft").notNull(),

    // Downloads for this specific version
    downloads: integer("downloads").default(0).notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("extension_versions_unique_idx").on(
      table.extensionId,
      table.version
    ),
    index("extension_versions_extension_idx").on(table.extensionId),
    index("extension_versions_status_idx").on(table.status),
  ]
);

// Extension screenshots
export const extensionScreenshots = pgTable(
  "extension_screenshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extensionId: uuid("extension_id")
      .notNull()
      .references(() => extensions.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("extension_screenshots_extension_idx").on(table.extensionId)]
);

// Extension reviews
export const extensionReviews = pgTable(
  "extension_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extensionId: uuid("extension_id")
      .notNull()
      .references(() => extensions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(), // 1-5
    title: text("title"),
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("extension_reviews_user_extension_idx").on(
      table.extensionId,
      table.userId
    ),
    index("extension_reviews_extension_idx").on(table.extensionId),
    index("extension_reviews_rating_idx").on(table.rating),
  ]
);

// Extension downloads (for analytics)
export const extensionDownloads = pgTable(
  "extension_downloads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extensionId: uuid("extension_id")
      .notNull()
      .references(() => extensions.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => extensionVersions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }), // Nullable for anonymous downloads
    ipHash: text("ip_hash"), // Hashed IP for rate limiting (privacy-preserving)
    userAgent: text("user_agent"),
    platform: text("platform"), // "windows", "macos", "linux", "android", "ios"
    appVersion: text("app_version"), // haex-vault version
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("extension_downloads_extension_idx").on(table.extensionId),
    index("extension_downloads_version_idx").on(table.versionId),
    index("extension_downloads_created_idx").on(table.createdAt),
  ]
);

// Type exports
export type Publisher = typeof publishers.$inferSelect;
export type NewPublisher = typeof publishers.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Extension = typeof extensions.$inferSelect;
export type NewExtension = typeof extensions.$inferInsert;

export type ExtensionVersion = typeof extensionVersions.$inferSelect;
export type NewExtensionVersion = typeof extensionVersions.$inferInsert;

export type ExtensionScreenshot = typeof extensionScreenshots.$inferSelect;
export type NewExtensionScreenshot = typeof extensionScreenshots.$inferInsert;

export type ExtensionReview = typeof extensionReviews.$inferSelect;
export type NewExtensionReview = typeof extensionReviews.$inferInsert;

export type ExtensionDownload = typeof extensionDownloads.$inferSelect;
export type NewExtensionDownload = typeof extensionDownloads.$inferInsert;

// Relations
export const publishersRelations = relations(publishers, ({ many }) => ({
  extensions: many(extensions),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  extensions: many(extensions),
}));

export const extensionsRelations = relations(extensions, ({ one, many }) => ({
  publisher: one(publishers, {
    fields: [extensions.publisherId],
    references: [publishers.id],
  }),
  category: one(categories, {
    fields: [extensions.categoryId],
    references: [categories.id],
  }),
  versions: many(extensionVersions),
  screenshots: many(extensionScreenshots),
  reviews: many(extensionReviews),
}));

export const extensionVersionsRelations = relations(extensionVersions, ({ one }) => ({
  extension: one(extensions, {
    fields: [extensionVersions.extensionId],
    references: [extensions.id],
  }),
}));

export const extensionScreenshotsRelations = relations(extensionScreenshots, ({ one }) => ({
  extension: one(extensions, {
    fields: [extensionScreenshots.extensionId],
    references: [extensions.id],
  }),
}));

export const extensionReviewsRelations = relations(extensionReviews, ({ one }) => ({
  extension: one(extensions, {
    fields: [extensionReviews.extensionId],
    references: [extensions.id],
  }),
}));

export const extensionDownloadsRelations = relations(extensionDownloads, ({ one }) => ({
  extension: one(extensions, {
    fields: [extensionDownloads.extensionId],
    references: [extensions.id],
  }),
  version: one(extensionVersions, {
    fields: [extensionDownloads.versionId],
    references: [extensionVersions.id],
  }),
}));
