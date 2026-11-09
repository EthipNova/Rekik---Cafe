/**
 * ============================================================================
 * Rekik Café — Staff ID Management & Generation Service
 * File: src/server/staff-id.ts
 * ============================================================================
 * Generates, allocates, tracks, and migrates unique human-readable Staff IDs
 * (e.g. RK-001, RK-002, RK-003, ..., RK-007, etc.).
 *
 * Invariants:
 * 1. Unique, short, easy to remember, human-readable (never Supabase UUID).
 * 2. Permanent: deactivating or deleting a staff member NEVER reuses an issued Staff ID.
 * 3. Case-insensitive lookup (e.g. 'rk-001' or 'RK-001').
 * 4. Multi-tier persistence:
 *    - Persisted in Supabase Auth user_metadata.staff_id
 *    - Persisted in public.staff_profiles.staff_id (where column exists)
 *    - Persisted in data/db.json staff_registry to guarantee deleted IDs are never recycled.
 */

import fs from "node:fs";
import path from "node:path";
import { serverSupabase } from "./supabase";

export const STAFF_ID_PREFIX = "RK-";
export const STAFF_ID_REGEX = /^RK-(\d{3,})$/i;

export interface AllocatedStaffRecord {
  staffId: string;
  userId: string;
  sequence: number;
  role: string;
  name: string;
  email: string | null;
  allocatedAt: string;
  isDeleted?: boolean | undefined;
  isActive?: boolean | undefined;
}

export interface StaffIdRegistry {
  lastSequence: number;
  allocated: Record<string, AllocatedStaffRecord>; // keyed by uppercase staffId (e.g. "RK-001")
  userToStaffId: Record<string, string>; // keyed by userId
}

const DB_JSON_PATH = path.resolve(process.cwd(), "data", "db.json");

// Baseline migration mapping for pre-existing staff members ordered by creation date
export interface BaselineStaffItem {
  userId: string;
  staffId: string;
  name: string;
  role: string;
  email?: string | undefined;
  isActive?: boolean | undefined;
}

export const BASELINE_STAFF_MAPPING: BaselineStaffItem[] = [
    {
      userId: "5d2b434b-0b18-461b-a12d-9a93ac8fc92a",
      staffId: "RK-001",
      name: "Rekik Cashier",
      role: "cashier",
      email: "cashier@rekikcafe.com",
    isActive: false,
    },
    {
      userId: "e9504215-7be6-489d-8471-83a86eb9ef4e",
      staffId: "RK-002",
      name: "henok",
      role: "waiter",
      email: "henok00@gmail.com",
    },
    {
      userId: "e145d152-0ecb-43d6-863c-06fa40c12db4",
      staffId: "RK-003",
      name: "Admin Sisay Verified",
      role: "admin",
      email: "kbstar77sisay@gmail.com",
    },
    {
      userId: "9ce996c4-d645-4480-be49-629f85343ae0",
      staffId: "RK-004",
      name: "Temporary Test Waiter",
      role: "waiter",
      email: "temp.waiter.1792528026386@rekiktest.local",
    },
    {
      userId: "a5c18c86-c102-4355-b713-e93975e0a689",
      staffId: "RK-005",
      name: "Kibreab Sisay",
      role: "waiter",
      email: "bstar77sisay@gmail.com",
    },
    {
      userId: "593c8d07-904a-4f10-9571-dbf4c6af7250",
      staffId: "RK-006",
      name: "henok",
      role: "cashier",
      email: "star77sisay@gmail.com",
    },
    {
      userId: "61bee678-4df9-4061-9843-c35ca3f0cb48",
      staffId: "RK-007",
      name: "bonsa",
      role: "waiter",
      email: "kb@gmail.com",
    },
    {
      userId: "5bca6d75-ca78-44ec-8410-5a770ee56bde",
      staffId: "RK-008",
      name: "Almaz",
      role: "waiter",
      email: "almaz.waiter@gmail.com",
    },
  ];

/**
 * Format sequence number to standard Staff ID string.
 * e.g. 1 -> "RK-001", 12 -> "RK-012", 123 -> "RK-123"
 */
export function formatStaffId(sequence: number): string {
  if (!Number.isFinite(sequence) || sequence < 1) {
    throw new Error(`Invalid sequence number for Staff ID: ${sequence}`);
  }
  return `RK-${String(Math.floor(sequence)).padStart(3, "0")}`;
}

/**
 * Parses numeric sequence from Staff ID string.
 * Returns null if format does not match.
 */
export function parseStaffIdSequence(staffId: string): number | null {
  if (!staffId || typeof staffId !== "string") return null;
  const match = staffId.trim().match(STAFF_ID_REGEX);
  if (!match || !match[1]) return null;
  const num = parseInt(match[1], 10);
  return isNaN(num) ? null : num;
}

/**
 * Validates whether a string is a valid Staff ID.
 */
export function isValidStaffIdFormat(staffId: string): boolean {
  if (!staffId || typeof staffId !== "string") return false;
  return STAFF_ID_REGEX.test(staffId.trim());
}

/**
 * In-memory singleton registry cache.
 */
let memoryRegistry: StaffIdRegistry | null = null;

/**
 * Loads registry from disk (data/db.json) and merges with baseline mappings.
 */
export function loadRegistry(): StaffIdRegistry {
  if (memoryRegistry) {
    return memoryRegistry;
  }

  const registry: StaffIdRegistry = {
    lastSequence: 0,
    allocated: {},
    userToStaffId: {},
  };

  // Seed baseline staff mapping first
  for (const item of BASELINE_STAFF_MAPPING) {
    const seq = parseStaffIdSequence(item.staffId) || 0;
    const rec: AllocatedStaffRecord = {
      staffId: item.staffId.toUpperCase(),
      userId: item.userId,
      sequence: seq,
      role: item.role,
      name: item.name,
      email: item.email || null,
      allocatedAt: "2026-10-18T00:00:00.000Z",
    };
    if (typeof item.isActive === "boolean") {
      rec.isActive = item.isActive;
    }
    registry.allocated[item.staffId.toUpperCase()] = rec;
    registry.userToStaffId[item.userId] = item.staffId.toUpperCase();
    if (seq > registry.lastSequence) {
      registry.lastSequence = seq;
    }
  }

  // Load from data/db.json if available
  try {
    if (fs.existsSync(DB_JSON_PATH)) {
      const raw = fs.readFileSync(DB_JSON_PATH, "utf-8");
      const data = JSON.parse(raw);
      if (data && typeof data === "object" && data.staff_registry) {
        const stored = data.staff_registry as StaffIdRegistry;
        if (stored.allocated && typeof stored.allocated === "object") {
          for (const [k, v] of Object.entries(stored.allocated)) {
            const normalizedKey = k.toUpperCase();
            const baseItem = BASELINE_STAFF_MAPPING.find((b) => b.staffId.toUpperCase() === normalizedKey);
            const rec: AllocatedStaffRecord = {
              ...v,
              staffId: normalizedKey,
            };
            if (v.userId === "e145d152-0ecb-43d6-863c-06fa40c12db4" || normalizedKey === "RK-003") {
              rec.role = "admin";
            }
            if (typeof baseItem?.isActive === "boolean" && typeof v.isActive !== "boolean") {
              rec.isActive = baseItem.isActive;
            }
            registry.allocated[normalizedKey] = rec;
            if (v.userId) {
              registry.userToStaffId[v.userId] = normalizedKey;
            }
            if (v.sequence && v.sequence > registry.lastSequence) {
              registry.lastSequence = v.sequence;
            }
          }
        }
        if (stored.lastSequence && stored.lastSequence > registry.lastSequence) {
          registry.lastSequence = stored.lastSequence;
        }
      }
    }
  } catch (err) {
    console.warn("[staff-id] Failed to load staff_registry from db.json:", err);
  }

  memoryRegistry = registry;
  return registry;
}

/**
 * Persists the registry to data/db.json.
 */
export function saveRegistry(registry: StaffIdRegistry): void {
  memoryRegistry = registry;
  try {
    if (fs.existsSync(DB_JSON_PATH)) {
      const raw = fs.readFileSync(DB_JSON_PATH, "utf-8");
      const data = JSON.parse(raw);
      data.staff_registry = registry;
      fs.writeFileSync(DB_JSON_PATH, JSON.stringify(data, null, 2), "utf-8");
    }
  } catch (err) {
    console.warn("[staff-id] Failed to save staff_registry to db.json:", err);
  }
}

/**
 * Generates the next available Staff ID sequence, guaranteeing permanent uniqueness.
 * Deleting or deactivating previous staff members will never cause reuse of IDs.
 */
export async function getNextStaffId(): Promise<{ staffId: string; sequence: number }> {
  const registry = loadRegistry();

  // Also query database to verify no higher sequence exists in staff_profiles or audit_logs (with 1.5s timeout)
  let maxDbSeq = 0;
  try {
    const dbPromise = (serverSupabase.from("staff_profiles" as any) as any)
      .select("user_id, staff_id")
      .limit(200);

    const timeoutPromise = new Promise<{ data: null }>((resolve) =>
      setTimeout(() => resolve({ data: null }), 1500),
    );

    const { data: profiles } = await Promise.race([dbPromise, timeoutPromise]);

    if (Array.isArray(profiles)) {
      for (const p of profiles) {
        if (p.staff_id) {
          const s = parseStaffIdSequence(p.staff_id);
          if (s && s > maxDbSeq) maxDbSeq = s;
        }
      }
    }
  } catch {
    /* ignore db query errors */
  }

  const nextSeq = Math.max(registry.lastSequence, maxDbSeq) + 1;
  const staffId = formatStaffId(nextSeq);
  return { staffId, sequence: nextSeq };
}

/**
 * Allocates and records a new Staff ID for a user.
 */
export async function allocateStaffId(params: {
  userId: string;
  name: string;
  role: string;
  email?: string;
  customStaffId?: string;
}): Promise<string> {
  const registry = loadRegistry();

  // If already allocated for this user, return existing Staff ID
  if (registry.userToStaffId[params.userId]) {
    return registry.userToStaffId[params.userId]!;
  }

  let staffId: string;
  let sequence: number;

  if (params.customStaffId && isValidStaffIdFormat(params.customStaffId)) {
    staffId = params.customStaffId.trim().toUpperCase();
    sequence = parseStaffIdSequence(staffId) || registry.lastSequence + 1;
  } else {
    const next = await getNextStaffId();
    staffId = next.staffId;
    sequence = next.sequence;
  }

  // Ensure sequence counter never goes backwards
  if (sequence > registry.lastSequence) {
    registry.lastSequence = sequence;
  }

  const record: AllocatedStaffRecord = {
    staffId,
    userId: params.userId,
    sequence,
    role: params.role,
    name: params.name,
    email: params.email || null,
    allocatedAt: new Date().toISOString(),
  };

  registry.allocated[staffId] = record;
  registry.userToStaffId[params.userId] = staffId;
  saveRegistry(registry);

  // Sync to Supabase Auth user_metadata if valid UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.userId);
  if (isUuid) {
    try {
      const { data: userRecord } = await serverSupabase.auth.admin.getUserById(params.userId);
      if (userRecord?.user) {
        const existingMeta = (userRecord.user.user_metadata as Record<string, unknown>) || {};
        await serverSupabase.auth.admin.updateUserById(params.userId, {
          user_metadata: {
            ...existingMeta,
            staff_id: staffId,
          },
        });
      }
    } catch (authErr) {
      console.warn(`[staff-id] Auth metadata sync warning for ${params.userId}:`, authErr);
    }
  }

  // Attempt to write staff_id column to staff_profiles
  try {
    await (serverSupabase.from("staff_profiles" as any) as any)
      .update({ staff_id: staffId, updated_at: new Date().toISOString() })
      .eq("user_id", params.userId);
  } catch {
    /* ignore column missing */
  }

  return staffId;
}

/**
 * Resolves a Staff ID from a userId.
 */
export function getStaffIdForUserId(userId: string): string | null {
  if (!userId) return null;
  const registry = loadRegistry();
  return registry.userToStaffId[userId] || null;
}

/**
 * Finds staff member record by Staff ID.
 * Returns identity, role, active status, and email.
 */
export async function findStaffByStaffId(rawStaffId: string): Promise<{
  userId: string;
  staffId: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  phone: string | null;
} | null> {
  if (!rawStaffId || typeof rawStaffId !== "string") return null;
  const cleanedInput = rawStaffId.trim();
  const isEmailInput = cleanedInput.includes("@");
  const normalizedStaffId = cleanedInput.toUpperCase();
  const registry = loadRegistry();

  let allocated = isEmailInput ? undefined : registry.allocated[normalizedStaffId];
  let userId = allocated?.userId;
  let resolvedStaffId = allocated?.staffId || (isEmailInput ? "" : normalizedStaffId);

  // If input is an email, search registry by email
  if (isEmailInput) {
    const lowerEmail = cleanedInput.toLowerCase();
    for (const record of Object.values(registry.allocated)) {
      if (record.email?.toLowerCase() === lowerEmail) {
        allocated = record;
        userId = record.userId;
        resolvedStaffId = record.staffId;
        break;
      }
    }
  }

  // If not found in registry, check Supabase Auth users list
  if (!userId) {
    try {
      const { data: authList } = await serverSupabase.auth.admin.listUsers();
      if (Array.isArray(authList?.users)) {
        for (const u of authList.users) {
          const metaStaffId = (u.user_metadata as Record<string, unknown>)?.["staff_id"];
          const userEmail = (u.email || "").toLowerCase();

          const matchesStaffId =
            !isEmailInput &&
            typeof metaStaffId === "string" &&
            metaStaffId.trim().toUpperCase() === normalizedStaffId;
          const matchesEmail = isEmailInput && userEmail === cleanedInput.toLowerCase();

          if (matchesStaffId || matchesEmail) {
            userId = u.id;
            const staffIdForRecord =
              (typeof metaStaffId === "string" && metaStaffId.trim().toUpperCase()) ||
              registry.userToStaffId[u.id] ||
              formatStaffId(registry.lastSequence + 1);
            resolvedStaffId = staffIdForRecord;

            // Record in registry
            registry.allocated[staffIdForRecord] = {
              staffId: staffIdForRecord,
              userId: u.id,
              sequence: parseStaffIdSequence(staffIdForRecord) || 0,
              role: ((u.user_metadata as Record<string, unknown>)?.["role"] as string) || "staff",
              name: ((u.user_metadata as Record<string, unknown>)?.["full_name"] as string) || "Staff",
              email: u.email || null,
              allocatedAt: u.created_at || new Date().toISOString(),
            };
            registry.userToStaffId[u.id] = staffIdForRecord;
            saveRegistry(registry);
            break;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!userId) {
    return null;
  }

  // Ensure resolvedStaffId is set
  if (!resolvedStaffId) {
    resolvedStaffId = registry.userToStaffId[userId] || normalizedStaffId;
  }

  // Fetch live profile from staff_profiles
  let staffProfile: {
    user_id: string;
    full_name: string;
    role: string;
    phone: string | null;
    is_active: boolean;
    email?: string | null;
  } | null = null;

  try {
    const { data } = await (serverSupabase.from("staff_profiles" as any) as any)
      .select("user_id, full_name, role, phone, is_active")
      .eq("user_id", userId)
      .maybeSingle();
    staffProfile = data;
  } catch {
    /* fallback to users / registry */
  }

  // Fetch email from users / auth
  let email = allocated?.email || "";
  if (!email) {
    try {
      const { data: u } = await (serverSupabase.from("users" as any) as any)
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      if (u?.email) email = u.email;
    } catch {
      /* ignore */
    }
  }

  if (!email) {
    try {
      const { data: authUser } = await serverSupabase.auth.admin.getUserById(userId);
      if (authUser?.user?.email) email = authUser.user.email;
    } catch {
      /* ignore */
    }
  }

  const isDesignatedAdmin = userId === "e145d152-0ecb-43d6-863c-06fa40c12db4";
  const rawRole = (staffProfile?.role || allocated?.role || "staff").toLowerCase();
  const role = isDesignatedAdmin ? "admin" : rawRole;
  const fullName = staffProfile?.full_name || allocated?.name || (isDesignatedAdmin ? "Admin Sisay" : "Staff Member");
  const isActive = staffProfile && typeof staffProfile.is_active === "boolean" ? staffProfile.is_active : (allocated?.isActive !== false);
  const phone = staffProfile?.phone || null;

  return {
    userId,
    staffId: resolvedStaffId,
    fullName,
    email,
    role,
    isActive,
    phone,
  };
}

/**
 * Marks a Staff ID as deleted in the registry, ensuring that the sequence
 * number and ID are NEVER reused in future allocations.
 */
export function markStaffIdDeleted(userId: string): void {
  const registry = loadRegistry();
  const staffId = registry.userToStaffId[userId];
  if (staffId && registry.allocated[staffId]) {
    registry.allocated[staffId]!.isDeleted = true;
    delete registry.userToStaffId[userId];
    saveRegistry(registry);
  }
}

/**
 * Updates the active status of a staff member in the staff registry.
 */
export function updateStaffIdActiveStatus(userId: string, isActive: boolean): void {
  const registry = loadRegistry();
  const staffId = registry.userToStaffId[userId];
  if (staffId && registry.allocated[staffId]) {
    registry.allocated[staffId]!.isActive = isActive;
    saveRegistry(registry);
  }
}

/**
 * Migrates and backfills existing staff members so every staff profile has
 * a permanent, unique Staff ID (RK-001, RK-002, ...).
 */
export async function migrateExistingStaff(): Promise<{
  migrated: Array<{ userId: string; staffId: string; name: string }>;
}> {
  const registry = loadRegistry();
  const results: Array<{ userId: string; staffId: string; name: string }> = [];

  // 1. Ensure baseline staff are in registry
  for (const b of BASELINE_STAFF_MAPPING) {
    if (!registry.userToStaffId[b.userId]) {
      registry.allocated[b.staffId] = {
        staffId: b.staffId,
        userId: b.userId,
        sequence: parseStaffIdSequence(b.staffId) || 0,
        role: b.role,
        name: b.name,
        email: b.email || null,
        allocatedAt: "2026-10-18T00:00:00.000Z",
      };
      registry.userToStaffId[b.userId] = b.staffId;
    }
  }

  // 2. Query any other staff_profiles from database
  try {
    const { data: profiles } = await (serverSupabase.from("staff_profiles" as any) as any)
      .select("user_id, full_name, role, phone, created_at")
      .order("created_at", { ascending: true });

    if (Array.isArray(profiles)) {
      for (const p of profiles) {
        if (!registry.userToStaffId[p.user_id]) {
          const next = await getNextStaffId();
          registry.lastSequence = next.sequence;
          registry.allocated[next.staffId] = {
            staffId: next.staffId,
            userId: p.user_id,
            sequence: next.sequence,
            role: p.role || "staff",
            name: p.full_name || "Staff Member",
            email: null,
            allocatedAt: p.created_at || new Date().toISOString(),
          };
          registry.userToStaffId[p.user_id] = next.staffId;
          results.push({
            userId: p.user_id,
            staffId: next.staffId,
            name: p.full_name || "Staff Member",
          });
        }
      }
    }
  } catch {
    /* ignore */
  }

  saveRegistry(registry);

  // Sync to Supabase Auth metadata for all allocated users
  for (const [staffId, record] of Object.entries(registry.allocated)) {
    if (record.userId) {
      try {
        const { data: u } = await serverSupabase.auth.admin.getUserById(record.userId);
        if (u?.user) {
          const existing = (u.user.user_metadata as Record<string, unknown>) || {};
          if (existing["staff_id"] !== staffId) {
            await serverSupabase.auth.admin.updateUserById(record.userId, {
              user_metadata: {
                ...existing,
                staff_id: staffId,
              },
            });
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  return { migrated: results };
}
