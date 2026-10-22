import { createClient } from "@supabase/supabase-js";

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

const envMeta = typeof import.meta !== "undefined" && import.meta ? import.meta.env : undefined;
const envProc = typeof process !== "undefined" ? process.env : undefined;

const supabaseUrl =
  (envMeta ? (envMeta["VITE_SUPABASE_URL"] as string | undefined) : undefined) ||
  (envProc ? envProc["VITE_SUPABASE_URL"] || envProc["SUPABASE_URL"] : undefined) ||
  "";

const supabaseKey =
  (envMeta ? (envMeta["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) : undefined) ||
  (envProc ? envProc["VITE_SUPABASE_PUBLISHABLE_KEY"] || envProc["SUPABASE_KEY"] : undefined) ||
  "";

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "NEBA Café: Supabase credentials not found in environment. Ensure SUPABASE_URL and SUPABASE_KEY are set.",
  );
}

export { supabaseUrl, supabaseKey };

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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
