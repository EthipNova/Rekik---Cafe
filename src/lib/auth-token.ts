/**
 * ============================================================================
 * Rekik Café — Shared Authentication Session & Token Resolver
 * File: src/lib/auth-token.ts
 * ============================================================================
 * Solves "Authentication required" failures end-to-end:
 * 1. Proactively inspects active Supabase session for the active portal.
 * 2. Detects expired or near-expiry access tokens and refreshes them automatically.
 * 3. Recovers sessions from portal-isolated storage if memory state is initializing.
 * 4. Strictly prevents cross-portal and cross-tab token contamination.
 * 5. Provides valid Bearer authorization headers for all protected API calls.
 * ============================================================================
 */

import {
  getActivePortal,
  getPortalClient,
  getPortalStorageKey,
  type PortalType,
} from "@/lib/supabase";

/**
 * Retrieves a verified, non-expired access token for API requests.
 * Uses the portal-isolated client to ensure independent sessions in multi-tab workflows.
 * Refreshes the token if it has expired or will expire within 60 seconds.
 */
export async function getValidAccessToken(portal?: PortalType): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const activePortal = portal || getActivePortal();
  const client = getPortalClient(activePortal);
  const targetStorageKey = getPortalStorageKey(activePortal);

  try {
    // 1. Check in-memory session from the active portal's Supabase client
    const {
      data: { session },
    } = await client.auth.getSession();

    const nowSec = Math.floor(Date.now() / 1000);

    // If session is present and still valid for at least 60 seconds, use it directly
    if (session?.access_token) {
      const isExpired = session.expires_at ? session.expires_at <= nowSec + 60 : false;
      if (!isExpired) {
        return session.access_token;
      }

      // Proactively refresh the expired or near-expiry session on this portal's client
      try {
        const { data: refreshed, error: refreshErr } = await client.auth.refreshSession();
        if (!refreshErr && refreshed?.session?.access_token) {
          return refreshed.session.access_token;
        }
      } catch (e) {
        console.warn(`[auth-token:${activePortal}] Proactive session refresh failed:`, e);
      }
    }

    // 2. If session was null or refresh failed, inspect localStorage for this portal's token ONLY
    try {
      const raw = localStorage.getItem(targetStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);

        // If stored access token has not yet expired, return it immediately
        if (parsed?.access_token && parsed?.expires_at && parsed.expires_at > nowSec + 10) {
          return parsed.access_token;
        }

        // Attempt to restore session using stored refresh token if expired or near expiry
        if (parsed?.refresh_token) {
          const { data: recovered, error: recErr } = await client.auth.refreshSession({
            refresh_token: parsed.refresh_token,
          });
          if (!recErr && recovered?.session?.access_token) {
            return recovered.session.access_token;
          }
        }
      }
    } catch (storageErr) {
      console.warn(`[auth-token:${activePortal}] LocalStorage session recovery error:`, storageErr);
    }

    // 3. Last fallback: try refreshSession() without arguments on this portal's client
    try {
      const { data: finalAttempt, error: finalErr } = await client.auth.refreshSession();
      if (!finalErr && finalAttempt?.session?.access_token) {
        return finalAttempt.session.access_token;
      }
    } catch {
      /* ignore */
    }

    return null;
  } catch (err) {
    console.warn(`[auth-token:${activePortal}] getValidAccessToken error:`, err);
    return null;
  }
}

/**
 * Returns HTTP headers containing the active Authorization Bearer token,
 * or returns base headers if no valid token could be obtained.
 */
export async function getAuthHeaders(
  additionalHeaders: Record<string, string> = {},
  portal?: PortalType,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...additionalHeaders };
  const token = await getValidAccessToken(portal);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
