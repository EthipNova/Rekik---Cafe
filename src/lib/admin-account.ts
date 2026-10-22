import { supabase, type UserRole } from "./supabase";
import { getValidAccessToken } from "@/lib/auth-token";

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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Fetches the currently authenticated administrator/staff account.
 * Primary path: server endpoint /api/admin/account with active session Bearer token.
 * Fallback path: client-side inspection of staff_profiles, users, and Supabase Auth session.
 */
export async function fetchCurrentAdminAccount(): Promise<{
  data: AdminAccountProfile | null;
  error: string | null;
}> {
  try {
    const token = await getValidAccessToken();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const authUser = session?.user;

    // 1. Primary path: fetch from authenticated server API endpoint
    if (typeof window !== "undefined" && token) {
      try {
        const response = await fetch("/api/admin/account", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const json = await response.json();
          if (json?.data) {
            return { data: json.data as AdminAccountProfile, error: null };
          }
        }
      } catch {
        /* proceed to client fallback */
      }
    }

    if (!authUser) {
      return { data: null, error: "Not authenticated. Please sign in." };
    }

    // 2. Direct client fallback: check staff_profiles, users, and session metadata
    let staffData: {
      full_name?: string | null;
      phone?: string | null;
      role?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    } | null = null;
    try {
      const { data } = await (supabase.from("staff_profiles" as any) as any)
        .select("full_name, phone, role, created_at, updated_at")
        .eq("user_id", authUser.id)
        .maybeSingle();
      staffData = data;
    } catch {
      /* ignore */
    }

    let userData: {
      full_name?: string | null;
      phone?: string | null;
      avatar_url?: string | null;
      role?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    } | null = null;
    try {
      const { data } = await (supabase.from("users" as any) as any)
        .select("full_name, phone, avatar_url, role, created_at, updated_at")
        .eq("id", authUser.id)
        .maybeSingle();
      userData = data;
    } catch {
      /* ignore */
    }

    const rawRole = (staffData?.role || userData?.role || "ADMIN").toUpperCase();
    const role: UserRole = rawRole === "ADMIN" ? "ADMIN" : rawRole === "STAFF" ? "STAFF" : "ADMIN";

    const profile: AdminAccountProfile = {
      id: authUser.id,
      email: authUser.email || "",
      role,
      fullName:
        staffData?.full_name ||
        userData?.full_name ||
        (authUser.user_metadata?.["full_name"] as string) ||
        "",
      phone:
        staffData?.phone || userData?.phone || (authUser.user_metadata?.["phone"] as string) || "",
      avatarUrl: userData?.avatar_url || (authUser.user_metadata?.["avatar_url"] as string) || null,
      accountCreatedAt: authUser.created_at || userData?.created_at || null,
      lastSignInAt: authUser.last_sign_in_at || null,
      dbCreatedAt: staffData?.created_at || userData?.created_at || null,
      dbUpdatedAt: staffData?.updated_at || userData?.updated_at || null,
    };

    return { data: profile, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load account profile.";
    return { data: null, error: msg };
  }
}

/**
 * Updates application profile details (full_name, phone) via /api/admin/account.
 * Strictly never updates role, id, or email from the Account page.
 */
export async function updateAdminProfile(
  input: ProfileUpdateInput,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const token = await getValidAccessToken();
    if (!token) {
      return { success: false, error: "Authentication required. Please sign in." };
    }

    const fullName = input.fullName.trim();
    if (!fullName) {
      return { success: false, error: "Full name cannot be empty." };
    }

    // 1. Primary: send to server API endpoint /api/admin/account
    if (typeof window !== "undefined") {
      try {
        const response = await fetch("/api/admin/account", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName,
            phone: input.phone.trim(),
          }),
        });

        if (response.ok) {
          return { success: true, error: null };
        } else {
          const json = await response.json().catch(() => null);
          const errMsg =
            response.status === 401
              ? "Authentication required. Your session may have expired. Please sign in again."
              : json?.message || `Failed to update profile (HTTP ${response.status})`;
          return {
            success: false,
            error: errMsg,
          };
        }
      } catch {
        /* proceed to direct Supabase fallback */
      }
    }

    // 2. Direct client fallback: update users and staff_profiles
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: "Not authenticated. Please sign in." };
    }
    const payload = {
      full_name: fullName,
      phone: input.phone.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      await supabase.from("users").update(payload).eq("id", userId);
    } catch {
      /* ignore */
    }

    try {
      await (supabase.from("staff_profiles" as any) as any).update(payload).eq("user_id", userId);
    } catch {
      /* ignore */
    }

    return { success: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update profile.";
    return { success: false, error: msg };
  }
}

/**
 * Uploads an avatar image using /api/admin/account/avatar.
 * Updates public.users.avatar_url and Supabase Auth metadata.
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

    const token = await getValidAccessToken();
    if (!token) {
      return { success: false, avatarUrl: null, error: "Authentication required. Please sign in." };
    }

    // 1. Primary: send dataUrl to /api/admin/account/avatar
    if (typeof window !== "undefined") {
      try {
        const dataUrl = await fileToDataUrl(file);
        const response = await fetch("/api/admin/account/avatar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            dataUrl,
            previousAvatarUrl,
          }),
        });

        if (response.ok) {
          const json = await response.json();
          return { success: true, avatarUrl: json.avatarUrl, error: null };
        } else {
          const errJson = await response.json().catch(() => null);
          const errMsg =
            response.status === 401
              ? "Authentication required. Your session may have expired. Please sign in again."
              : errJson?.message || "Failed to upload avatar.";
          return {
            success: false,
            avatarUrl: null,
            error: errMsg,
          };
        }
      } catch {
        /* proceed to direct storage upload fallback */
      }
    }

    // 2. Direct client fallback
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, avatarUrl: null, error: "Not authenticated. Please sign in." };
    }
    let extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    if (extension === "jpeg") extension = "jpg";
    if (!["jpg", "png", "webp"].includes(extension)) {
      if (file.type === "image/png") extension = "png";
      else if (file.type === "image/webp") extension = "webp";
      else extension = "jpg";
    }

    const uniqueId = generateUUID();
    const storagePath = `avatars/${userId}/${uniqueId}.${extension}`;

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

    const { data: urlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", userId);

    return { success: true, avatarUrl: publicUrl, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to upload avatar.";
    return { success: false, avatarUrl: null, error: msg };
  }
}

/**
 * Removes the avatar via /api/admin/account/avatar.
 */
export async function deleteAdminAvatar(
  currentAvatarUrl?: string | null,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const token = await getValidAccessToken();
    if (!token) {
      return { success: false, error: "Authentication required. Please sign in." };
    }

    // 1. Primary: send DELETE to /api/admin/account/avatar
    if (typeof window !== "undefined") {
      try {
        const response = await fetch("/api/admin/account/avatar", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ currentAvatarUrl, avatarUrl: currentAvatarUrl }),
        });

        if (response.ok) {
          return { success: true, error: null };
        } else {
          const errJson = await response.json().catch(() => null);
          const errMsg =
            response.status === 401
              ? "Authentication required. Your session may have expired. Please sign in again."
              : errJson?.message || "Failed to remove avatar.";
          return {
            success: false,
            error: errMsg,
          };
        }
      } catch {
        /* proceed to direct Supabase fallback */
      }
    }

    // 2. Direct client fallback
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: false, error: "Not authenticated. Please sign in." };
    }
    await supabase.from("users").update({ avatar_url: null }).eq("id", userId);

    if (currentAvatarUrl) {
      const oldPath = extractAvatarStoragePath(currentAvatarUrl);
      if (oldPath && oldPath.startsWith(`avatars/${userId}/`)) {
        await supabase.storage
          .from(AVATARS_BUCKET)
          .remove([oldPath])
          .catch(() => {});
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
