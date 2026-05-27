/**
 * One-off: hard-delete extensions by slug.
 *
 * Mirrors the DELETE /publish/extensions/:slug route logic but looks the
 * extension up by slug directly (no user/auth context), for admin cleanup.
 *
 * Removes storage files (both buckets) and the extensions row. The row delete
 * cascades to versions, screenshots, reviews and downloads.
 *
 * Usage (inside the running container):
 *   bun run scripts/delete-extension.ts haex-pass haex-files
 */
import { eq } from "drizzle-orm";
import { db, extensions, publishers } from "../src/db/index.ts";
import { deleteExtensionFilesAsync } from "../src/utils/storage.ts";

const slugs = process.argv.slice(2);

if (slugs.length === 0) {
  console.error("Usage: bun run scripts/delete-extension.ts <slug> [slug...]");
  process.exit(1);
}

for (const slug of slugs) {
  const extension = await db.query.extensions.findFirst({
    where: eq(extensions.slug, slug),
  });

  if (!extension) {
    console.log(`[skip] extension not found: ${slug}`);
    continue;
  }

  const publisher = await db.query.publishers.findFirst({
    where: eq(publishers.id, extension.publisherId),
  });

  if (!publisher) {
    console.log(`[skip] publisher not found for ${slug} (publisherId=${extension.publisherId})`);
    continue;
  }

  console.log(`[delete] ${publisher.slug}/${extension.slug} (id=${extension.id})`);

  const storageResult = await deleteExtensionFilesAsync(publisher.slug, extension.slug);
  if (storageResult.error) {
    console.error(`  storage cleanup failed (DB delete proceeds): ${storageResult.error.message}`);
  } else {
    console.log(`  storage files removed`);
  }

  await db.delete(extensions).where(eq(extensions.id, extension.id));
  console.log(`  DB row deleted (cascade: versions, screenshots, reviews, downloads)`);
}

console.log("Done.");
process.exit(0);
