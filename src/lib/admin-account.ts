import { supabase, type UserRole } from "./supabase";

export const AVATARS_BUCKET = "avatars";
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AdminAccountProfile = {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  phone: string;
  avatarUrl: string | null;
  accountCreatedAt: string | null;
  lastSignInAt: string | null;
  dbCreatedAt: string | null;
  dbUpdatedAt: string | null;
};

export type ProfileUpdateInput = {
  fullName: string;
  phone: string;
};

export type AdminUserData = {
  role: UserRole;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

/**
 * Extracts uppercase initials from full name or email for avatar fallback.
 */
export function getInitials(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email?.trim()) {
    return email.slice(0, 2).toUpperCase();
  }
  return "AD";
}

/**
 * Generates an RFC 4122 v4 UUID string with cross-platform fallback.
 */
function generateUUID(): string {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Validates candidate avatar image file for format and size (<= 5 MB).
 */
export function validateAvatarFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image size exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  const isAllowedMime = ALLOWED_AVATAR_MIME_TYPES.includes(
    file.type.toLowerCase() as (typeof ALLOWED_AVATAR_MIME_TYPES)[number],
  );

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
 * Extracts storage path from an avatar public URL if it points to the avatars bucket.
 */
export function extractAvatarStoragePath(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const marker = `/${AVATARS_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length);
  return path.split("?")[0] || null;
}

/**
 * Fetches the currently authenticated administrator/staff account.
 * Supabase Auth is source of truth for identity/email/timestamps.
 * public.users is source of truth for role, full_name, phone, avatar_url.
 */
export async function fetchCurrentAdminAccount(): Promise<{
  data: AdminAccountProfile | null;
  error: string | null;
}> {
  try {
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();

    if (sessionErr || !session?.user) {
      return { data: null, error: "Not authenticated. Please sign in." };
    }

    const authUser = session.user;

    // Load record from public.users using authenticated user id
    const { data: dbUser, error: dbErr } = await supabase
      .from("users")
      .select("id, email, role, full_name, phone, avatar_url, created_at, updated_at")
      .eq("id", authUser.id)
      .maybeSingle();

    if (dbErr) {
      // If columns do not exist yet in database, fall back to basic query
      const { data: fallbackUser } = await supabase
        .from("users")
        .select("id, email, role, created_at, updated_at")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!fallbackUser) {
        return {
          data: null,
          error: "User record not found in café system. Contact administrator.",
        };
      }

      return {
        data: {
          id: authUser.id,
          email: authUser.email || fallbackUser.email,
          role: fallbackUser.role,
          fullName: (authUser.user_metadata?.["full_name"] as string) || "",
          phone: (authUser.user_metadata?.["phone"] as string) || "",
          avatarUrl: (authUser.user_metadata?.["avatar_url"] as string) || null,
          accountCreatedAt: authUser.created_at || null,
          lastSignInAt: authUser.last_sign_in_at || null,
          dbCreatedAt: fallbackUser.created_at || null,
          dbUpdatedAt: fallbackUser.updated_at || null,
        },
        error: null,
      };
    }

    if (!dbUser) {
      return {
        data: null,
        error: "User record not found in café system. Contact administrator.",
      };
    }

    const profile: AdminAccountProfile = {
      id: authUser.id,
      email: authUser.email || dbUser.email,
      role: dbUser.role,
      fullName: dbUser.full_name || (authUser.user_metadata?.["full_name"] as string) || "",
      phone: dbUser.phone || (authUser.user_metadata?.["phone"] as string) || "",
      avatarUrl: dbUser.avatar_url || (authUser.user_metadata?.["avatar_url"] as string) || null,
      accountCreatedAt: authUser.created_at || null,
      lastSignInAt: authUser.last_sign_in_at || null,
      dbCreatedAt: dbUser.created_at || null,
      dbUpdatedAt: dbUser.updated_at || null,
    };

    return { data: profile, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load account profile.";
    return { data: null, error: msg };
  }
}

/**
 * Updates application profile details (full_name, phone) in public.users.
 * Strictly never updates role, id, email, created_at, or updated_at.
 */
export async function updateAdminProfile(
  input: ProfileUpdateInput,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return { success: false, error: "Not authenticated. Please sign in." };
    }

    const userId = session.user.id;

    // Strict payload: ONLY full_name and phone are permitted
    const payload: { full_name: string; phone: string } = {
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
    };

    const { error: updateErr } = await supabase.from("users").update(payload).eq("id", userId);

    if (updateErr) {
      // If the column does not exist yet (migration pending), provide clear feedback
      if (updateErr.message?.includes("column") || updateErr.code === "42703") {
        return {
          success: false,
          error:
            "Database columns are not yet provisioned in public.users. Please run the SQL migration.",
        };
      }
      return {
        success: false,
        error: updateErr.message || "Failed to save profile changes.",
      };
    }

    return { success: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update profile.";
    return { success: false, error: msg };
  }
}

/**
 * Uploads an avatar image to avatars/{userId}/{uniqueFilename} in Supabase Storage.
 * Updates public.users.avatar_url on success and removes previous avatar file if safe.
 */
export async function uploadAdminAvatar(
  file: File,
  previousAvatarUrl?: string | null,
): Promise<{
  success: boolean;
  avatarUrl: string | null;
  error: string | null;
}> {
  try {
    const validation = validateAvatarFile(file);
    if (!validation.valid) {
      return { success: false, avatarUrl: null, error: validation.error || "Invalid file." };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return { success: false, avatarUrl: null, error: "Not authenticated." };
    }

    const userId = session.user.id;

    // Clean extension
    let extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    if (extension === "jpeg") extension = "jpg";
    if (!["jpg", "png", "webp"].includes(extension)) {
      if (file.type === "image/png") extension = "png";
      else if (file.type === "image/webp") extension = "webp";
      else extension = "jpg";
    }

    const uniqueId = generateUUID();
    // Required path structure: avatars/{authenticated-user-id}/{unique-filename}
    const storagePath = `avatars/${userId}/${uniqueId}.${extension}`;

    // Upload to avatars bucket
    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || `image/${extension === "jpg" ? "jpeg" : extension}`,
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        avatarUrl: null,
        error: uploadError.message || "Failed to upload avatar image to storage.",
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Update public.users.avatar_url
    const { error: dbUpdateErr } = await supabase
      .from("users")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    if (dbUpdateErr) {
      // Clean up newly uploaded file to avoid orphaned storage objects
      await supabase.storage.from(AVATARS_BUCKET).remove([storagePath]);
      return {
        success: false,
        avatarUrl: null,
        error: dbUpdateErr.message || "Failed to update profile avatar in database.",
      };
    }

    // Safely remove previous avatar from storage if it belonged to this user's avatar path
    if (previousAvatarUrl) {
      const oldPath = extractAvatarStoragePath(previousAvatarUrl);
      if (oldPath && oldPath.startsWith(`avatars/${userId}/`) && oldPath !== storagePath) {
        await supabase.storage
          .from(AVATARS_BUCKET)
          .remove([oldPath])
          .catch(() => {
            /* ignore background cleanup failure */
          });
      }
    }

    return { success: true, avatarUrl: publicUrl, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to upload avatar.";
    return { success: false, avatarUrl: null, error: msg };
  }
}

/**
 * Removes the avatar from public.users and deletes the file from the avatars bucket.
 */
export async function deleteAdminAvatar(
  currentAvatarUrl?: string | null,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return { success: false, error: "Not authenticated." };
    }

    const userId = session.user.id;

    // Clear avatar_url in database
    const { error: dbErr } = await supabase
      .from("users")
      .update({ avatar_url: null })
      .eq("id", userId);

    if (dbErr) {
      return { success: false, error: dbErr.message || "Failed to clear avatar in database." };
    }

    // Remove file from storage if path points to this user's avatar
    if (currentAvatarUrl) {
      const oldPath = extractAvatarStoragePath(currentAvatarUrl);
      if (oldPath && oldPath.startsWith(`avatars/${userId}/`)) {
        await supabase.storage
          .from(AVATARS_BUCKET)
          .remove([oldPath])
          .catch(() => {
            /* ignore */
          });
      }
    }

    return { success: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to remove avatar.";
    return { success: false, error: msg };
  }
}

/**
 * Changes password using Supabase Auth.
 * Re-authenticates current credentials first, then updates the password.
 * Password is NEVER stored in database or localStorage.
 */
export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!currentPassword) {
      return { success: false, error: "Please enter your current password." };
    }

    if (!newPassword || newPassword.length < 8) {
      return {
        success: false,
        error: "New password must be at least 8 characters long.",
      };
    }

    if (currentPassword === newPassword) {
      return {
        success: false,
        error: "New password must be different from your current password.",
      };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.email) {
      return { success: false, error: "Active session not found. Please sign in again." };
    }

    // Re-verify current password using Supabase Auth
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });

    if (verifyErr) {
      return {
        success: false,
        error: "Current password is incorrect.",
      };
    }

    // Call Supabase Auth updateUser with new password
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateErr) {
      return {
        success: false,
        error: updateErr.message || "Failed to update password.",
      };
    }

    return { success: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Password update failed.";
    return { success: false, error: msg };
  }
}
