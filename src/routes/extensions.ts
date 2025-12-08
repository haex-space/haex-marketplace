import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, extensions, extensionVersions, publishers, categories } from "../db/index.ts";
import { eq, sql, and, or, ilike } from "drizzle-orm";
import { optionalAuthAsync } from "../middleware/auth.ts";
import { getDownloadUrlAsync } from "../utils/storage.ts";

const app = new Hono();

// Query params schema for listing extensions
const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  category: z.string().optional(),
  search: z.string().optional(),
  tags: z.string().optional(), // Comma-separated
  sort: z.enum(["downloads", "rating", "newest", "updated"]).default("downloads"),
  publisher: z.string().optional(),
});

/**
 * GET /extensions
 * List extensions with filtering and pagination
 */
app.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { page, limit, category, search, tags, sort, publisher } = c.req.valid("query");
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [];

  if (category) {
    const cat = await db.query.categories.findFirst({
      where: eq(categories.slug, category),
    });
    if (cat) {
      conditions.push(eq(extensions.categoryId, cat.id));
    }
  }

  if (publisher) {
    const pub = await db.query.publishers.findFirst({
      where: eq(publishers.slug, publisher),
    });
    if (pub) {
      conditions.push(eq(extensions.publisherId, pub.id));
    }
  }

  if (search) {
    conditions.push(
      or(
        ilike(extensions.name, `%${search}%`),
        ilike(extensions.shortDescription, `%${search}%`)
      )!
    );
  }

  if (tags) {
    const tagList = tags.split(",").map((t) => t.trim());
    conditions.push(sql`${extensions.tags} && ${tagList}`);
  }

  // Query extensions with publisher info using relations
  const results = await db.query.extensions.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: (ext, { desc }) => {
      switch (sort) {
        case "downloads":
          return [desc(ext.totalDownloads)];
        case "rating":
          return [desc(ext.averageRating)];
        case "newest":
          return [desc(ext.publishedAt)];
        case "updated":
          return [desc(ext.updatedAt)];
        default:
          return [desc(ext.totalDownloads)];
      }
    },
    limit,
    offset,
    columns: {
      id: true,
      extensionId: true,
      name: true,
      slug: true,
      shortDescription: true,
      iconUrl: true,
      verified: true,
      totalDownloads: true,
      averageRating: true,
      reviewCount: true,
      tags: true,
      publishedAt: true,
    },
    with: {
      publisher: {
        columns: {
          displayName: true,
          slug: true,
          verified: true,
        },
      },
      category: {
        columns: {
          name: true,
          slug: true,
        },
      },
      versions: {
        orderBy: (versions, { desc }) => [desc(versions.publishedAt)],
        columns: {
          id: true,
          version: true,
          changelog: true,
          bundleSize: true,
          bundleHash: true,
          permissions: true,
          minAppVersion: true,
          maxAppVersion: true,
          downloads: true,
          publishedAt: true,
        },
      },
    },
  });

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(extensions)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  const count = countResult[0]?.count ?? 0;

  return c.json({
    extensions: results,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
    },
  });
});

/**
 * GET /extensions/:slug
 * Get extension details by slug
 */
app.get("/:slug", optionalAuthAsync, async (c) => {
  const slug = c.req.param("slug");

  const extension = await db.query.extensions.findFirst({
    where: eq(extensions.slug, slug),
    with: {
      publisher: true,
      category: true,
      screenshots: {
        orderBy: (screenshots, { asc }) => [asc(screenshots.sortOrder)],
      },
      versions: {
        orderBy: (versions, { desc }) => [desc(versions.publishedAt)],
        limit: 10,
      },
    },
  });

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  // Get latest version
  const latestVersion = extension.versions[0];

  return c.json({
    ...extension,
    latestVersion: latestVersion
      ? {
          version: latestVersion.version,
          changelog: latestVersion.changelog,
          bundleSize: latestVersion.bundleSize,
          permissions: latestVersion.permissions,
          minAppVersion: latestVersion.minAppVersion,
          publishedAt: latestVersion.publishedAt,
        }
      : null,
  });
});

/**
 * GET /extensions/:slug/versions
 * Get all published versions of an extension
 */
app.get("/:slug/versions", async (c) => {
  const slug = c.req.param("slug");

  const extension = await db.query.extensions.findFirst({
    where: eq(extensions.slug, slug),
  });

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const versions = await db.query.extensionVersions.findMany({
    where: eq(extensionVersions.extensionId, extension.id),
    orderBy: (versions, { desc }) => [desc(versions.publishedAt)],
    columns: {
      id: true,
      version: true,
      changelog: true,
      bundleSize: true,
      permissions: true,
      minAppVersion: true,
      maxAppVersion: true,
      downloads: true,
      publishedAt: true,
    },
  });

  return c.json({ versions });
});

/**
 * GET /extensions/:slug/download
 * Get download URL for latest version
 */
app.get("/:slug/download", optionalAuthAsync, async (c) => {
  const slug = c.req.param("slug");
  const requestedVersion = c.req.query("version");

  const extension = await db.query.extensions.findFirst({
    where: eq(extensions.slug, slug),
  });

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  // Find the requested version or latest
  let version;
  if (requestedVersion) {
    version = await db.query.extensionVersions.findFirst({
      where: and(
        eq(extensionVersions.extensionId, extension.id),
        eq(extensionVersions.version, requestedVersion)
      ),
    });
  } else {
    version = await db.query.extensionVersions.findFirst({
      where: eq(extensionVersions.extensionId, extension.id),
      orderBy: (versions, { desc }) => [desc(versions.publishedAt)],
    });
  }

  if (!version) {
    return c.json({ error: "Version not found" }, 404);
  }

  // Generate signed download URL
  const { url, error } = await getDownloadUrlAsync(version.bundlePath);

  if (error) {
    console.error("Failed to generate download URL:", error);
    return c.json({ error: "Failed to generate download URL" }, 500);
  }

  // Record download (async, don't wait)
  recordDownloadAsync(extension.id, version.id, c);

  return c.json({
    downloadUrl: url,
    version: version.version,
    bundleSize: version.bundleSize,
    bundleHash: version.bundleHash,
  });
});

/**
 * Record a download for analytics
 */
async function recordDownloadAsync(
  extensionId: string,
  versionId: string,
  c: any
) {
  try {
    const user = c.get("user");
    const userAgent = c.req.header("User-Agent");
    const platform = c.req.header("X-Platform");
    const appVersion = c.req.header("X-App-Version");

    // Simple IP hash for rate limiting
    const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP");
    const ipHash = ip
      ? Buffer.from(ip).toString("base64").slice(0, 16)
      : null;

    // Import here to avoid circular dependencies
    const { extensionDownloads } = await import("../db/schema.ts");

    await db.insert(extensionDownloads).values({
      extensionId,
      versionId,
      userId: user?.id || null,
      ipHash,
      userAgent,
      platform,
      appVersion,
    });

    // Update download counts
    await db
      .update(extensions)
      .set({
        totalDownloads: sql`${extensions.totalDownloads} + 1`,
      })
      .where(eq(extensions.id, extensionId));

    await db
      .update(extensionVersions)
      .set({
        downloads: sql`${extensionVersions.downloads} + 1`,
      })
      .where(eq(extensionVersions.id, versionId));
  } catch (error) {
    console.error("Failed to record download:", error);
  }
}

export default app;
