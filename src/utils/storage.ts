import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
}

// Admin client for storage operations
const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);

const BUCKET_NAME = "extensions";
const IMAGES_BUCKET_NAME = "marketplace-images";

const EXTENSION_MIME_TYPES = [
  "application/x-haextension",
  "application/octet-stream",
  "application/zip",
];

const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

/**
 * Initialize storage buckets (creates if not exists, updates if exists)
 */
export async function initStorageAsync(): Promise<void> {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();

  // Extensions bucket
  const extensionBucketExists = buckets?.some(b => b.name === BUCKET_NAME);

  if (!extensionBucketExists) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB max
      allowedMimeTypes: EXTENSION_MIME_TYPES,
    });

    if (error) {
      console.error(`Failed to create storage bucket: ${error.message}`);
    } else {
      console.log(`Created storage bucket: ${BUCKET_NAME}`);
    }
  } else {
    const { error } = await supabaseAdmin.storage.updateBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: EXTENSION_MIME_TYPES,
    });

    if (error) {
      console.error(`Failed to update storage bucket: ${error.message}`);
    }
  }

  // Marketplace images bucket
  const imagesBucketExists = buckets?.some(b => b.name === IMAGES_BUCKET_NAME);

  if (!imagesBucketExists) {
    const { error } = await supabaseAdmin.storage.createBucket(IMAGES_BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024, // 5MB max for images
      allowedMimeTypes: IMAGE_MIME_TYPES,
    });

    if (error) {
      console.error(`Failed to create images bucket: ${error.message}`);
    } else {
      console.log(`Created storage bucket: ${IMAGES_BUCKET_NAME}`);
    }
  } else {
    const { error } = await supabaseAdmin.storage.updateBucket(IMAGES_BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
    });

    if (error) {
      console.error(`Failed to update images bucket: ${error.message}`);
    }
  }
}

/**
 * Upload extension bundle to storage
 */
export async function uploadExtensionBundleAsync(
  publisherSlug: string,
  extensionSlug: string,
  version: string,
  file: File | Blob
): Promise<{ path: string; error: Error | null }> {
  const path = `${publisherSlug}/${extensionSlug}/${version}.xt`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType: "application/x-haextension",
      upsert: false, // Don't overwrite existing versions
    });

  if (error) {
    return { path: "", error: new Error(error.message) };
  }

  return { path, error: null };
}

/**
 * Upload extension icon to storage
 */
export async function uploadExtensionIconAsync(
  publisherSlug: string,
  extensionSlug: string,
  file: File | Blob,
  filename: string
): Promise<{ url: string; error: Error | null }> {
  const ext = filename.split(".").pop() || "png";
  const path = `${publisherSlug}/${extensionSlug}/icon.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType: file.type || "image/png",
      upsert: true,
    });

  if (error) {
    return { url: "", error: new Error(error.message) };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(path);

  return { url: publicUrl, error: null };
}

/**
 * Upload extension screenshot to storage
 */
export async function uploadScreenshotAsync(
  publisherSlug: string,
  extensionSlug: string,
  file: File | Blob,
  index: number,
  filename: string
): Promise<{ url: string; error: Error | null }> {
  const ext = filename.split(".").pop() || "png";
  const path = `${publisherSlug}/${extensionSlug}/screenshots/${index}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType: file.type || "image/png",
      upsert: true,
    });

  if (error) {
    return { url: "", error: new Error(error.message) };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(path);

  return { url: publicUrl, error: null };
}

/**
 * Upload marketplace image (for markdown descriptions)
 */
export async function uploadMarketplaceImageAsync(
  publisherSlug: string,
  extensionSlug: string,
  file: File | Blob,
  filename: string
): Promise<{ url: string; error: Error | null }> {
  const ext = filename.split(".").pop() || "png";
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const path = `${publisherSlug}/${extensionSlug}/${uniqueId}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(IMAGES_BUCKET_NAME)
    .upload(path, file, {
      contentType: file.type || "image/png",
      upsert: false,
    });

  if (error) {
    return { url: "", error: new Error(error.message) };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(IMAGES_BUCKET_NAME).getPublicUrl(path);

  return { url: publicUrl, error: null };
}

/**
 * Get signed download URL for extension bundle
 */
export async function getDownloadUrlAsync(
  bundlePath: string
): Promise<{ url: string; error: Error | null }> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(bundlePath, 60 * 5); // 5 minutes

  if (error) {
    return { url: "", error: new Error(error.message) };
  }

  return { url: data.signedUrl, error: null };
}

/**
 * Delete extension files from storage
 */
export async function deleteExtensionFilesAsync(
  publisherSlug: string,
  extensionSlug: string
): Promise<{ error: Error | null }> {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([`${publisherSlug}/${extensionSlug}`]);

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}
