import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
}

// Admin client for storage operations
const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);

const BUCKET_NAME = "extensions";

/**
 * Upload extension bundle to storage
 */
export async function uploadExtensionBundleAsync(
  publisherSlug: string,
  extensionSlug: string,
  version: string,
  file: File | Blob
): Promise<{ path: string; error: Error | null }> {
  const path = `${publisherSlug}/${extensionSlug}/${version}.haextension`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType: "application/octet-stream",
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
