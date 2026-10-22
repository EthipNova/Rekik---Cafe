/**
 * ============================================================================
 * Rekik Café — Shared Authentication Session & Token Resolver
 * File: src/lib/auth-token.ts
 * ============================================================================
 * Solves "Authentication required" failures end-to-end:
 * 1. Proactively inspects active Supabase session.
 * 2. Detects expired or near-expiry access tokens and refreshes them automatically.
 * 3. Recovers sessions from localStorage if memory state has not yet initialized.
 * 4. Provides valid Bearer authorization headers for all protected API calls.
 * ============================================================================
 */

import { supabase } from "@/lib/supabase";

/**
 * Retrieves a verified, non-expired access token for API requests.
 * Refreshes the token if it has expired or will expire within 60 seconds.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    // 1. Check in-memory session from Supabase client
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const nowSec = Math.floor(Date.now() / 1000);

    // If session is present and still valid for at least 60 seconds, use it directly
    if (session?.access_token) {
      const isExpired = session.expires_at ? session.expires_at <= nowSec + 60 : false;
      if (!isExpired) {
        return session.access_token;
      }

      // Proactively refresh the expired or near-expiry session
      try {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshed?.session?.access_token) {
          return refreshed.session.access_token;
        }
      } catch (e) {
        console.warn("[auth-token] Proactive session refresh failed:", e);
      }
    }

    // 2. If session was null or refresh failed, inspect localStorage for stored Supabase session
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);

            // Attempt to restore session using stored refresh token
            if (parsed?.refresh_token) {
              const { data: recovered, error: recErr } = await supabase.auth.refreshSession({
                refresh_token: parsed.refresh_token,
              });
              if (!recErr && recovered?.session?.access_token) {
                return recovered.session.access_token;
              }
            }

            // Fallback: if access token has not yet expired, use it
            if (parsed?.access_token && parsed?.expires_at && parsed.expires_at > nowSec + 10) {
              return parsed.access_token;
            }
          }
        }
      }
    } catch (storageErr) {
      console.warn("[auth-token] LocalStorage session recovery error:", storageErr);
    }

    // 3. Last fallback: try refreshSession() without arguments to trigger client recovery
    try {
      const { data: finalAttempt, error: finalErr } = await supabase.auth.refreshSession();
      if (!finalErr && finalAttempt?.session?.access_token) {
        return finalAttempt.session.access_token;
      }
    } catch {
      /* ignore */
    }

    return null;
  } catch (err) {
    console.warn("[auth-token] getValidAccessToken encountered unexpected error:", err);
    return null;
  }
}

/**
 * Returns HTTP headers containing the active Authorization Bearer token,
 * or returns base headers if no valid token could be obtained.
 */
export async function getAuthHeaders(
  additionalHeaders: Record<string, string> = {},
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...additionalHeaders };
  const token = await getValidAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
