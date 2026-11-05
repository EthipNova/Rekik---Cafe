import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type UserRole = "ADMIN" | "STAFF" | "CUSTOMER";

export type DbUser = {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DbCustomer = {
  id: string;
  user_id?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      users: {
        Row: DbUser;
        Insert: DbUser;
        Update: Partial<DbUser>;
        Relationships: [];
      };
      customers: {
        Row: DbCustomer;
        Insert: DbCustomer;
        Update: Partial<DbCustomer>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};

function ensureEnvLoaded(): void {
  if (typeof process === "undefined" || !process.cwd) return;
  if (process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"]) return;

  try {
    // Dynamic import to prevent bundler bundling node modules into client bundles
    const fs = typeof window === "undefined" ? (process as any).mainModule?.require("node:fs") || (globalThis as any).require?.("node:fs") : null;
    const path = typeof window === "undefined" ? (process as any).mainModule?.require("node:path") || (globalThis as any).require?.("node:path") : null;
    if (fs && path) {
      const full = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(full)) {
        const content = fs.readFileSync(full, "utf-8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          const rawVal = trimmed.slice(eqIdx + 1).trim();
          const value = rawVal.replace(/^(['"])(.*)\1$/, "$2");
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch {
    /* ignore file read issues */
  }
}
ensureEnvLoaded();

const envMeta = typeof import.meta !== "undefined" && import.meta ? import.meta.env : undefined;
const envProc = typeof process !== "undefined" ? process.env : undefined;

const supabaseUrl =
  (envMeta ? (envMeta["VITE_SUPABASE_URL"] as string | undefined) : undefined) ||
  (envProc ? envProc["VITE_SUPABASE_URL"] || envProc["SUPABASE_URL"] : undefined) ||
  "https://imqtqshcgvgxokojfgxv.supabase.co";

const supabaseKey =
  (envMeta ? (envMeta["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) : undefined) ||
  (envProc ? envProc["VITE_SUPABASE_PUBLISHABLE_KEY"] || envProc["SUPABASE_KEY"] : undefined) ||
  "placeholder-key";

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Rekik Café: Supabase credentials not found in environment. Ensure SUPABASE_URL and SUPABASE_KEY are set.",
  );
}

export { supabaseUrl, supabaseKey };

export type PortalType = "admin" | "waiter" | "cashier" | "customer";

/**
 * Native Portal Storage Keys for Cross-Tab Session Isolation.
 * By dedicating separate storage keys to each portal, `@supabase/gotrue-js`
 * cross-tab storage event listeners ignore changes from other portals,
 * completely preventing multi-tab session overwrites and redirect collisions.
 */
export function getPortalStorageKey(portal: PortalType): string {
  switch (portal) {
    case "admin":
      return "sb-rekik-admin-token";
    case "waiter":
      return "sb-rekik-waiter-token";
    case "cashier":
      return "sb-rekik-cashier-token";
    default:
      return "sb-rekik-customer-token";
  }
}

/**
 * Detects the active portal based on current window location pathname.
 */
export function getActivePortal(): PortalType {
  if (typeof window === "undefined") {
    return "customer";
  }
  const pathname = (window.location.pathname || "").toLowerCase();
  if (pathname.startsWith("/admin")) {
    return "admin";
  }
  if (pathname.startsWith("/waiter")) {
    return "waiter";
  }
  if (pathname.startsWith("/casher") || pathname.startsWith("/cashier")) {
    return "cashier";
  }
  return "customer";
}

function createPortalClient(portal: PortalType): SupabaseClient<Database> {
  const isBrowser = typeof window !== "undefined";
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      storage: isBrowser ? window.localStorage : undefined,
      storageKey: getPortalStorageKey(portal),
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser && portal === "admin",
    },
  });
}

// Dedicated portal singletons guaranteeing 100% session isolation across tabs
export const adminSupabase = createPortalClient("admin");
export const waiterSupabase = createPortalClient("waiter");
export const cashierSupabase = createPortalClient("cashier");
export const customerSupabase = createPortalClient("customer");

export function getPortalClient(portal: PortalType): SupabaseClient<Database> {
  switch (portal) {
    case "admin":
      return adminSupabase;
    case "waiter":
      return waiterSupabase;
    case "cashier":
      return cashierSupabase;
    default:
      return customerSupabase;
  }
}

/**
 * Universal dynamic proxy: transparently delegates all queries, real-time channels,
 * and auth operations to the active portal's dedicated client.
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    const activeClient = getPortalClient(getActivePortal());
    const val = Reflect.get(activeClient, prop, receiver);
    if (typeof val === "function") {
      return val.bind(activeClient);
    }
    return val;
  },
});

/**
 * Creates a request-scoped Supabase client that forwards an authenticated user's bearer token
 * to PostgREST so that Row-Level Security (RLS) policies evaluate auth.uid() correctly.
 */
export function createScopedClient(token: string) {
  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
