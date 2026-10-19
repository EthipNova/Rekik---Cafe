import { supabase } from "./supabase";

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
] as const;

/**
 * Generates an RFC 4122 v4 UUID string with runtime compatibility fallbacks.
 * Uses crypto.randomUUID() when available, falling back to crypto.getRandomValues().
 */
function generateUUID(): string {
  const cryptoObj =
    typeof globalThis !== "undefined" && globalThis.crypto
      ? globalThis.crypto
      : typeof crypto !== "undefined"
        ? crypto
        : undefined;

  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);

    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  }

  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Validates a candidate image file for format and size constraints.
 */
export function validateProductImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image size exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  const isAllowedMime = ALLOWED_IMAGE_MIME_TYPES.includes(file.type.toLowerCase() as any);

  // Also check file extension as fallback in case MIME type is missing or generic
  const extension = file.name.split(".").pop()?.toLowerCase();
  const isAllowedExt = ["jpg", "jpeg", "png", "webp"].includes(extension || "");

  if (!isAllowedMime && !isAllowedExt) {
    return {
      valid: false,
      error: "Only JPG, PNG, and WEBP image files are allowed.",
    };
  }

  return { valid: true };
}

/**
 * Attempts to ensure the product-images bucket exists.
 */
export async function ensureProductImagesBucket(): Promise<boolean> {
  try {
    const { data: bucket, error: getErr } = await supabase.storage.getBucket(PRODUCT_IMAGES_BUCKET);
    if (bucket && !getErr) {
      return true;
    }

    const { error: createErr } = await supabase.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: MAX_IMAGE_SIZE_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });

    if (createErr) {
      // Bucket might already exist or need admin session
      console.warn("Storage bucket ensure notice:", createErr.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("ensureProductImagesBucket caught error:", err);
    return false;
  }
}

/**
 * Extracts storage object path from a Supabase public URL if it points to product-images bucket.
 * e.g., https://.../product-images/products/PROD-123/image.webp -> products/PROD-123/image.webp
 */
export function extractStoragePathFromUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;

  const path = url.slice(index + marker.length);
  // Strip any URL query parameters if present
  return path.split("?")[0] || null;
}

/**
 * Uploads a local image file to the product-images bucket in Supabase Storage.
 * Generates a unique collision-free path: products/{productId}/{unique-id}.{ext}
 */
export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<{
  url: string | null;
  path: string | null;
  error: Error | null;
}> {
  try {
    const validation = validateProductImageFile(file);
    if (!validation.valid) {
      return { url: null, path: null, error: new Error(validation.error) };
    }

    // Try ensuring bucket exists if not already present
    await ensureProductImagesBucket();

    // Determine clean file extension
    let extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (extension === "jpeg") extension = "jpg";
    if (!["jpg", "png", "webp"].includes(extension)) {
      if (file.type === "image/png") extension = "png";
      else if (file.type === "image/webp") extension = "webp";
      else extension = "jpg";
    }

    const uniqueId = generateUUID();
    const sanitizedProductId = productId.replace(/[^a-zA-Z0-9_-]/g, "");
    const storagePath = `products/${sanitizedProductId}/${uniqueId}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || `image/${extension === "jpg" ? "jpeg" : extension}`,
        upsert: true,
      });

    if (uploadError) {
      return {
        url: null,
        path: null,
        error: new Error(`Image upload failed: ${uploadError.message}`),
      };
    }

    const { data: publicUrlData } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(uploadData.path || storagePath);

    return {
      url: publicUrlData.publicUrl,
      path: uploadData.path || storagePath,
      error: null,
    };
  } catch (err: any) {
    return {
      url: null,
      path: null,
      error: err instanceof Error ? err : new Error("Failed to upload image file."),
    };
  }
}

/**
 * Removes an image object from the product-images bucket.
 * Accepts either a full public URL or a storage path.
 */
export async function deleteProductImageFromStorage(
  pathOrUrl: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    if (!pathOrUrl || typeof pathOrUrl !== "string") {
      return { success: true, error: null };
    }

    const path = pathOrUrl.includes("://") ? extractStoragePathFromUrl(pathOrUrl) : pathOrUrl;

    // If the image is external (not in our bucket), nothing to delete from Supabase Storage
    if (!path) {
      return { success: true, error: null };
    }

    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);

    if (error) {
      console.warn("Notice deleting storage image:", error.message);
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.warn("Caught error removing storage image:", err);
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to delete storage image."),
    };
  }
}
