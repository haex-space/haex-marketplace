import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, publishers, extensions } from "../db/index.ts";
import { eq, and, sql, desc } from "drizzle-orm";
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

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(publishers);

  return c.json({
    publishers: results,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  });
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
    where: and(
      eq(extensions.publisherId, publisher.id),
      eq(extensions.status, "published")
    ),
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
 * GET /publishers/me
 * Get current user's publisher profile
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

export default app;
