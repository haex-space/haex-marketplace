import { Hono } from "hono";
import { db, categories, extensions } from "../db/index.ts";
import { eq, asc, and, count } from "drizzle-orm";

const app = new Hono();

/**
 * GET /categories
 * List all categories with extension counts
 */
app.get("/", async (c) => {
  const results = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      extensionCount: count(extensions.id),
    })
    .from(categories)
    .leftJoin(
      extensions,
      and(
        eq(extensions.categoryId, categories.id),
        eq(extensions.status, "published")
      )
    )
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return c.json({ categories: results });
});

/**
 * GET /categories/:slug
 * Get category by slug
 */
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const category = await db.query.categories.findFirst({
    where: eq(categories.slug, slug),
  });

  if (!category) {
    return c.json({ error: "Category not found" }, 404);
  }

  return c.json({ category });
});

export default app;
