import { createClient } from "@supabase/supabase-js";

/**
 * ============================================================================
 * NEBA Cafe -- Server-Side Supabase Client (src/server/supabase.ts)
 * ============================================================================
 * Used exclusively by server-side code: SSR handlers, API routes, db helpers.
 *
 * Key resolution order:
 *   1. SUPABASE_SERVICE_ROLE_KEY -- bypasses RLS; preferred for server writes
 *   2. SUPABASE_KEY              -- anon/publishable key; requires RLS policies
 *
 * SECURITY:
 *   - SUPABASE_SERVICE_ROLE_KEY must NEVER appear in envPrefix (vite.config.ts)
 *   - It must NEVER be prefixed with VITE_ or imported via import.meta.env
 *   - Only process.env (Node server process) should ever read this value
 */

const envProc =
  typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);

const configuredUrl: string = envProc["SUPABASE_URL"] || envProc["VITE_SUPABASE_URL"] || "";

// Prefer the service-role key (bypasses RLS) over the anon/publishable key.
const serviceRoleKey: string | undefined = envProc["SUPABASE_SERVICE_ROLE_KEY"];
const anonKey: string | undefined = envProc["SUPABASE_KEY"] || envProc["VITE_SUPABASE_PUBLISHABLE_KEY"];
const configuredKey: string = serviceRoleKey || anonKey || "";

export const isSupabaseConfigured = Boolean(configuredUrl && configuredKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[server-supabase] Supabase credentials not found in environment. Running in offline/local-fallback mode.",
  );
}

const supabaseUrl = configuredUrl || "https://placeholder-project.supabase.co";
const supabaseKey = configuredKey || "placeholder-key";

const usingServiceRole = Boolean(serviceRoleKey);

if (isSupabaseConfigured && !usingServiceRole) {
  console.warn(
    "[server-supabase] WARNING: Using SUPABASE_KEY (anon/publishable key).\n" +
      "  Row-Level Security policies on 'orders', 'order_items', 'payments', and\n" +
      "  'customers' must allow INSERT/SELECT for the 'anon' role, or order creation\n" +
      "  will fail with a 42501 RLS error.\n" +
      "  To fix permanently: add SUPABASE_SERVICE_ROLE_KEY to your .env file.\n" +
      "  Get it from: Supabase Dashboard -> Project Settings -> API -> service_role key",
  );
} else if (isSupabaseConfigured) {
  console.log("[server-supabase] Using service-role key -- RLS bypassed for server operations.");
}

export const serverSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Server-side client must never persist sessions or auto-refresh tokens.
    // This prevents accidental state leakage between requests.
    persistSession: false,
    autoRefreshToken: false,
  },
});

/** True when the server client was initialized with the service-role key. */
export const isServiceRoleClient = usingServiceRole;

