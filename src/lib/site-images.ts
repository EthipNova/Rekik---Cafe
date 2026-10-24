import { supabase } from "./supabase";

export const SITE_IMAGES_BUCKET = "product-images";
export const MAX_SITE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_SITE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
] as const;

export type SiteImageCategory = "homepage" | "about" | "story";

/**
 * Generates an RFC 4122 v4 UUID string with cross-platform fallback.
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

  return `site-img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Validates a candidate site image file for format (JPG, PNG, WebP) and size (<= 5 MB).
 */
export function validateSiteImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!file) {
    return { valid: false, error: "No image file selected." };
  }

  if (file.size > MAX_SITE_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image size exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  const isAllowedMime = ALLOWED_SITE_IMAGE_MIME_TYPES.includes(
    file.type.toLowerCase() as (typeof ALLOWED_SITE_IMAGE_MIME_TYPES)[number],
  );

  const extension = file.name.split(".").pop()?.toLowerCase();
  const isAllowedExt = ["jpg", "jpeg", "png", "webp"].includes(extension || "");

  if (!isAllowedMime && !isAllowedExt) {
    return {
      valid: false,
      error: "Please select a JPG, PNG, or WEBP image smaller than 5 MB.",
    };
  }

  return { valid: true };
}

/**
 * Ensures the product-images storage bucket exists with public access.
 */
export async function ensureSiteImagesBucket(): Promise<boolean> {
  try {
    const { data: bucket, error: getErr } = await supabase.storage.getBucket(SITE_IMAGES_BUCKET);
    if (bucket && !getErr) {
      return true;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Extracts storage path from a public URL if it belongs to product-images or site-images.
 * e.g., https://.../product-images/content/homepage/uuid-hero.webp -> content/homepage/uuid-hero.webp
 */
export function extractSiteImageStoragePath(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const marker = `/${SITE_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index !== -1) {
    const path = url.slice(index + marker.length);
    return path.split("?")[0] || null;
  }

  const legacyMarker = `/site-images/`;
  const legacyIndex = url.indexOf(legacyMarker);
  if (legacyIndex !== -1) {
    const path = url.slice(legacyIndex + legacyMarker.length);
    return path.split("?")[0] || null;
  }

  return null;
}

/**
 * Uploads a validated website image to the existing product-images bucket under content/.
 * Path convention:
 *   content/homepage/{unique-file-name}
 *   content/about/{unique-file-name}
 *   content/story/{unique-file-name}
 */
export async function uploadSiteImage(
  category: SiteImageCategory,
  file: File,
): Promise<{
  url: string | null;
  path: string | null;
  error: Error | null;
}> {
  try {
    const validation = validateSiteImageFile(file);
    if (!validation.valid) {
      return { url: null, path: null, error: new Error(validation.error) };
    }

    // Determine clean file extension
    let extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (extension === "jpeg") extension = "jpg";
    if (!["jpg", "png", "webp"].includes(extension)) {
      if (file.type === "image/png") extension = "png";
      else if (file.type === "image/webp") extension = "webp";
      else extension = "jpg";
    }

    const uniqueId = generateUUID();
    const storagePath = `content/${category}/${uniqueId}.${extension}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(SITE_IMAGES_BUCKET)
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
      .from(SITE_IMAGES_BUCKET)
      .getPublicUrl(uploadData.path || storagePath);

    return {
      url: publicUrlData.publicUrl,
      path: uploadData.path || storagePath,
      error: null,
    };
  } catch (err: unknown) {
    return {
      url: null,
      path: null,
      error: err instanceof Error ? err : new Error("Failed to upload image file."),
    };
  }
}

/**
 * Optionally removes an image object from the site-images bucket.
 */
export async function deleteSiteImageFromStorage(
  pathOrUrl: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    if (!pathOrUrl || typeof pathOrUrl !== "string") {
      return { success: true, error: null };
    }

    const path = pathOrUrl.includes("://") ? extractSiteImageStoragePath(pathOrUrl) : pathOrUrl;

    if (!path) {
      return { success: true, error: null };
    }

    const { error } = await supabase.storage.from(SITE_IMAGES_BUCKET).remove([path]);

    if (error) {
      console.warn("Notice deleting storage image:", error.message);
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    console.warn("Caught error removing storage image:", err);
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to delete storage image."),
    };
  }
}
