import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  db,
  extensions,
  extensionReviews,
} from "../db/index.ts";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuthAsync } from "../middleware/auth.ts";
import type { AuthVariables } from "../middleware/auth.ts";

const app = new Hono<{ Variables: AuthVariables }>();

// Schema for creating/updating a review
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional(),
  content: z.string().max(2000).optional(),
});

/**
 * GET /extensions/:slug/reviews
 * Get reviews for an extension
 */
app.get("/:slug/reviews", async (c) => {
  const slug = c.req.param("slug");
  const page = Number(c.req.query("page") || "1");
  const limit = Math.min(Number(c.req.query("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  const extension = await db.query.extensions.findFirst({
    where: eq(extensions.slug, slug),
  });

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const reviews = await db.query.extensionReviews.findMany({
    where: eq(extensionReviews.extensionId, extension.id),
    orderBy: [desc(extensionReviews.createdAt)],
    limit,
    offset,
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(extensionReviews)
    .where(eq(extensionReviews.extensionId, extension.id));

  return c.json({
    reviews,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  });
});

/**
 * POST /extensions/:slug/reviews
 * Create or update a review
 */
app.post(
  "/:slug/reviews",
  requireAuthAsync,
  zValidator("json", reviewSchema),
  async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");
    const { rating, title, content } = c.req.valid("json");

    const extension = await db.query.extensions.findFirst({
      where: eq(extensions.slug, slug),
    });

    if (!extension) {
      return c.json({ error: "Extension not found" }, 404);
    }

    // Check if user already has a review
    const existingReview = await db.query.extensionReviews.findFirst({
      where: and(
        eq(extensionReviews.extensionId, extension.id),
        eq(extensionReviews.userId, user.id)
      ),
    });

    if (existingReview) {
      // Update existing review
      const [updated] = await db
        .update(extensionReviews)
        .set({
          rating,
          title,
          content,
          updatedAt: new Date(),
        })
        .where(eq(extensionReviews.id, existingReview.id))
        .returning();

      await updateExtensionRatingAsync(extension.id);

      return c.json({ review: updated });
    }

    // Create new review
    const [review] = await db
      .insert(extensionReviews)
      .values({
        extensionId: extension.id,
        userId: user.id,
        rating,
        title,
        content,
      })
      .returning();

    await updateExtensionRatingAsync(extension.id);

    return c.json({ review }, 201);
  }
);

/**
 * DELETE /extensions/:slug/reviews
 * Delete user's review
 */
app.delete("/:slug/reviews", requireAuthAsync, async (c) => {
  const slug = c.req.param("slug");
  const user = c.get("user");

  const extension = await db.query.extensions.findFirst({
    where: eq(extensions.slug, slug),
  });

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const deleted = await db
    .delete(extensionReviews)
    .where(
      and(
        eq(extensionReviews.extensionId, extension.id),
        eq(extensionReviews.userId, user.id)
      )
    )
    .returning();

  if (deleted.length === 0) {
    return c.json({ error: "Review not found" }, 404);
  }

  await updateExtensionRatingAsync(extension.id);

  return c.json({ success: true });
});

/**
 * Update extension's average rating and review count
 */
async function updateExtensionRatingAsync(extensionId: string) {
  const [stats] = await db
    .select({
      avgRating: sql<number>`ROUND(AVG(${extensionReviews.rating}) * 100)::int`,
      count: sql<number>`count(*)`,
    })
    .from(extensionReviews)
    .where(eq(extensionReviews.extensionId, extensionId));

  await db
    .update(extensions)
    .set({
      averageRating: stats?.avgRating || null,
      reviewCount: Number(stats?.count) || 0,
      updatedAt: new Date(),
    })
    .where(eq(extensions.id, extensionId));
}

export default app;
