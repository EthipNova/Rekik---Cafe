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
 * Determines whether a given URL or path represents a local static asset bundled with the frontend
 * (e.g., "/images/food/burger.jpg" or "images/food/burger.jpg").
 */
export function isStaticAssetPath(pathOrUrl: string): boolean {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return false;
  const trimmed = pathOrUrl.trim();
  return (
    trimmed.startsWith("/images/") ||
    trimmed.startsWith("images/") ||
    trimmed.startsWith("/assets/") ||
    trimmed.startsWith("assets/") ||
    trimmed.startsWith("/placeholder")
  );
}

/**
 * Validates whether a storage path is strictly scoped within the product-specific folder:
 * "products/<productId>/<filename>.<ext>"
 * Guards against directory traversal (..) or attempts to delete files outside the product directory.
 */
export function isProductSpecificStoragePath(path: string, expectedProductId?: string): boolean {
  if (!path || typeof path !== "string") return false;
  const cleanPath = path.trim().replace(/^\/+/, "");

  // Prevent path traversal
  if (cleanPath.includes("..") || cleanPath.includes("\\")) {
    return false;
  }

  // Must match products/<productId>/<filename>
  const parts = cleanPath.split("/");
  if (parts.length < 3 || parts[0] !== "products") {
    return false;
  }

  const pathProductId = parts[1];
  if (!pathProductId) return false;

  if (expectedProductId) {
    const sanitizedExpected = expectedProductId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (pathProductId !== sanitizedExpected && pathProductId !== expectedProductId) {
      return false;
    }
  }

  const fileName = parts.slice(2).join("/");
  // Check valid filename and extension
  return /\.(jpg|jpeg|png|webp)$/i.test(fileName);
}

/**
 * Extracts storage object path from a Supabase public URL if it points to product-images bucket.
 * e.g., https://.../product-images/products/PROD-123/image.webp -> products/PROD-123/image.webp
 * Returns null if the URL is from an external source or a bundled static asset.
 */
export function extractStoragePathFromUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // If it's a bundled static asset, do not treat as a storage object
  if (isStaticAssetPath(trimmed)) {
    return null;
  }

  const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
  const index = trimmed.indexOf(marker);
  if (index === -1) {
    // Check if it's already a relative product storage path (e.g., "products/...")
    if (trimmed.startsWith("products/")) {
      const [raw] = trimmed.split("?");
      return (raw || "").replace(/^\/+/, "") || null;
    }
    return null;
  }

  const path = trimmed.slice(index + marker.length);
  // Strip any URL query parameters if present (e.g. cache-busting tokens)
  const [rawClean] = path.split("?");
  const cleanPath = (rawClean || "").replace(/^\/+/, "");
  return cleanPath || null;
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
 * Safely removes a product image object from the product-images bucket.
 *
 * Safety constraints:
 * 1. Strictly refuses to delete static bundled assets or external images.
 * 2. Strictly enforces that the path resides within "products/[productId]/...".
 * 3. Never reports false success if the storage API returns an error.
 */
export async function deleteProductImageFromStorage(
  pathOrUrl: string,
  expectedProductId?: string,
): Promise<{ success: boolean; skipped?: boolean; error: Error | null }> {
  try {
    if (!pathOrUrl || typeof pathOrUrl !== "string" || !pathOrUrl.trim()) {
      return { success: true, skipped: true, error: null };
    }

    const trimmed = pathOrUrl.trim();

    // Check if it's a bundled static asset or an external non-bucket image
    if (isStaticAssetPath(trimmed)) {
      return { success: true, skipped: true, error: null };
    }

    const path = extractStoragePathFromUrl(trimmed);

    // If the image is external (not in our bucket), nothing to delete from Supabase Storage
    if (!path) {
      return { success: true, skipped: true, error: null };
    }

    // Verify product-specific path boundary
    if (!isProductSpecificStoragePath(path, expectedProductId)) {
      console.warn("Skipping storage deletion: path is outside product folder or invalid:", path);
      return {
        success: false,
        error: new Error(`Refusing to delete storage object outside product directory: ${path}`),
      };
    }

    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);

    if (error) {
      console.warn("Notice deleting storage image:", error.message);
      return { success: false, error: new Error(`Storage delete failed: ${error.message}`) };
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
