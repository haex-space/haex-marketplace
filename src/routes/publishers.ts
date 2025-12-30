import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { db, publishers, extensions, publisherApiKeys } from "../db/index.ts";
import { eq, sql, desc, and } from "drizzle-orm";
import { requireAuthAsync } from "../middleware/auth.ts";
import type { AuthVariables } from "../middleware/auth.ts";

const app = new Hono<{ Variables: AuthVariables }>();

// Schema for creating/updating publisher
const publisherSchema = z.object({
  displayName: z.string().min(2).max(50),
  slug: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500).optional(),
  website: z.string().url().optional(),
  email: z.string().email().optional(),
});

const updatePublisherSchema = publisherSchema.partial();

/**
 * GET /publishers
 * List all publishers
 */
app.get("/", async (c) => {
  const page = Number(c.req.query("page") || "1");
  const limit = Math.min(Number(c.req.query("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  const results = await db.query.publishers.findMany({
    orderBy: [desc(publishers.createdAt)],
    limit,
    offset,
    columns: {
      id: true,
      displayName: true,
      slug: true,
      description: true,
      website: true,
      verified: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(publishers);
  const total = Number(countResult[0]?.count ?? 0);

  return c.json({
    publishers: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /publishers/me
 * Get current user's publisher profile
 * NOTE: This route MUST be defined before /:slug to avoid being caught by the wildcard
 */
app.get("/me", requireAuthAsync, async (c) => {
  const user = c.get("user");

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.userId, user.id),
  });

  if (!publisher) {
    return c.json({ error: "No publisher profile found" }, 404);
  }

  return c.json({ publisher });
});

/**
 * GET /publishers/:slug
 * Get publisher by slug with their extensions
 */
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.slug, slug),
    columns: {
      id: true,
      displayName: true,
      slug: true,
      description: true,
      website: true,
      verified: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  if (!publisher) {
    return c.json({ error: "Publisher not found" }, 404);
  }

  // Get publisher's extensions
  const publisherExtensions = await db.query.extensions.findMany({
    where: eq(extensions.publisherId, publisher.id),
    orderBy: [desc(extensions.totalDownloads)],
    columns: {
      id: true,
      name: true,
      slug: true,
      shortDescription: true,
      iconUrl: true,
      verified: true,
      totalDownloads: true,
      averageRating: true,
      reviewCount: true,
      tags: true,
    },
  });

  return c.json({
    ...publisher,
    extensions: publisherExtensions,
  });
});

/**
 * POST /publishers
 * Create publisher profile for current user
 */
app.post(
  "/",
  requireAuthAsync,
  zValidator("json", publisherSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");

    // Check if user already has a publisher profile
    const existing = await db.query.publishers.findFirst({
      where: eq(publishers.userId, user.id),
    });

    if (existing) {
      return c.json({ error: "Publisher profile already exists" }, 409);
    }

    // Check if slug is taken
    const slugTaken = await db.query.publishers.findFirst({
      where: eq(publishers.slug, data.slug),
    });

    if (slugTaken) {
      return c.json({ error: "Slug is already taken" }, 409);
    }

    const [publisher] = await db
      .insert(publishers)
      .values({
        userId: user.id,
        ...data,
      })
      .returning();

    return c.json({ publisher }, 201);
  }
);

/**
 * PATCH /publishers/me
 * Update current user's publisher profile
 */
app.patch(
  "/me",
  requireAuthAsync,
  zValidator("json", updatePublisherSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");

    const existing = await db.query.publishers.findFirst({
      where: eq(publishers.userId, user.id),
    });

    if (!existing) {
      return c.json({ error: "No publisher profile found" }, 404);
    }

    // If changing slug, check if new slug is taken
    if (data.slug && data.slug !== existing.slug) {
      const slugTaken = await db.query.publishers.findFirst({
        where: eq(publishers.slug, data.slug),
      });

      if (slugTaken) {
        return c.json({ error: "Slug is already taken" }, 409);
      }
    }

    const [publisher] = await db
      .update(publishers)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(publishers.id, existing.id))
      .returning();

    return c.json({ publisher });
  }
);

// ============================================
// API Keys Management
// ============================================

const MAX_EXPIRY_DAYS = 365; // Maximum 1 year

// Schema for creating API key
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(MAX_EXPIRY_DAYS).default(90),
});

/**
 * GET /publishers/me/api-keys
 * List all API keys for current user's publisher
 */
app.get("/me/api-keys", requireAuthAsync, async (c) => {
  const user = c.get("user");

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.userId, user.id),
  });

  if (!publisher) {
    return c.json({ error: "No publisher profile found" }, 404);
  }

  const keys = await db.query.publisherApiKeys.findMany({
    where: eq(publisherApiKeys.publisherId, publisher.id),
    orderBy: [desc(publisherApiKeys.createdAt)],
    columns: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  // Add expired status
  const now = new Date();
  const keysWithStatus = keys.map((key) => ({
    ...key,
    expired: key.expiresAt < now,
  }));

  return c.json({ apiKeys: keysWithStatus });
});

/**
 * POST /publishers/me/api-keys
 * Create a new API key
 */
app.post(
  "/me/api-keys",
  requireAuthAsync,
  zValidator("json", createApiKeySchema),
  async (c) => {
    const user = c.get("user");
    const { name, expiresInDays } = c.req.valid("json");

    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.userId, user.id),
    });

    if (!publisher) {
      return c.json({ error: "No publisher profile found" }, 404);
    }

    // Generate a secure random API key
    const keyBytes = randomBytes(32);
    const apiKey = `hxmp_${keyBytes.toString("base64url")}`;

    // Hash the key for storage
    const keyHash = createHash("sha256").update(apiKey).digest("hex");

    // Get prefix for display (first 12 chars including prefix)
    const keyPrefix = apiKey.slice(0, 12);

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const [created] = await db
      .insert(publisherApiKeys)
      .values({
        publisherId: publisher.id,
        name,
        keyHash,
        keyPrefix,
        expiresAt,
      })
      .returning({
        id: publisherApiKeys.id,
        name: publisherApiKeys.name,
        keyPrefix: publisherApiKeys.keyPrefix,
        expiresAt: publisherApiKeys.expiresAt,
        createdAt: publisherApiKeys.createdAt,
      });

    // Return the full key ONLY on creation - it cannot be retrieved later
    return c.json(
      {
        apiKey: {
          ...created,
          key: apiKey, // Full key - shown only once!
        },
        warning: "Store this key securely. It will not be shown again.",
      },
      201
    );
  }
);

/**
 * DELETE /publishers/me/api-keys/:id
 * Delete an API key
 */
app.delete("/me/api-keys/:id", requireAuthAsync, async (c) => {
  const user = c.get("user");
  const keyId = c.req.param("id");

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.userId, user.id),
  });

  if (!publisher) {
    return c.json({ error: "No publisher profile found" }, 404);
  }

  // Find and verify ownership
  const apiKey = await db.query.publisherApiKeys.findFirst({
    where: and(
      eq(publisherApiKeys.id, keyId),
      eq(publisherApiKeys.publisherId, publisher.id)
    ),
  });

  if (!apiKey) {
    return c.json({ error: "API key not found" }, 404);
  }

  await db.delete(publisherApiKeys).where(eq(publisherApiKeys.id, keyId));

  return c.json({ success: true });
});

export default app;
