import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Coffee, ShieldAlert, Menu, LogOut, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cashierSupabase, supabase } from "@/lib/supabase";
import { applyTheme, readSettings } from "@/lib/settings";
import type {
  CashierStaffProfile,
  PendingPaymentReviewItem,
  PaymentReviewHistoryItem,
  CashierOverviewMetrics,
  CashierNotification,
} from "@/lib/cashier";
import {
  fetchCashierMe,
  fetchPendingReviews,
  fetchReviewHistory,
  fetchCashierMetrics,
  fetchCashierNotifications,
  markCashierNotificationRead,
  submitPaymentApproval,
  submitPaymentRejection,
} from "@/services/cashier";

import { CashierHeader } from "@/components/cashier/CashierHeader";
import { CashierSidebar } from "@/components/cashier/CashierSidebar";
import { CashierLoginForm } from "@/components/cashier/CashierLoginForm";
import { CashierOverview } from "@/components/cashier/CashierOverview";
import { PendingReviewsList } from "@/components/cashier/PendingReviewsList";
import { ReviewHistoryView } from "@/components/cashier/ReviewHistoryView";
import { CashierNotificationsView } from "@/components/cashier/CashierNotificationsView";
import {
  PaymentProofModal,
  type VerificationModalItem,
} from "@/components/cashier/PaymentProofModal";
import { ApproveDialog } from "@/components/cashier/ApproveDialog";
import { RejectDialog } from "@/components/cashier/RejectDialog";

export const Route = createFileRoute("/cashier")({
  beforeLoad: () => {
    throw redirect({ to: "/casher" });
  },
  head: () => ({
    meta: [
      { title: "Cashier Dashboard — Rekik Café" },
      {
        name: "description",
        content:
          "Secure payment proof review, verification, and order confirmation portal for Rekik Café cashiers.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashierRoutePage,
});

export function CashierRoutePage() {
  const navigate = useNavigate();

  // Auth and Profile State
  const [authChecking, setAuthChecking] = useState(true);
  const [profile, setProfile] = useState<CashierStaffProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [unauthorizedStaff, setUnauthorizedStaff] = useState<{ fullName: string; role: string } | null>(null);

  // Dashboard Data State
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [pendingItems, setPendingItems] = useState<PendingPaymentReviewItem[]>([]);
  const [historyItems, setHistoryItems] = useState<PaymentReviewHistoryItem[]>([]);
  const [metrics, setMetrics] = useState<CashierOverviewMetrics | null>(null);
  const [notifications, setNotifications] = useState<CashierNotification[]>([]);

  // Dialog & Modal Triggers
  const [viewingProofItem, setViewingProofItem] = useState<VerificationModalItem | null>(null);
  const [approvingItem, setApprovingItem] = useState<PendingPaymentReviewItem | null>(null);
  const [rejectingItem, setRejectingItem] = useState<PendingPaymentReviewItem | null>(null);

  // ── 1. Authenticate Cashier & Session Listener ────────────────────────────
  const verifySession = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await cashierSupabase.auth.getSession();

      if (!session?.user) {
        setProfile(null);
        setUnauthorizedStaff(null);
        setAuthChecking(false);
        return;
      }

      const meResult = await fetchCashierMe();
      if (meResult.success) {
        setProfile(meResult.profile);
        setUnauthorizedStaff(null);
        setAuthError(null);
      } else {
        setProfile(null);
        try {
          const { data: sp } = await (cashierSupabase.from("staff_profiles" as any) as any)
            .select("role, full_name")
            .eq("user_id", session.user.id)
            .maybeSingle();
          if (sp && sp.role && sp.role !== "cashier") {
            setUnauthorizedStaff({
              fullName: sp.full_name || "Staff Member",
              role: sp.role,
            });
          }
        } catch {
          /* ignore */
        }
        setAuthError(meResult.message);
      }
    } catch (err: unknown) {
      console.warn("[cashier] Session verification warning:", err);
      setProfile(null);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    applyTheme(readSettings().theme);

    let isMounted = true;
    verifySession();

    const {
      data: { subscription },
    } = cashierSupabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === "SIGNED_OUT" || !session) {
        setProfile(null);
        setUnauthorizedStaff(null);
        setAuthChecking(false);
      } else if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        verifySession();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [verifySession]);

  // Ensure /cashier always canonicalizes to /casher
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname === "/cashier") {
      void navigate({ to: "/casher", replace: true });
    }
  }, [navigate]);

  // ── 2. Load Dashboard Data ────────────────────────────────────────────────
  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadingData(true);
    setDataError(null);

    let pendingErrMsg: string | null = null;

    try {
      const [pending, history, met, notifs] = await Promise.all([
        fetchPendingReviews().catch((err: unknown) => {
          console.error("[cashier] Failed to fetch pending reviews:", err);
          pendingErrMsg = err instanceof Error ? err.message : String(err);
          return [];
        }),
        fetchReviewHistory().catch((err: unknown) => {
          console.error("[cashier] Failed to fetch review history:", err);
          return [];
        }),
        fetchCashierMetrics().catch((err: unknown) => {
          console.warn("[cashier] Failed to fetch cashier metrics:", err);
          return null;
        }),
        fetchCashierNotifications().catch((err: unknown) => {
          console.warn("[cashier] Failed to fetch notifications:", err);
          return [];
        }),
      ]);

      setPendingItems(pending);
      setHistoryItems(history);
      setMetrics(met);
      setNotifications(notifs);

      if (pendingErrMsg && pending.length === 0) {
        setDataError(pendingErrMsg || "Failed to load pending reviews.");
      }
    } catch (err) {
      console.error("[cashier] Error loading dashboard data:", err);
      setDataError("Failed to communicate with café server. Please try again.");
      toast.error("Failed to load some cashier data.");
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (profile) {
      loadDashboardData();
    }
  }, [profile, loadDashboardData]);

  // ── 3. Action Handlers: Approve & Reject ──────────────────────────────────
  const handleApprovePayment = async (proofId: string, notes?: string) => {
    try {
      const result = await submitPaymentApproval(proofId, notes);
      toast.success(result.message || "Payment verified successfully!");

      // Optimistically update list
      setPendingItems((prev) => prev.filter((p) => p.proof_id !== proofId));
      if (viewingProofItem?.proof_id === proofId) {
        setViewingProofItem(null);
      }

      // Refresh data
      loadDashboardData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve payment.";
      toast.error(msg);
      throw err;
    }
  };

  const handleRejectPayment = async (proofId: string, reason: string) => {
    try {
      const result = await submitPaymentRejection(proofId, reason);
      toast.success(result.message || "Payment proof rejected.");

      // Optimistically update list
      setPendingItems((prev) => prev.filter((p) => p.proof_id !== proofId));
      if (viewingProofItem?.proof_id === proofId) {
        setViewingProofItem(null);
      }

      // Refresh data
      loadDashboardData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject payment proof.";
      toast.error(msg);
      throw err;
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await markCashierNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    try {
      await cashierSupabase.auth.signOut();
      setProfile(null);
      setAuthError(null);
      toast.success("Signed out of Cashier shift.");
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  // ── 4. Rendering States ───────────────────────────────────────────────────

  // Loading Session Spinner
  if (authChecking) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center p-6 bg-[#FAF7F2]">
        <div className="flex flex-col items-center gap-3 text-[#70645C]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1B110B] text-[#E8A87C] animate-pulse shadow-md">
            <Coffee className="h-7 w-7" />
          </div>
          <span className="text-sm font-semibold text-[#2A1810]">
            Verifying Cashier Authorization...
          </span>
        </div>
      </div>
    );
  }

  // Authenticated but non-cashier role (e.g. Waiter or Admin)
  if (unauthorizedStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F2] px-4">
        <div className="w-full max-w-md p-8 text-center space-y-5 bg-white border border-[#EAE3D9] rounded-3xl shadow-xl">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-xs">
            <ShieldAlert className="size-7" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[#1A110D]">Access Restricted</h1>
            <p className="mt-2 text-sm text-[#70645C] leading-relaxed">
              You are currently signed in as{" "}
              <span className="font-semibold text-[#1A110D]">{unauthorizedStaff.fullName}</span> with role{" "}
              <span className="font-semibold capitalize text-[#1A110D]">{unauthorizedStaff.role}</span>.
              The Cashier Dashboard is restricted to Cashier staff.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            {unauthorizedStaff.role === "waiter" && (
              <Button asChild className="w-full bg-[#1B110B] hover:bg-[#2A1810] text-white">
                <Link to="/waiter">Go to Waiter Station</Link>
              </Button>
            )}
            {unauthorizedStaff.role === "admin" && (
              <Button asChild className="w-full bg-[#1B110B] hover:bg-[#2A1810] text-white">
                <Link to="/admin">Go to Admin Console</Link>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={async () => {
                await cashierSupabase.auth.signOut();
                setProfile(null);
                setUnauthorizedStaff(null);
                setAuthError(null);
                toast.success("Signed out successfully");
              }}
              className="w-full border-[#DFD6C8] hover:bg-[#FAF7F2]"
            >
              <LogOut className="size-4 mr-2" /> Sign Out & Switch Account
            </Button>
            <Button asChild variant="ghost" className="w-full text-xs text-[#70645C]">
              <Link to="/">Back to Café Menu</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated / Role Denied: Render Login Form
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#FAF7F2]">
        <CashierLoginForm
          onSuccess={(p) => {
            setProfile(p);
            loadDashboardData();
            void navigate({ to: "/casher" });
          }}
          onRedirectAdmin={() => navigate({ to: "/admin" })}
        />
      </div>
    );
  }

  // Authenticated Cashier Dashboard
  const unreadNotifsCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-[#F4EFE6] flex flex-col md:flex-row">
      {/* Mobile Top Header (only visible on mobile screens) */}
      <div className="md:hidden flex h-14 items-center justify-between border-b border-[#DFD6C8] bg-white px-4 sticky top-0 z-30">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-[#70645C] hover:text-[#2A1810]"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-display font-bold text-sm text-[#2A1810]">Rekik Café Cashier</span>
        <div className="w-8" />
      </div>

      {/* Navigation Sidebar */}
      <CashierSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingCount={pendingItems.length}
        unreadNotificationsCount={unreadNotifsCount}
        profile={profile}
        onLogout={handleLogout}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* Dynamic Main Workspace Content */}
      <main className="flex-1 p-5 sm:p-8 lg:p-10 max-w-6xl w-full">
        {activeTab === "overview" && (
          <CashierOverview
            metrics={metrics}
            pendingItems={pendingItems}
            recentHistory={historyItems}
            onSelectTab={setActiveTab}
            onViewProof={(it) => setViewingProofItem(it)}
          />
        )}

        {activeTab === "pending" && (
          <PendingReviewsList
            items={pendingItems}
            loading={loadingData}
            error={dataError}
            onViewProof={(it) => setViewingProofItem(it)}
            onApprove={(it) => setApprovingItem(it)}
            onReject={(it) => setRejectingItem(it)}
            onRefresh={() => loadDashboardData(true)}
          />
        )}

        {activeTab === "verified" && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-[#EAE3D9] shadow-sm">
              <h3 className="text-base font-bold font-display text-[#2A1810]">
                Verified & Approved Payments
              </h3>
              <p className="text-xs text-[#70645C] mt-0.5">
                Orders whose payment proofs were successfully validated and confirmed
              </p>
            </div>
            <ReviewHistoryView
              history={historyItems.filter((h) => h.decision === "approved")}
              loading={loadingData}
              onInspectItem={(item) => setViewingProofItem(item)}
              onRefresh={() => loadDashboardData(true)}
            />
          </div>
        )}

        {activeTab === "rejected" && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-[#EAE3D9] shadow-sm">
              <h3 className="text-base font-bold font-display text-[#2A1810]">
                Rejected Payment Proofs
              </h3>
              <p className="text-xs text-[#70645C] mt-0.5">
                Payment submissions declined due to amount mismatch, unreadable images, or invalid
                references
              </p>
            </div>
            <ReviewHistoryView
              history={historyItems.filter((h) => h.decision === "rejected")}
              loading={loadingData}
              onInspectItem={(item) => setViewingProofItem(item)}
              onRefresh={() => loadDashboardData(true)}
            />
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-[#EAE3D9] shadow-sm">
              <h3 className="text-base font-bold font-display text-[#2A1810]">
                Complete Payment Review History
              </h3>
              <p className="text-xs text-[#70645C] mt-0.5">
                Comprehensive audit trail of all cashier approval and rejection decisions
              </p>
            </div>
            <ReviewHistoryView
              history={historyItems}
              loading={loadingData}
              onInspectItem={(item) => setViewingProofItem(item)}
              onRefresh={() => loadDashboardData(true)}
            />
          </div>
        )}

        {activeTab === "notifications" && (
          <CashierNotificationsView
            notifications={notifications}
            loading={loadingData}
            onMarkAsRead={handleMarkNotificationRead}
            onRefresh={() => loadDashboardData(true)}
          />
        )}
      </main>

      {/* ── Modals & Dialogs ── */}
      {/* 1. Payment Proof Inspection Modal */}
      <PaymentProofModal
        open={Boolean(viewingProofItem)}
        item={viewingProofItem}
        onApprove={(it) => {
          setViewingProofItem(null);
          setApprovingItem(it);
        }}
        onReject={(it) => {
          setViewingProofItem(null);
          setRejectingItem(it);
        }}
        onClose={() => setViewingProofItem(null)}
      />

      {/* 2. Approve Confirmation Dialog */}
      <ApproveDialog
        open={Boolean(approvingItem)}
        item={approvingItem}
        onConfirm={handleApprovePayment}
        onClose={() => setApprovingItem(null)}
      />

      {/* 3. Reject Dialog */}
      <RejectDialog
        open={Boolean(rejectingItem)}
        item={rejectingItem}
        onConfirm={handleRejectPayment}
        onClose={() => setRejectingItem(null)}
      />
    </div>
  );
}
