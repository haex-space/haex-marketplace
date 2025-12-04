import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  db,
  extensions,
  extensionVersions,
  extensionScreenshots,
  publishers,
  categories,
} from "../db/index.ts";
import { eq, and, desc } from "drizzle-orm";
import { requireAuthAsync } from "../middleware/auth.ts";
import type { AuthVariables } from "../middleware/auth.ts";
import {
  uploadExtensionBundleAsync,
  uploadExtensionIconAsync,
  uploadScreenshotAsync,
} from "../utils/storage.ts";
import * as semver from "semver";
import * as crypto from "crypto";

const app = new Hono<{ Variables: AuthVariables }>();

// Schema for creating an extension
const createExtensionSchema = z.object({
  publicKey: z.string().min(1, "Public key is required"),
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  shortDescription: z.string().min(10).max(150),
  description: z.string().max(10000).optional(),
  categorySlug: z.string().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
});

// Schema for updating an extension
const updateExtensionSchema = createExtensionSchema.partial().omit({
  publicKey: true,
  slug: true,
});

// Schema for publishing a version
const publishVersionSchema = z.object({
  version: z.string().refine((v) => semver.valid(v), "Invalid semver version"),
  changelog: z.string().max(5000).optional(),
  minAppVersion: z.string().optional(),
  maxAppVersion: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  manifest: z.record(z.unknown()),
});

/**
 * GET /publish/extensions
 * List current user's extensions
 */
app.get("/extensions", requireAuthAsync, async (c) => {
  const user = c.get("user");

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.userId, user.id),
  });

  if (!publisher) {
    return c.json({ error: "No publisher profile found. Create one first." }, 404);
  }

  const userExtensions = await db.query.extensions.findMany({
    where: eq(extensions.publisherId, publisher.id),
    orderBy: [desc(extensions.updatedAt)],
    with: {
      category: true,
      versions: {
        orderBy: (versions, { desc }) => [desc(versions.createdAt)],
        limit: 1,
      },
    },
  });

  return c.json({ extensions: userExtensions });
});

/**
 * POST /publish/extensions
 * Create a new extension
 */
app.post(
  "/extensions",
  requireAuthAsync,
  zValidator("json", createExtensionSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");

    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.userId, user.id),
    });

    if (!publisher) {
      return c.json({ error: "No publisher profile found. Create one first." }, 404);
    }

    // Check if slug is taken
    const slugTaken = await db.query.extensions.findFirst({
      where: eq(extensions.slug, data.slug),
    });

    if (slugTaken) {
      return c.json({ error: "Extension slug is already taken" }, 409);
    }

    // Check if public key is already used
    const publicKeyTaken = await db.query.extensions.findFirst({
      where: eq(extensions.publicKey, data.publicKey),
    });

    if (publicKeyTaken) {
      return c.json({ error: "Public key is already registered" }, 409);
    }

    // Get category ID if provided
    let categoryId: string | null = null;
    if (data.categorySlug) {
      const category = await db.query.categories.findFirst({
        where: eq(categories.slug, data.categorySlug),
      });
      categoryId = category?.id || null;
    }

    // Generate extensionId from publisher slug and extension slug
    const extensionId = `${publisher.slug}/${data.slug}`;

    const [extension] = await db
      .insert(extensions)
      .values({
        publisherId: publisher.id,
        categoryId,
        extensionId,
        publicKey: data.publicKey,
        name: data.name,
        slug: data.slug,
        shortDescription: data.shortDescription,
        description: data.description || "",
        tags: data.tags,
        status: "draft",
      })
      .returning();

    return c.json({ extension }, 201);
  }
);

/**
 * PATCH /publish/extensions/:slug
 * Update an extension
 */
app.patch(
  "/extensions/:slug",
  requireAuthAsync,
  zValidator("json", updateExtensionSchema),
  async (c) => {
    const user = c.get("user");
    const slug = c.req.param("slug");
    const data = c.req.valid("json");

    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.userId, user.id),
    });

    if (!publisher) {
      return c.json({ error: "No publisher profile found" }, 404);
    }

    const extension = await db.query.extensions.findFirst({
      where: and(
        eq(extensions.slug, slug),
        eq(extensions.publisherId, publisher.id)
      ),
    });

    if (!extension) {
      return c.json({ error: "Extension not found" }, 404);
    }

    // Get category ID if provided
    let categoryId = extension.categoryId;
    if (data.categorySlug !== undefined) {
      if (data.categorySlug) {
        const category = await db.query.categories.findFirst({
          where: eq(categories.slug, data.categorySlug),
        });
        categoryId = category?.id || null;
      } else {
        categoryId = null;
      }
    }

    const [updated] = await db
      .update(extensions)
      .set({
        ...data,
        categoryId,
        updatedAt: new Date(),
      })
      .where(eq(extensions.id, extension.id))
      .returning();

    return c.json({ extension: updated });
  }
);

/**
 * POST /publish/extensions/:slug/icon
 * Upload extension icon
 */
app.post("/extensions/:slug/icon", requireAuthAsync, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.userId, user.id),
  });

  if (!publisher) {
    return c.json({ error: "No publisher profile found" }, 404);
  }

  const extension = await db.query.extensions.findFirst({
    where: and(
      eq(extensions.slug, slug),
      eq(extensions.publisherId, publisher.id)
    ),
  });

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const formData = await c.req.formData();
  const file = formData.get("icon") as File | null;

  if (!file) {
    return c.json({ error: "No icon file provided" }, 400);
  }

  const { url, error } = await uploadExtensionIconAsync(
    publisher.slug,
    extension.slug,
    file,
    file.name
  );

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  await db
    .update(extensions)
    .set({ iconUrl: url, updatedAt: new Date() })
    .where(eq(extensions.id, extension.id));

  return c.json({ iconUrl: url });
});

/**
 * POST /publish/extensions/:slug/screenshots
 * Upload extension screenshot
 */
app.post("/extensions/:slug/screenshots", requireAuthAsync, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.userId, user.id),
  });

  if (!publisher) {
    return c.json({ error: "No publisher profile found" }, 404);
  }

  const extension = await db.query.extensions.findFirst({
    where: and(
      eq(extensions.slug, slug),
      eq(extensions.publisherId, publisher.id)
    ),
  });

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const formData = await c.req.formData();
  const file = formData.get("screenshot") as File | null;
  const caption = formData.get("caption") as string | null;

  if (!file) {
    return c.json({ error: "No screenshot file provided" }, 400);
  }

  // Get current screenshot count for ordering
  const existingScreenshots = await db.query.extensionScreenshots.findMany({
    where: eq(extensionScreenshots.extensionId, extension.id),
  });

  const sortOrder = existingScreenshots.length;

  const { url, error } = await uploadScreenshotAsync(
    publisher.slug,
    extension.slug,
    file,
    sortOrder,
    file.name
  );

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const [screenshot] = await db
    .insert(extensionScreenshots)
    .values({
      extensionId: extension.id,
      imageUrl: url,
      caption,
      sortOrder,
    })
    .returning();

  return c.json({ screenshot }, 201);
});

/**
 * DELETE /publish/extensions/:slug/screenshots/:id
 * Delete a screenshot
 */
app.delete("/extensions/:slug/screenshots/:id", requireAuthAsync, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  const screenshotId = c.req.param("id");

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.userId, user.id),
  });

  if (!publisher) {
    return c.json({ error: "No publisher profile found" }, 404);
  }

  const extension = await db.query.extensions.findFirst({
    where: and(
      eq(extensions.slug, slug),
      eq(extensions.publisherId, publisher.id)
    ),
  });

  if (!extension) {
    return c.json({ error: "Extension not found" }, 404);
  }

  const deleted = await db
    .delete(extensionScreenshots)
    .where(
      and(
        eq(extensionScreenshots.id, screenshotId),
        eq(extensionScreenshots.extensionId, extension.id)
      )
    )
    .returning();

  if (deleted.length === 0) {
    return c.json({ error: "Screenshot not found" }, 404);
  }

  return c.json({ success: true });
});

/**
 * POST /publish/extensions/:slug/versions
 * Upload a new version
 */
app.post(
  "/extensions/:slug/versions",
  requireAuthAsync,
  async (c) => {
    const user = c.get("user");
    const slug = c.req.param("slug");

    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.userId, user.id),
    });

    if (!publisher) {
      return c.json({ error: "No publisher profile found" }, 404);
    }

    const extension = await db.query.extensions.findFirst({
      where: and(
        eq(extensions.slug, slug),
        eq(extensions.publisherId, publisher.id)
      ),
    });

    if (!extension) {
      return c.json({ error: "Extension not found" }, 404);
    }

    const formData = await c.req.formData();
    const bundle = formData.get("bundle") as File | null;
    const metadataJson = formData.get("metadata") as string | null;

    if (!bundle || !metadataJson) {
      return c.json({ error: "Bundle file and metadata are required" }, 400);
    }

    let metadata;
    try {
      metadata = publishVersionSchema.parse(JSON.parse(metadataJson));
    } catch (e) {
      return c.json({ error: "Invalid metadata format" }, 400);
    }

    // Check if version already exists
    const existingVersion = await db.query.extensionVersions.findFirst({
      where: and(
        eq(extensionVersions.extensionId, extension.id),
        eq(extensionVersions.version, metadata.version)
      ),
    });

    if (existingVersion) {
      return c.json({ error: "Version already exists" }, 409);
    }

    // Check version is greater than latest
    const latestVersion = await db.query.extensionVersions.findFirst({
      where: eq(extensionVersions.extensionId, extension.id),
      orderBy: [desc(extensionVersions.createdAt)],
    });

    if (latestVersion && !semver.gt(metadata.version, latestVersion.version)) {
      return c.json(
        { error: `Version must be greater than ${latestVersion.version}` },
        400
      );
    }

    // Calculate bundle hash
    const arrayBuffer = await bundle.arrayBuffer();
    const hash = crypto
      .createHash("sha256")
      .update(Buffer.from(arrayBuffer))
      .digest("hex");

    // Upload bundle
    const { path, error } = await uploadExtensionBundleAsync(
      publisher.slug,
      extension.slug,
      metadata.version,
      new Blob([arrayBuffer])
    );

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // Create version
    const [version] = await db
      .insert(extensionVersions)
      .values({
        extensionId: extension.id,
        version: metadata.version,
        changelog: metadata.changelog,
        bundlePath: path,
        bundleSize: bundle.size,
        bundleHash: hash,
        manifest: metadata.manifest,
        minAppVersion: metadata.minAppVersion,
        maxAppVersion: metadata.maxAppVersion,
        permissions: metadata.permissions,
        status: "draft",
      })
      .returning();

    return c.json({ version }, 201);
  }
);

/**
 * POST /publish/extensions/:slug/versions/:version/publish
 * Submit version for review (or auto-publish if enabled)
 */
app.post(
  "/extensions/:slug/versions/:version/publish",
  requireAuthAsync,
  async (c) => {
    const user = c.get("user");
    const slug = c.req.param("slug");
    const versionParam = c.req.param("version");

    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.userId, user.id),
    });

    if (!publisher) {
      return c.json({ error: "No publisher profile found" }, 404);
    }

    const extension = await db.query.extensions.findFirst({
      where: and(
        eq(extensions.slug, slug),
        eq(extensions.publisherId, publisher.id)
      ),
    });

    if (!extension) {
      return c.json({ error: "Extension not found" }, 404);
    }

    const version = await db.query.extensionVersions.findFirst({
      where: and(
        eq(extensionVersions.extensionId, extension.id),
        eq(extensionVersions.version, versionParam)
      ),
    });

    if (!version) {
      return c.json({ error: "Version not found" }, 404);
    }

    if (version.status !== "draft") {
      return c.json({ error: "Version is not in draft status" }, 400);
    }

    // For now, auto-publish (later: add review process)
    const now = new Date();

    await db
      .update(extensionVersions)
      .set({
        status: "published",
        publishedAt: now,
      })
      .where(eq(extensionVersions.id, version.id));

    // If extension is not published yet, publish it
    if (extension.status === "draft") {
      await db
        .update(extensions)
        .set({
          status: "published",
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(extensions.id, extension.id));
    } else {
      await db
        .update(extensions)
        .set({ updatedAt: now })
        .where(eq(extensions.id, extension.id));
    }

    return c.json({ success: true, status: "published" });
  }
);

export default app;
