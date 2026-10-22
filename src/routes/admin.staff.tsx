/**
 * ============================================================================
 * Rekik Café — Category 3: Staff and Activity Monitoring
 * File: src/routes/admin.staff.tsx
 * ============================================================================
 * Implements the Business Owner Staff & Activity Monitoring console adhering
 * strictly to the Rekik Café Supabase Workflow Guide:
 * - Real registered staff records from staff_profiles (no invented attendance/shift data)
 * - Operational workload queues (orders awaiting waiter, active waiter assignments,
 *   orders awaiting payment, proofs awaiting cashier review, rejection logs)
 * - Distinct activity accountability: order_approvals (waiters), payment_reviews
 *   (cashiers), order_status_logs (lifecycle transitions), audit_logs (admin events)
 * - System notifications and governance audit logs
 * - Strict read-only owner monitoring (no unauthorized role/assignment mutation)
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Filter,
  Info,
  KeyRound,
  Lock,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  User,
  UserCheck,
  UserPlus,
  Users,
  UtensilsCrossed,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/site/Section";
import { formatETB } from "@/lib/menu-data";
import { statusLabels } from "@/lib/orders";
import { readSettings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import {
  loadStaffMonitoringData,
  type ActivityType,
  type StaffActivityItem,
  type StaffDatePreset,
  type StaffMonitoringData,
  type StaffProfileRecord,
  type StaffRole,
} from "@/lib/staff-monitoring";
import {
  type PaymentAccountSetting,
  getPaymentAccountSettings,
  savePaymentAccountSetting,
} from "@/lib/payment-settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/staff")({
  head: () => ({
    meta: [
      { title: "Staff & Activity Monitoring — Rekik Coffee" },
      {
        name: "description",
        content:
          "Authoritative staff directory, operational workload monitoring, and staff activity accountability for Rekik Coffee.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RekikStaffMonitoringPage,
});

/**
 * Role Badge styling for Rekik Café Staff
 */
function StaffRoleBadge({ role }: { role: StaffRole }) {
  const r = (role || "").toLowerCase().trim();
  switch (r) {
    case "admin":
      return (
        <Badge
          variant="outline"
          className="bg-primary/10 text-primary border-primary/30 text-xs py-0.5 px-2 font-medium"
        >
          Administrator
        </Badge>
      );
    case "waiter":
      return (
        <Badge
          variant="outline"
          className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-xs py-0.5 px-2 font-medium"
        >
          Waiter
        </Badge>
      );
    case "cashier":
      return (
        <Badge
          variant="outline"
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs py-0.5 px-2 font-medium"
        >
          Cashier
        </Badge>
      );
    case "kitchen":
      return (
        <Badge
          variant="outline"
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs py-0.5 px-2 font-medium"
        >
          Kitchen Staff
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs capitalize">
          {role || "Staff"}
        </Badge>
      );
  }
}

/**
 * Activity Type Badge
 */
function ActivityTypeBadge({ type }: { type: ActivityType }) {
  switch (type) {
    case "waiter_approval":
      return (
        <Badge
          variant="outline"
          className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[11px] gap-1 font-medium"
        >
          <UtensilsCrossed className="size-3" />
          <span>Waiter Decision</span>
        </Badge>
      );
    case "cashier_review":
      return (
        <Badge
          variant="outline"
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] gap-1 font-medium"
        >
          <FileCheck2 className="size-3" />
          <span>Cashier Review</span>
        </Badge>
      );
    case "status_transition":
      return (
        <Badge
          variant="outline"
          className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 text-[11px] gap-1 font-medium"
        >
          <Activity className="size-3" />
          <span>Order Transition</span>
        </Badge>
      );
    case "audit_log":
      return (
        <Badge
          variant="outline"
          className="bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30 text-[11px] gap-1 font-medium"
        >
          <ShieldCheck className="size-3" />
          <span>Admin Audit</span>
        </Badge>
      );
  }
}

/**
 * Calculates password strength score (0-3), label, and styling.
 */
function getPasswordStrength(password: string): {
  score: number;
  label: "Weak" | "Fair" | "Strong";
  color: string;
} {
  if (!password) return { score: 0, label: "Weak", color: "bg-muted" };
  let s = 0;
  if (password.length >= 6) s++;
  if (password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)) s++;
  if (password.length >= 10 && /[^A-Za-z0-9]/.test(password)) s++;
  if (s <= 1) return { score: 1, label: "Weak", color: "bg-amber-500" };
  if (s === 2) return { score: 2, label: "Fair", color: "bg-blue-500" };
  return { score: 3, label: "Strong", color: "bg-emerald-500" };
}

function RekikStaffMonitoringPage() {
  const [data, setData] = useState<StaffMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authentication & Administrative Permissions
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Staff Registration Form State (Exactly 3 fields + separate role selector)
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [registerRole, setRegisterRole] = useState<"waiter" | "cashier">("waiter");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  // Status Change Confirmation State
  const [statusConfirmStaff, setStatusConfirmStaff] = useState<StaffProfileRecord | null>(null);
  const [statusActionType, setStatusActionType] = useState<"activate" | "deactivate">("deactivate");
  const [statusLoading, setStatusLoading] = useState(false);

  // Receiving Accounts State (public.payment_account_settings)
  const [isReceivingAccountsOpen, setIsReceivingAccountsOpen] = useState(false);
  const [receivingAccountsList, setReceivingAccountsList] = useState<PaymentAccountSetting[]>([]);
  const [receivingAccountsLoading, setReceivingAccountsLoading] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccountSetting | null>(null);
  const [accountFormMethod, setAccountFormMethod] = useState<"telebirr" | "cbe">("telebirr");
  const [accountFormNumber, setAccountFormNumber] = useState("");
  const [accountFormOwner, setAccountFormOwner] = useState("");
  const [accountFormActive, setAccountFormActive] = useState(true);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountFormError, setAccountFormError] = useState<string | null>(null);
  const [isAccountFormOpen, setIsAccountFormOpen] = useState(false);

  const loadReceivingAccounts = useCallback(async () => {
    setReceivingAccountsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accounts = await getPaymentAccountSettings(session?.access_token);
      setReceivingAccountsList(accounts);
    } catch (err: unknown) {
      console.error("[staff] Failed to load receiving accounts:", err);
    } finally {
      setReceivingAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReceivingAccountsOpen) {
      void loadReceivingAccounts();
    }
  }, [isReceivingAccountsOpen, loadReceivingAccounts]);

  const handleOpenEditAccount = (acc: PaymentAccountSetting) => {
    setEditingAccount(acc);
    setAccountFormMethod(acc.payment_method);
    setAccountFormNumber(acc.account_number);
    setAccountFormOwner(acc.account_owner_name);
    setAccountFormActive(acc.is_active);
    setAccountFormError(null);
    setIsAccountFormOpen(true);
  };

  const handleOpenCreateAccount = (presetMethod?: "telebirr" | "cbe") => {
    setEditingAccount(null);
    setAccountFormMethod(presetMethod || "telebirr");
    setAccountFormNumber("");
    setAccountFormOwner("Rekik Coffee");
    setAccountFormActive(true);
    setAccountFormError(null);
    setIsAccountFormOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFormError(null);

    const num = accountFormNumber.trim();
    if (!num || num.length < 3) {
      setAccountFormError("Account / Till number is required (at least 3 characters).");
      return;
    }

    const owner = accountFormOwner.trim();
    if (!owner || owner.length < 2) {
      setAccountFormError("Account holder name is required (at least 2 characters).");
      return;
    }

    setAccountSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await savePaymentAccountSetting(
        {
          id: editingAccount?.id,
          payment_method: accountFormMethod,
          account_number: num,
          account_owner_name: owner,
          is_active: accountFormActive,
        },
        session?.access_token,
      );

      toast.success(
        `${accountFormMethod === "telebirr" ? "Telebirr" : "CBE"} receiving account saved successfully.`,
      );
      setIsAccountFormOpen(false);
      setEditingAccount(null);
      await loadReceivingAccounts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save receiving account";
      setAccountFormError(msg);
      toast.error(msg);
    } finally {
      setAccountSaving(false);
    }
  };

  const handleToggleAccountActive = async (acc: PaymentAccountSetting) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await savePaymentAccountSetting(
        {
          id: acc.id,
          payment_method: acc.payment_method,
          account_number: acc.account_number,
          account_owner_name: acc.account_owner_name,
          is_active: !acc.is_active,
        },
        session?.access_token,
      );

      toast.success(
        `${acc.payment_method === "telebirr" ? "Telebirr" : "CBE"} account ${!acc.is_active ? "activated" : "deactivated"}.`,
      );
      await loadReceivingAccounts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update account status";
      toast.error(msg);
    }
  };

  // Password strength calculation for the registration form
  const passwordStrength = useMemo(() => getPasswordStrength(registerPassword), [registerPassword]);

  // Administrative permissions verification
  useEffect(() => {
    let isMounted = true;
    async function verifyAdminAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (!session?.user) {
          setIsAdmin(false);
          setCurrentUserId(null);
          return;
        }
        setCurrentUserId(session.user.id);

        // Check staff_profiles first
        const { data: profile } = (await (supabase.from("staff_profiles" as any) as any)
          .select("role, is_active")
          .eq("user_id", session.user.id)
          .maybeSingle()) as {
          data: { role?: string; is_active?: boolean } | null;
          error: unknown;
        };

        if (profile && profile.is_active !== false) {
          const r = (profile.role || "").toLowerCase();
          if (["admin", "owner", "manager"].includes(r)) {
            setIsAdmin(true);
            return;
          }
        }

        // Check users table
        const { data: userRecord } = (await (supabase.from("users" as any) as any)
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle()) as { data: { role?: string } | null; error: unknown };

        if (userRecord && userRecord.role === "ADMIN") {
          setIsAdmin(true);
          return;
        }

        const meta = session.user.user_metadata as Record<string, unknown> | undefined;
        if (meta?.["role"] === "ADMIN") {
          setIsAdmin(true);
          return;
        }

        setIsAdmin(false);
      } catch {
        if (isMounted) setIsAdmin(false);
      }
    }

    void verifyAdminAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle Staff Registration Submission
  const handleRegisterStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    setRegisterSuccess(null);

    const name = registerName.trim();
    const email = registerEmail.trim().toLowerCase();
    const password = registerPassword;

    if (!name) {
      setRegisterError("Staff name is required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setRegisterError("A valid email address is required.");
      return;
    }

    if (!password || password.length < 6) {
      setRegisterError("Password must be at least 6 characters long.");
      return;
    }

    setRegisterLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/admin/staff/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role: registerRole,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error(
            "An account with this email address already exists. Please use a different email.",
          );
        }
        throw new Error(json.error || "Failed to register staff account.");
      }

      setRegisterSuccess(
        `Successfully registered ${registerRole === "waiter" ? "Waiter" : "Cashier"} "${name}"!`,
      );
      toast.success(`Registered ${name} as ${registerRole}`);
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      await loadData();
      setTimeout(() => {
        setIsRegisterDialogOpen(false);
        setRegisterSuccess(null);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setRegisterError(msg);
      toast.error(msg);
    } finally {
      setRegisterLoading(false);
    }
  };

  // Handle Staff Status Confirmation (Activate / Deactivate)
  const handleConfirmStatusChange = async () => {
    if (!statusConfirmStaff) return;
    setStatusLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/admin/staff/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId: statusConfirmStaff.userId,
          isActive: statusActionType === "activate",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || `Failed to ${statusActionType} staff member.`);
      }

      toast.success(
        `Staff member ${statusConfirmStaff.fullName} has been ${statusActionType === "activate" ? "activated" : "deactivated"}.`,
      );
      setStatusConfirmStaff(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update staff status";
      toast.error(msg);
    } finally {
      setStatusLoading(false);
    }
  };

  // Date Range State
  const [preset, setPreset] = useState<StaffDatePreset>("7days");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [, startTransition] = useTransition();

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<"directory" | "workload" | "activity" | "governance">(
    "directory",
  );

  // Directory Filters
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Activity Log Filters
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>("all");
  const [activityStaffFilter, setActivityStaffFilter] = useState<string>("all");

  // Selected Staff for Inspection Sheet
  const [selectedStaffUserId, setSelectedStaffUserId] = useState<string | null>(null);

  // Store Settings
  const settings = readSettings();
  const cafeName = settings.cafeName || "Rekik Café";

  // Data Loading
  const loadData = useCallback(
    async (targetPreset = preset, start = customStart, end = customEnd) => {
      setLoading(true);
      setError(null);
      try {
        const res = await loadStaffMonitoringData(targetPreset, start, end);
        setData(res);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load staff monitoring data";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [preset, customStart, customEnd],
  );

  useEffect(() => {
    void loadData(preset, customStart, customEnd);
  }, [preset, customStart, customEnd, loadData]);

  // Handle Preset Change
  const handlePresetChange = (newPreset: string) => {
    if (newPreset === "custom") {
      setShowCustomRange(true);
      setPreset("custom");
    } else {
      setShowCustomRange(false);
      setPreset(newPreset as StaffDatePreset);
    }
  };

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      toast.error("Please enter both start and end dates.");
      return;
    }
    startTransition(() => {
      void loadData("custom", customStart, customEnd);
    });
  };

  // Filtered Staff Directory
  const filteredStaff = useMemo(() => {
    if (!data) return [];
    return data.staffProfiles.filter((s) => {
      if (roleFilter !== "all" && s.role.toLowerCase() !== roleFilter.toLowerCase()) {
        return false;
      }
      if (statusFilter === "active" && !s.isActive) return false;
      if (statusFilter === "inactive" && s.isActive) return false;

      if (staffSearchQuery.trim()) {
        const q = staffSearchQuery.toLowerCase().trim();
        const nameMatch = s.fullName.toLowerCase().includes(q);
        const emailMatch = (s.email || "").toLowerCase().includes(q);
        const phoneMatch = (s.phone || "").toLowerCase().includes(q);
        const roleMatch = s.role.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !phoneMatch && !roleMatch) return false;
      }

      return true;
    });
  }, [data, roleFilter, statusFilter, staffSearchQuery]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    if (!data) return [];
    return data.activities.filter((act) => {
      if (activityTypeFilter !== "all" && act.activityType !== activityTypeFilter) {
        return false;
      }
      if (activityStaffFilter !== "all" && act.actorUserId !== activityStaffFilter) {
        return false;
      }
      if (activitySearchQuery.trim()) {
        const q = activitySearchQuery.toLowerCase().trim();
        const numMatch = (act.orderNumber || "").toLowerCase().includes(q);
        const nameMatch = act.actorName.toLowerCase().includes(q);
        const reasonMatch = (act.reason || "").toLowerCase().includes(q);
        const notesMatch = (act.notes || "").toLowerCase().includes(q);
        if (!numMatch && !nameMatch && !reasonMatch && !notesMatch) return false;
      }
      return true;
    });
  }, [data, activityTypeFilter, activityStaffFilter, activitySearchQuery]);

  // Selected Staff Record for Drawer
  const selectedStaff = useMemo(() => {
    if (!selectedStaffUserId || !data) return null;
    return data.staffProfiles.find((s) => s.userId === selectedStaffUserId) || null;
  }, [selectedStaffUserId, data]);

  // Orders currently assigned to the selected staff member
  const selectedStaffOrders = useMemo(() => {
    if (!selectedStaffUserId || !data) return [];
    return data.workload.ordersAssignedToWaiters.filter((o) => o.waiterId === selectedStaffUserId);
  }, [selectedStaffUserId, data]);

  return (
    <div className="relative min-h-[calc(100vh-8rem)] space-y-6 sm:space-y-8 p-4 sm:p-6 lg:p-8 rounded-2xl border border-amber-950/15 dark:border-amber-900/30 bg-gradient-to-b from-[#FAF8F5] via-[#FCFAF6] to-[#F5F2EB] dark:from-[#181310] dark:via-[#140F0C] dark:to-[#0F0B09] shadow-sm overflow-hidden">
      {/* Subtle coffee aura background decorations */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-amber-500/10 dark:bg-amber-600/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/2 -left-24 size-80 rounded-full bg-orange-500/5 dark:bg-amber-800/10 blur-3xl"
        aria-hidden="true"
      />

      {/* ── 1. HEADER & PERIOD CONTROLS ────────────────────────────────────── */}
      <header className="relative flex flex-col gap-4 border-b border-amber-900/15 dark:border-amber-800/25 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <span>Staff & Activity Monitoring</span>
            </h1>
            <Badge
              variant="outline"
              className="bg-amber-900/10 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200 border-amber-800/30 dark:border-amber-600/30 text-xs font-semibold px-2.5 py-0.5 inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Coffee className="size-3.5 text-amber-700 dark:text-amber-400" />
              <span>Rekik Coffee</span>
            </Badge>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold px-2 py-0.5 inline-flex items-center gap-1"
            >
              <ShieldCheck className="size-3" /> Live Supabase
            </Badge>
            <Badge
              variant="secondary"
              className="text-[11px] text-muted-foreground hidden sm:inline-flex items-center gap-1 font-mono border border-border/40"
            >
              <Clock className="size-3" /> Hawassa (EAT / UTC+3)
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Authoritative staff directory, operational workload monitoring, and verified activity
            accountability for Rekik Coffee.
          </p>
        </div>

        {/* Global Date Range Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg p-1 shadow-xs">
            <Filter className="size-3.5 text-muted-foreground ml-1.5" aria-hidden />
            <Select value={preset} onValueChange={handlePresetChange}>
              <SelectTrigger
                id="staff-date-filter"
                aria-label="Filter staff activity by date range"
                className="h-8 border-none shadow-none text-xs font-medium focus:ring-0 focus:ring-offset-0 px-2 min-w-[130px]"
              >
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="today">Today (EAT)</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="all">All Recorded</SelectItem>
                <SelectItem value="custom">Custom Range…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="h-8 text-xs gap-1.5 shrink-0"
            aria-label="Refresh staff records from database"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      {/* ── Custom Date Range Inputs ──────────────────────────────────────── */}
      {showCustomRange && (
        <form
          onSubmit={handleApplyCustomDates}
          className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1">
            <label
              htmlFor="staff-custom-start"
              className="text-xs font-medium text-muted-foreground"
            >
              Start Date (EAT)
            </label>
            <Input
              id="staff-custom-start"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 text-xs w-[145px]"
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="staff-custom-end" className="text-xs font-medium text-muted-foreground">
              End Date (EAT)
            </label>
            <Input
              id="staff-custom-end"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 text-xs w-[145px]"
              required
            />
          </div>
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={loading}>
            <Calendar className="size-3.5" />
            Apply Window
          </Button>
        </form>
      )}

      {/* ── ERROR STATE ────────────────────────────────────────────────────── */}
      {error && !data && (
        <div className="surface-card p-8 text-center space-y-4 border border-destructive/30 bg-destructive/5 rounded-xl">
          <div className="inline-flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Unable to load staff monitoring records
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button onClick={() => void loadData()} size="sm" className="gap-2">
            <RefreshCw className="size-3.5" aria-hidden />
            Retry database query
          </Button>
        </div>
      )}

      {/* ── 2. PRIMARY STAFF OVERVIEW KPI CARDS ───────────────────────────── */}
      <section aria-labelledby="staff-kpi-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="staff-kpi-heading"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Staff & Operational Workload Overview
          </h2>
          {data && (
            <span className="text-[11px] text-muted-foreground">
              Refreshed at {data.lastRefreshedAt} EAT
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* KPI 1: Registered Staff Accounts */}
          <Card className="border-amber-900/15 dark:border-amber-800/25 border-l-4 border-l-[#8B4513] dark:border-l-[#D27D2D] bg-card/90 dark:bg-[#1a1411]/90 shadow-xs hover:border-amber-800/30 transition-all">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Registered Staff
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-700/10 text-amber-800 dark:text-amber-300">
                <Users className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <p className="font-display text-2xl font-bold tracking-tight text-foreground">
                {data ? data.totalStaffCount : "—"}
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {data ? data.activeStaffCount : 0} Active accounts
                </span>
                <span>{data ? data.inactiveStaffCount : 0} Inactive</span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                {data
                  ? `${data.roleCounts.waiter || 0} Waiters · ${data.roleCounts.cashier || 0} Cashiers · ${data.roleCounts.admin || 0} Admins`
                  : "Verified staff profiles from database."}
              </p>
            </CardContent>
          </Card>

          {/* KPI 2: Waiter Operational Queue */}
          <Card className="border-amber-900/15 dark:border-amber-800/25 border-l-4 border-l-[#C17A44] dark:border-l-[#E09858] bg-card/90 dark:bg-[#1a1411]/90 shadow-xs hover:border-amber-700/30 transition-all">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Waiter Queue
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <UtensilsCrossed className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-foreground">
                  {data ? data.workload.ordersAwaitingWaiterReview.length : "—"}
                </span>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Awaiting Review
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  <strong>{data?.workload.ordersAssignedToWaiters.length ?? 0}</strong> active in
                  service
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                Orders awaiting waiter acceptance or actively being served.
              </p>
            </CardContent>
          </Card>

          {/* KPI 3: Cashier Review Queue */}
          <Card className="border-amber-900/15 dark:border-amber-800/25 border-l-4 border-l-emerald-600 dark:border-l-emerald-500 bg-card/90 dark:bg-[#1a1411]/90 shadow-xs hover:border-emerald-700/30 transition-all">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cashier Review Queue
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <FileCheck2 className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-foreground">
                  {data ? data.workload.paymentProofsAwaitingCashierReview.length : "—"}
                </span>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Proofs Pending
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  <strong>{data?.workload.ordersAwaitingPayment.length ?? 0}</strong> awaiting
                  payment
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                Payment proofs submitted by customers awaiting cashier decision.
              </p>
            </CardContent>
          </Card>

          {/* KPI 4: Staff Accountability Actions */}
          <Card className="border-amber-900/15 dark:border-amber-800/25 border-l-4 border-l-stone-600 dark:border-l-stone-400 bg-card/90 dark:bg-[#1a1411]/90 shadow-xs hover:border-stone-500/30 transition-all">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Accountability Activity
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-stone-500/10 text-stone-700 dark:text-stone-300">
                <Activity className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-foreground">
                  {data ? data.activities.length : "—"}
                </span>
                <span className="text-xs font-medium text-muted-foreground">Recorded Actions</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  <strong>{data?.workload.recentlyRejectedItems.length ?? 0}</strong> rejections
                  logged
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                Combined waiter decisions, transitions, cashier reviews & audits.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 3. MAIN WORKSPACE TABS ─────────────────────────────────────────── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          setActiveTab(v as "directory" | "workload" | "activity" | "governance")
        }
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-amber-900/10 dark:border-amber-800/20 pb-2">
          <TabsList className="bg-stone-200/50 dark:bg-stone-900/70 border border-amber-900/10 dark:border-amber-800/20 p-1">
            <TabsTrigger value="directory" className="text-xs gap-1.5">
              <Users className="size-3.5" />
              <span>Staff Directory</span>
              {data && (
                <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">
                  {filteredStaff.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="workload" className="text-xs gap-1.5">
              <ShoppingBag className="size-3.5" />
              <span>Operational Workload</span>
              {data &&
                data.workload.ordersAwaitingWaiterReview.length +
                  data.workload.paymentProofsAwaitingCashierReview.length >
                  0 && (
                  <Badge variant="destructive" className="text-[10px] ml-1 px-1.5 py-0">
                    {data.workload.ordersAwaitingWaiterReview.length +
                      data.workload.paymentProofsAwaitingCashierReview.length}
                  </Badge>
                )}
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs gap-1.5">
              <Activity className="size-3.5" />
              <span>Activity & Decisions Log</span>
              {data && (
                <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">
                  {filteredActivities.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="governance" className="text-xs gap-1.5">
              <Bell className="size-3.5" />
              <span>Notifications & Audits</span>
            </TabsTrigger>
          </TabsList>

          <span className="text-xs text-muted-foreground">
            Rekik Staff Authority · Segregation of Duties Enforced
          </span>
        </div>

        {/* ── TAB 1: STAFF DIRECTORY & ROLES (PHASE 4) ────────────────────── */}
        <TabsContent value="directory" className="space-y-4 m-0">
          {/* Header & Registration Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Registered Staff Directory</h2>
              <p className="text-xs text-muted-foreground">
                Authoritative waiter, cashier, and staff accounts configured for Rekik Coffee.
              </p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setIsReceivingAccountsOpen(true)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs border-amber-900/30 dark:border-amber-700/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-950 dark:text-amber-200 shrink-0 font-medium transition-colors"
                  id="open-receiving-accounts-btn"
                >
                  <CreditCard className="size-3.5 text-amber-700 dark:text-amber-400" />
                  <span>Receiving Accounts</span>
                </Button>
                <Button
                  onClick={() => {
                    setRegisterError(null);
                    setRegisterSuccess(null);
                    setIsRegisterDialogOpen(true);
                  }}
                  size="sm"
                  className="gap-1.5 h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 font-medium transition-colors"
                  id="open-register-staff-dialog-btn"
                >
                  <UserPlus className="size-3.5" />
                  <span>Register Waiter / Cashier</span>
                </Button>
              </div>
            )}
          </div>

          {/* Search & Filter Toolbar */}
          <div className="surface-card p-4 space-y-3 rounded-xl border border-border/80">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Search Box */}
              <div className="relative lg:col-span-2">
                <Search
                  className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search staff by name, email, phone, or role…"
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                  aria-label="Search staff directory"
                />
              </div>

              {/* Role Filter */}
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-9 text-xs" aria-label="Filter staff by role">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assigned roles</SelectItem>
                  <SelectItem value="waiter">Waiters</SelectItem>
                  <SelectItem value="cashier">Cashiers</SelectItem>
                  <SelectItem value="admin">Administrators</SelectItem>
                  <SelectItem value="kitchen">Kitchen Staff</SelectItem>
                </SelectContent>
              </Select>

              {/* Account Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs" aria-label="Filter staff by account status">
                  <SelectValue placeholder="Account status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All account statuses</SelectItem>
                  <SelectItem value="active">Active Accounts</SelectItem>
                  <SelectItem value="inactive">Inactive Accounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Staff Directory Table */}
          {loading && !data ? (
            <div className="surface-card p-12 text-center text-sm text-muted-foreground rounded-xl">
              <p className="animate-pulse">Loading staff profiles from database…</p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="surface-card p-12 text-center space-y-3 rounded-xl">
              <p className="text-base font-medium">No matching staff profiles found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No staff records match your current search and role criteria.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStaffSearchQuery("");
                  setRoleFilter("all");
                  setStatusFilter("all");
                }}
                className="gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                Reset filters
              </Button>
            </div>
          ) : (
            <div className="surface-card overflow-hidden rounded-xl border border-border/80">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Staff Member
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Email Address
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Assigned Role
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Contact Phone
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Account Status
                      </TableHead>
                      <TableHead className="text-center font-semibold uppercase tracking-wider">
                        Active Assigned
                      </TableHead>
                      <TableHead className="text-center font-semibold uppercase tracking-wider">
                        Completed Orders
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Registered (EAT)
                      </TableHead>
                      <TableHead className="text-right font-semibold uppercase tracking-wider">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {filteredStaff.map((staff) => (
                      <TableRow
                        key={staff.userId}
                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setSelectedStaffUserId(staff.userId)}
                      >
                        {/* Name & ID */}
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{staff.fullName}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              ID: {staff.userId.slice(0, 8)}…
                            </span>
                          </div>
                        </TableCell>

                        {/* Email Address */}
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {staff.email ? (
                            <span className="text-foreground">{staff.email}</span>
                          ) : (
                            <span className="text-muted-foreground italic">No email</span>
                          )}
                        </TableCell>

                        {/* Role */}
                        <TableCell>
                          <StaffRoleBadge role={staff.role} />
                        </TableCell>

                        {/* Phone */}
                        <TableCell className="font-medium text-muted-foreground">
                          {staff.phone || "—"}
                        </TableCell>

                        {/* Account Status */}
                        <TableCell>
                          {staff.isActive ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] gap-1 font-medium"
                            >
                              <CheckCircle2 className="size-3" /> Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[11px] gap-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                            >
                              <XCircle className="size-3" /> Inactive
                            </Badge>
                          )}
                        </TableCell>

                        {/* Active Assigned Orders */}
                        <TableCell className="text-center">
                          {staff.activeAssignedOrdersCount > 0 ? (
                            <Badge
                              variant="outline"
                              className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-xs px-2 py-0.5 font-bold"
                            >
                              {staff.activeAssignedOrdersCount} in service
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>

                        {/* Completed Orders */}
                        <TableCell className="text-center font-medium text-foreground">
                          {staff.completedOrdersCount}
                        </TableCell>

                        {/* Registered */}
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(staff.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-right whitespace-nowrap">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isAdmin &&
                              staff.userId !== currentUserId &&
                              staff.role.toLowerCase() !== "admin" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                    "h-7 px-2 text-xs font-medium",
                                    staff.isActive
                                      ? "border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400"
                                      : "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
                                  )}
                                  onClick={() => {
                                    setStatusConfirmStaff(staff);
                                    setStatusActionType(staff.isActive ? "deactivate" : "activate");
                                  }}
                                  aria-label={`${staff.isActive ? "Deactivate" : "Activate"} staff member ${staff.fullName}`}
                                >
                                  {staff.isActive ? (
                                    <>
                                      <XCircle className="size-3 mr-1" />
                                      Deactivate
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="size-3 mr-1" />
                                      Activate
                                    </>
                                  )}
                                </Button>
                              )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-primary hover:text-primary"
                              onClick={() => setSelectedStaffUserId(staff.userId)}
                            >
                              <Eye className="size-3.5 mr-1" />
                              Workload
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── TAB 2: OPERATIONAL WORKLOAD QUEUES (PHASE 6) ─────────────────── */}
        <TabsContent value="workload" className="space-y-6 m-0">
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
            <Info className="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                Operational Workload Monitoring Overview
              </p>
              <p>
                This monitoring interface reflects active queue balances across Rekik Coffee&apos;s
                5-stage workflow. Order acceptances, waiter reassignments, and payment verifications
                must strictly be executed through authorized staff stations to uphold operational
                integrity.
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 1. Orders Awaiting Waiter Review */}
            <Card className="shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/60">
                <CardTitle className="font-display text-sm font-semibold flex items-center justify-between">
                  <span>Orders Awaiting Waiter Review</span>
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs"
                  >
                    {data?.workload.ordersAwaitingWaiterReview.length ?? 0}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Incoming orders awaiting waiter acceptance or table assignment
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data && data.workload.ordersAwaitingWaiterReview.length > 0 ? (
                  <div className="divide-y divide-border/60 max-h-[300px] overflow-y-auto">
                    {data.workload.ordersAwaitingWaiterReview.map((ord) => (
                      <div
                        key={ord.orderId}
                        className="p-3 text-xs flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-foreground">
                            Order {ord.orderNumber}{" "}
                            <span className="text-muted-foreground font-normal">
                              · {ord.customerName}
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {ord.method === "dine-in"
                              ? `Table ${ord.tableNumber || "Unassigned"}`
                              : ord.method === "takeaway"
                                ? "Takeaway"
                                : "Delivery"}{" "}
                            ·{" "}
                            {new Date(ord.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <span className="font-display font-bold text-primary">
                          {formatETB(ord.totalAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-6 text-center">
                    No orders currently awaiting waiter review.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 2. Payment Proofs Awaiting Cashier Review */}
            <Card className="shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/60">
                <CardTitle className="font-display text-sm font-semibold flex items-center justify-between">
                  <span>Proofs Awaiting Cashier Review</span>
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs"
                  >
                    {data?.workload.paymentProofsAwaitingCashierReview.length ?? 0}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Customer payment uploads pending cashier station audit
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data && data.workload.paymentProofsAwaitingCashierReview.length > 0 ? (
                  <div className="divide-y divide-border/60 max-h-[300px] overflow-y-auto">
                    {data.workload.paymentProofsAwaitingCashierReview.map((proof) => (
                      <div
                        key={proof.proofId}
                        className="p-3 text-xs flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-foreground">
                            Order {proof.orderNumber}{" "}
                            <span className="text-muted-foreground font-normal">
                              · {proof.customerName}
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Ref: {proof.transactionReference || "None"} ·{" "}
                            {new Date(proof.submittedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <span className="font-display font-bold text-primary">
                          {formatETB(proof.submittedAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-6 text-center">
                    No payment proofs pending cashier audit.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 3. Active Waiter Assignments */}
            <Card className="shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/60">
                <CardTitle className="font-display text-sm font-semibold flex items-center justify-between">
                  <span>Active Waiter Service Assignments</span>
                  <Badge variant="secondary" className="text-xs">
                    {data?.workload.ordersAssignedToWaiters.length ?? 0}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Orders actively handled by specific waiters
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data && data.workload.ordersAssignedToWaiters.length > 0 ? (
                  <div className="divide-y divide-border/60 max-h-[300px] overflow-y-auto">
                    {data.workload.ordersAssignedToWaiters.map((ord) => (
                      <div
                        key={ord.orderId}
                        className="p-3 text-xs flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-foreground">
                            Order {ord.orderNumber}{" "}
                            <span className="text-muted-foreground font-normal">
                              · Table {ord.tableNumber || "—"}
                            </span>
                          </p>
                          <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                            Waiter: {ord.waiterName}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {statusLabels[ord.status] || ord.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-6 text-center">
                    No active orders currently assigned to waiters.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 4. Recently Rejected Operational Items */}
            <Card className="shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/60">
                <CardTitle className="font-display text-sm font-semibold flex items-center justify-between">
                  <span>Recent Operational Rejections</span>
                  <Badge variant="destructive" className="text-xs">
                    {data?.workload.recentlyRejectedItems.length ?? 0}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Rejection logs with recorded operational rationale
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data && data.workload.recentlyRejectedItems.length > 0 ? (
                  <div className="divide-y divide-border/60 max-h-[300px] overflow-y-auto">
                    {data.workload.recentlyRejectedItems.map((rej, idx) => (
                      <div key={idx} className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-destructive">
                            Order {rej.orderNumber}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(rej.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground">
                          <strong>By:</strong> {rej.actorName}
                        </p>
                        <p className="text-[11px] text-muted-foreground italic bg-muted/40 p-1.5 rounded">
                          &quot;{rej.reason}&quot;
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-6 text-center">
                    No operational rejections recorded in recent activity.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB 3: STAFF ACTIVITY & ORDER ACCOUNTABILITY (PHASE 5) ───────── */}
        <TabsContent value="activity" className="space-y-4 m-0">
          {/* Activity Filters Toolbar */}
          <div className="surface-card p-4 space-y-3 rounded-xl border border-border/80">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Search */}
              <div className="relative">
                <Search
                  className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search order #, actor, reason…"
                  value={activitySearchQuery}
                  onChange={(e) => setActivitySearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Activity Type Filter */}
              <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All activity types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All activity types</SelectItem>
                  <SelectItem value="waiter_approval">Waiter Approvals</SelectItem>
                  <SelectItem value="cashier_review">Cashier Payment Reviews</SelectItem>
                  <SelectItem value="status_transition">Order Transitions</SelectItem>
                  <SelectItem value="audit_log">Admin Audit Logs</SelectItem>
                </SelectContent>
              </Select>

              {/* Specific Staff Filter */}
              <Select value={activityStaffFilter} onValueChange={setActivityStaffFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All staff members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff actors</SelectItem>
                  {data?.staffProfiles.map((s) => (
                    <SelectItem key={s.userId} value={s.userId}>
                      {s.fullName} ({s.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Reset */}
              <div className="flex items-center justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs gap-1.5 text-primary"
                  onClick={() => {
                    setActivitySearchQuery("");
                    setActivityTypeFilter("all");
                    setActivityStaffFilter("all");
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  Reset activity filters
                </Button>
              </div>
            </div>
          </div>

          {/* Activity Log Feed */}
          {loading && !data ? (
            <div className="surface-card p-12 text-center text-sm text-muted-foreground rounded-xl">
              <p className="animate-pulse">Loading activity records from database…</p>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="surface-card p-12 text-center space-y-3 rounded-xl">
              <p className="text-base font-medium">No activity records found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No staff actions recorded for this filter configuration and date window.
              </p>
            </div>
          ) : (
            <div className="surface-card overflow-hidden rounded-xl border border-border/80">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Timestamp (EAT)
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Action Type
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Staff Actor
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Order #
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Decision / Transition
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Operational Details & Notes
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {filteredActivities.map((act) => (
                      <TableRow key={act.id} className="hover:bg-muted/30">
                        {/* Timestamp */}
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(act.timestamp).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          ·{" "}
                          {new Date(act.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>

                        {/* Type */}
                        <TableCell className="whitespace-nowrap">
                          <ActivityTypeBadge type={act.activityType} />
                        </TableCell>

                        {/* Actor */}
                        <TableCell className="font-medium text-foreground whitespace-nowrap">
                          {act.actorName}
                          <span className="block text-[10px] text-muted-foreground capitalize">
                            {act.actorRole}
                          </span>
                        </TableCell>

                        {/* Order */}
                        <TableCell className="font-display font-semibold text-foreground whitespace-nowrap">
                          {act.orderNumber || "—"}
                        </TableCell>

                        {/* Decision / Transition */}
                        <TableCell className="whitespace-nowrap">
                          {act.decision === "approved" ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[11px] gap-1"
                            >
                              <CheckCircle2 className="size-3" /> Approved
                            </Badge>
                          ) : act.decision === "rejected" ? (
                            <Badge variant="destructive" className="text-[11px] gap-1">
                              <XCircle className="size-3" /> Rejected
                            </Badge>
                          ) : act.fromStatus && act.toStatus ? (
                            <div className="flex items-center gap-1 font-mono text-[11px]">
                              <span>{act.fromStatus}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-semibold text-primary">{act.toStatus}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground capitalize">
                              {act.decision || "Executed"}
                            </span>
                          )}
                        </TableCell>

                        {/* Details */}
                        <TableCell className="max-w-[320px] text-muted-foreground">
                          {act.reason && (
                            <p className="text-destructive font-medium truncate">
                              Reason: {act.reason}
                            </p>
                          )}
                          {act.notes && <p className="text-foreground truncate">{act.notes}</p>}
                          {act.actionDetails && (
                            <p className="font-mono text-[11px] text-muted-foreground truncate">
                              {act.actionDetails}
                            </p>
                          )}
                          {!act.reason && !act.notes && !act.actionDetails && "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── TAB 4: NOTIFICATIONS & AUDIT HISTORY (PHASE 7) ───────────────── */}
        <TabsContent value="governance" className="space-y-6 m-0">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* System Notifications */}
            <Card className="shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/60">
                <CardTitle className="font-display text-sm font-semibold flex items-center justify-between">
                  <span>System Staff Notifications</span>
                  <Bell className="size-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Operational alerts broadcast to staff devices and terminals
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data && data.notifications.length > 0 ? (
                  <div className="divide-y divide-border/60 max-h-[360px] overflow-y-auto">
                    {data.notifications.map((n) => (
                      <div key={n.id} className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            {!n.isRead && (
                              <span className="size-1.5 rounded-full bg-primary inline-block" />
                            )}
                            {n.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(n.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">{n.message}</p>
                        {n.orderNumber && (
                          <span className="font-mono text-[10px] text-primary">
                            Order {n.orderNumber}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-8 text-center">
                    No system notifications logged.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Administrative Audit Logs */}
            <Card className="shadow-xs">
              <CardHeader className="p-4 pb-2 border-b border-border/60">
                <CardTitle className="font-display text-sm font-semibold flex items-center justify-between">
                  <span>Administrative Audit Logs</span>
                  <ShieldCheck className="size-4 text-primary" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Security-sensitive administrative mutations and system events
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data && data.auditLogs.length > 0 ? (
                  <div className="divide-y divide-border/60 max-h-[360px] overflow-y-auto">
                    {data.auditLogs.map((al) => (
                      <div key={al.id} className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{al.action}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(al.createdAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          Entity: {al.entityType} ({al.entityId})
                        </p>
                        {al.details && (
                          <p className="text-[11px] text-muted-foreground bg-muted/40 p-1.5 rounded truncate">
                            {al.details}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-8 text-center">
                    No administrative audit events recorded in database.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── 4. STAFF WORKLOAD & INSPECTION SHEET (DRAWER) ───────────────────── */}
      <Sheet
        open={selectedStaffUserId !== null}
        onOpenChange={(open) => !open && setSelectedStaffUserId(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-md md:max-w-lg overflow-y-auto p-6 flex flex-col gap-6"
        >
          {selectedStaff ? (
            <>
              {/* Header */}
              <SheetHeader className="text-left space-y-2 pb-4 border-b border-border">
                <div className="flex items-center justify-between gap-2 pr-6">
                  <SheetTitle className="font-display text-2xl font-bold">
                    {selectedStaff.fullName}
                  </SheetTitle>
                  <StaffRoleBadge role={selectedStaff.role} />
                </div>
                <SheetDescription className="text-xs text-muted-foreground">
                  User ID: <span className="font-mono">{selectedStaff.userId}</span>
                </SheetDescription>
              </SheetHeader>

              {/* Account & Profile Summary */}
              <section aria-labelledby="drawer-staff-profile" className="space-y-3">
                <h3
                  id="drawer-staff-profile"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Staff Account Details
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email Address</span>
                    <span className="font-mono text-foreground">{selectedStaff.email || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone Number</span>
                    <span className="font-medium text-foreground">
                      {selectedStaff.phone || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Account Status</span>
                    {selectedStaff.isActive ? (
                      <Badge
                        variant="outline"
                        className="text-emerald-600 border-emerald-500/30 text-[10px]"
                      >
                        Active Account
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Registered Date</span>
                    <span className="text-muted-foreground">
                      {new Date(selectedStaff.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </section>

              {/* Workload Metrics */}
              <section aria-labelledby="drawer-staff-metrics" className="space-y-3">
                <h3
                  id="drawer-staff-metrics"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Operational Activity Metrics
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Active In Service
                    </span>
                    <p className="font-display text-xl font-bold text-primary">
                      {selectedStaff.activeAssignedOrdersCount}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Completed Orders
                    </span>
                    <p className="font-display text-xl font-bold text-foreground">
                      {selectedStaff.completedOrdersCount}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Approvals Decided
                    </span>
                    <p className="font-display text-xl font-bold text-blue-600">
                      {selectedStaff.totalApprovalsHandled}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Reviews Handled
                    </span>
                    <p className="font-display text-xl font-bold text-emerald-600">
                      {selectedStaff.totalReviewsHandled}
                    </p>
                  </div>
                </div>
              </section>

              {/* Active Assigned Orders */}
              <section aria-labelledby="drawer-staff-orders" className="space-y-3">
                <h3
                  id="drawer-staff-orders"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Active Assigned Orders ({selectedStaffOrders.length})
                </h3>
                {selectedStaffOrders.length > 0 ? (
                  <div className="rounded-xl border border-border bg-card/60 divide-y divide-border/60 overflow-hidden text-xs">
                    {selectedStaffOrders.map((ord) => (
                      <div key={ord.orderId} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">Order {ord.orderNumber}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Table {ord.tableNumber || "—"} · {ord.method}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {statusLabels[ord.status] || ord.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic p-3 bg-muted/20 rounded-xl">
                    No orders currently assigned in service.
                  </p>
                )}
              </section>

              {/* Close Button */}
              <div className="pt-2 mt-auto border-t border-border">
                <Button
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => setSelectedStaffUserId(null)}
                >
                  Close Inspection
                </Button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center space-y-3 my-auto">
              <h3 className="font-display text-lg font-semibold">Staff member not found</h3>
              <p className="text-xs text-muted-foreground">
                The selected profile could not be loaded.
              </p>
              <Button variant="outline" size="sm" onClick={() => setSelectedStaffUserId(null)}>
                Close
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── 4. STAFF REGISTRATION DIALOG (PHASE 2 REQUIREMENT) ───────────── */}
      <Dialog
        open={isRegisterDialogOpen}
        onOpenChange={(open) => {
          if (!registerLoading) {
            setIsRegisterDialogOpen(open);
            if (!open) {
              setRegisterError(null);
              setRegisterSuccess(null);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1">
            <DialogTitle className="font-display text-lg font-bold flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              <span>Register New Staff Member</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Register a new waiter or cashier for Rekik Coffee. Account credentials will be securely
              managed by Supabase Auth.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Separate Role Selector Control (Outside the 3 registration fields) */}
            <div className="rounded-lg border border-border/80 bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="staff-role-selector"
                  className="text-xs font-semibold text-foreground"
                >
                  Select Role
                </Label>
                <Badge variant="outline" className="text-[10px] bg-background font-normal">
                  Administrative Assignment
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Assign an operational café role. Registration of administrator accounts is
                restricted.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-0.5" id="staff-role-selector">
                <button
                  type="button"
                  onClick={() => setRegisterRole("waiter")}
                  disabled={registerLoading}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md border p-2.5 text-xs font-medium transition-all",
                    registerRole === "waiter"
                      ? "border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold ring-1 ring-blue-500/40 shadow-xs"
                      : "border-border/80 bg-background hover:bg-muted text-muted-foreground",
                  )}
                  aria-pressed={registerRole === "waiter"}
                >
                  <UtensilsCrossed className="size-3.5" />
                  <span>Waiter</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRegisterRole("cashier")}
                  disabled={registerLoading}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md border p-2.5 text-xs font-medium transition-all",
                    registerRole === "cashier"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold ring-1 ring-emerald-500/40 shadow-xs"
                      : "border-border/80 bg-background hover:bg-muted text-muted-foreground",
                  )}
                  aria-pressed={registerRole === "cashier"}
                >
                  <FileCheck2 className="size-3.5" />
                  <span>Cashier</span>
                </button>
              </div>
            </div>

            {/* Registration Form — Exactly Three Fields: 1. Name, 2. Email, 3. Password */}
            <form
              onSubmit={handleRegisterStaff}
              className="space-y-3.5"
              id="staff-registration-form"
            >
              {/* Field 1: Name */}
              <div className="space-y-1.5">
                <Label htmlFor="staff-name-input" className="text-xs font-medium">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="staff-name-input"
                  name="name"
                  type="text"
                  placeholder="e.g. Almaz Bekele"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                  disabled={registerLoading}
                  className="h-9 text-xs"
                  autoComplete="name"
                />
              </div>

              {/* Field 2: Email */}
              <div className="space-y-1.5">
                <Label htmlFor="staff-email-input" className="text-xs font-medium">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="staff-email-input"
                  name="email"
                  type="email"
                  placeholder="e.g. almaz.waiter@rekikcafe.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                  disabled={registerLoading}
                  className="h-9 text-xs"
                  autoComplete="email"
                />
              </div>

              {/* Field 3: Password */}
              <div className="space-y-1.5">
                <Label htmlFor="staff-password-input" className="text-xs font-medium">
                  Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="staff-password-input"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter at least 6 characters"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                    disabled={registerLoading}
                    className="h-9 text-xs pr-9 font-mono"
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>

                {/* Password Strength Meter */}
                {registerPassword.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Password Strength:</span>
                      <span
                        className={cn("font-medium", {
                          "text-amber-500": passwordStrength.score === 1,
                          "text-blue-500": passwordStrength.score === 2,
                          "text-emerald-500": passwordStrength.score === 3,
                        })}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 h-1.5">
                      <div
                        className={cn(
                          "rounded-full h-full transition-colors",
                          passwordStrength.score >= 1 ? passwordStrength.color : "bg-muted",
                        )}
                      />
                      <div
                        className={cn(
                          "rounded-full h-full transition-colors",
                          passwordStrength.score >= 2 ? passwordStrength.color : "bg-muted",
                        )}
                      />
                      <div
                        className={cn(
                          "rounded-full h-full transition-colors",
                          passwordStrength.score >= 3 ? passwordStrength.color : "bg-muted",
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Error Alert */}
              {registerError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span className="leading-tight">{registerError}</span>
                </div>
              )}

              {/* Success Alert */}
              {registerSuccess && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2">
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  <span className="leading-tight">{registerSuccess}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRegisterDialogOpen(false)}
                  disabled={registerLoading}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={registerLoading}
                  className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {registerLoading ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" />
                      <span>Creating Account…</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="size-3.5" />
                      <span>Register {registerRole === "waiter" ? "Waiter" : "Cashier"}</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 5. STAFF STATUS CONFIRMATION ALERT DIALOG ────────────────────── */}
      <AlertDialog
        open={!!statusConfirmStaff}
        onOpenChange={(open) => {
          if (!open && !statusLoading) setStatusConfirmStaff(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {statusActionType === "deactivate" ? (
                <>
                  <ShieldAlert className="size-5 text-amber-500" />
                  <span>Confirm Staff Deactivation</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="size-5 text-emerald-500" />
                  <span>Confirm Staff Activation</span>
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-1 text-xs">
              <p>
                Are you sure you want to{" "}
                <strong className="text-foreground font-semibold">{statusActionType}</strong>{" "}
                <span className="font-medium text-foreground">{statusConfirmStaff?.fullName}</span>{" "}
                (role: <span className="capitalize">{statusConfirmStaff?.role}</span>)?
              </p>
              {statusActionType === "deactivate" ? (
                <p className="text-muted-foreground">
                  Deactivated staff cannot sign in or perform any waiter/cashier operations in Rekik
                  Coffee.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Activating this staff member restores their ability to access waiter/cashier
                  stations.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmStatusChange();
              }}
              disabled={statusLoading}
              className={cn(
                statusActionType === "deactivate"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-emerald-600 text-white hover:bg-emerald-700",
              )}
            >
              {statusLoading ? (
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="size-3.5 animate-spin" />
                  <span>Updating…</span>
                </span>
              ) : (
                `Yes, ${statusActionType === "deactivate" ? "Deactivate" : "Activate"}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 6. RECEIVING ACCOUNTS MANAGEMENT DIALOG ────────────────────────── */}
      <Dialog open={isReceivingAccountsOpen} onOpenChange={setIsReceivingAccountsOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300">
                <CreditCard className="size-4" />
              </div>
              <DialogTitle className="font-display text-lg font-bold">
                Receiving Accounts Management
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Official mobile banking accounts configured for customer checkout and payment settlements in Supabase <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">payment_account_settings</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Header info banner */}
            <div className="rounded-lg border border-amber-900/15 dark:border-amber-700/25 bg-amber-500/5 p-3 flex items-start gap-2.5">
              <ShieldCheck className="size-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-medium text-foreground">Authoritative Receiving Accounts</p>
                <p className="text-muted-foreground">
                  Active accounts configured below are automatically displayed to customers during checkout and order tracking.
                </p>
              </div>
            </div>

            {/* Provider Cards */}
            <div className="grid gap-3.5">
              {(["telebirr", "cbe"] as const).map((method) => {
                const account = receivingAccountsList.find(
                  (a) => a.payment_method.toLowerCase() === method,
                );
                const isTelebirr = method === "telebirr";

                return (
                  <div
                    key={method}
                    className={cn(
                      "rounded-xl border p-4 space-y-3 transition-all",
                      account
                        ? account.is_active
                          ? "border-amber-900/20 dark:border-amber-700/30 bg-card shadow-2xs"
                          : "border-border/80 bg-muted/30 opacity-85"
                        : "border-dashed border-border bg-muted/10",
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex size-9 items-center justify-center rounded-lg font-bold text-xs",
                            isTelebirr
                              ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                              : "bg-purple-500/15 text-purple-700 dark:text-purple-300",
                          )}
                        >
                          {isTelebirr ? "TB" : "CBE"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-xs sm:text-sm text-foreground">
                              {isTelebirr ? "Telebirr Mobile Payment" : "CBE Birr / CBE Mobile Banking"}
                            </h3>
                            {account ? (
                              <Badge
                                variant={account.is_active ? "outline" : "secondary"}
                                className={cn(
                                  "text-[10px] px-1.5 py-0",
                                  account.is_active
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {account.is_active ? "Active Receiving Account" : "Inactive / Paused"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Not Configured
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {isTelebirr
                              ? "SuperApp Till / Merchant Phone Transfer"
                              : "Commercial Bank of Ethiopia Account"}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        {account ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleAccountActive(account)}
                              className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                            >
                              {account.is_active ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenEditAccount(account)}
                              className="h-7 text-[11px] px-2.5 bg-amber-500/15 text-amber-950 dark:text-amber-200 hover:bg-amber-500/25 border border-amber-900/20 dark:border-amber-700/30 font-medium"
                            >
                              Edit Details
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleOpenCreateAccount(method)}
                            className="h-7 text-[11px] px-2.5 bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            Configure Account
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Account fields display */}
                    {account ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/50 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {isTelebirr ? "Merchant Till / Phone Number:" : "Account Number:"}
                          </span>
                          <p className="font-mono font-semibold text-foreground text-sm tracking-wide">
                            {account.account_number}
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[11px] text-muted-foreground">Account Holder Name:</span>
                          <p className="font-medium text-foreground">{account.account_owner_name}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic border-t border-border/40 pt-2">
                        No receiving account record created in database yet. Click Configure Account to set up official payment destination.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer controls */}
            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadReceivingAccounts}
                disabled={receivingAccountsLoading}
                className="h-8 text-xs text-muted-foreground gap-1.5"
              >
                <RefreshCw className={cn("size-3.5", receivingAccountsLoading && "animate-spin")} />
                <span>Refresh Accounts</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsReceivingAccountsOpen(false)}
                className="h-8 text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 7. RECEIVING ACCOUNT EDIT / CREATE MODAL ───────────────────────── */}
      <Dialog open={isAccountFormOpen} onOpenChange={setIsAccountFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1">
            <DialogTitle className="font-display text-base font-bold flex items-center gap-2">
              <CreditCard className="size-4 text-amber-600 dark:text-amber-400" />
              <span>
                {editingAccount ? "Edit Receiving Account" : "Configure Receiving Account"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure authorized account details stored in <code className="font-mono text-[11px]">payment_account_settings</code>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAccount} className="space-y-3.5 pt-2">
            {/* Field: Provider */}
            <div className="space-y-1.5">
              <Label htmlFor="receiving-provider-select" className="text-xs font-medium">
                Payment Provider <span className="text-destructive">*</span>
              </Label>
              <Select
                value={accountFormMethod}
                onValueChange={(v) => setAccountFormMethod(v as "telebirr" | "cbe")}
                disabled={!!editingAccount || accountSaving}
              >
                <SelectTrigger id="receiving-provider-select" className="h-9 text-xs">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="telebirr">Telebirr Mobile Payment</SelectItem>
                  <SelectItem value="cbe">CBE Birr / Commercial Bank of Ethiopia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Field: Account / Till Number */}
            <div className="space-y-1.5">
              <Label htmlFor="receiving-account-number" className="text-xs font-medium">
                {accountFormMethod === "telebirr" ? "Till / Phone Number" : "Bank Account Number"}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="receiving-account-number"
                type="text"
                placeholder={
                  accountFormMethod === "telebirr"
                    ? "e.g. 0911 234 567"
                    : "e.g. 1000 2345 67890"
                }
                value={accountFormNumber}
                onChange={(e) => setAccountFormNumber(e.target.value)}
                required
                disabled={accountSaving}
                className="h-9 text-xs font-mono"
              />
            </div>

            {/* Field: Account Owner Name */}
            <div className="space-y-1.5">
              <Label htmlFor="receiving-account-owner" className="text-xs font-medium">
                Account Holder Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="receiving-account-owner"
                type="text"
                placeholder="e.g. Rekik Coffee"
                value={accountFormOwner}
                onChange={(e) => setAccountFormOwner(e.target.value)}
                required
                disabled={accountSaving}
                className="h-9 text-xs"
              />
            </div>

            {/* Field: Active Status Switch */}
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="receiving-account-active" className="text-xs font-medium cursor-pointer">
                  Active Status
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  When enabled, this account is displayed to customers for mobile payment settlements.
                </p>
              </div>
              <input
                id="receiving-account-active"
                type="checkbox"
                checked={accountFormActive}
                onChange={(e) => setAccountFormActive(e.target.checked)}
                disabled={accountSaving}
                className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            {accountFormError && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{accountFormError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAccountFormOpen(false)}
                disabled={accountSaving}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={accountSaving}
                className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {accountSaving ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    <span>Saving Account…</span>
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" />
                    <span>Save Account Details</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
