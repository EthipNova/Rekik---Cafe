import {
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  CreditCard,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Eye,
  Calendar,
  DollarSign,
  Coffee,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  CashierOverviewMetrics,
  PendingPaymentReviewItem,
  PaymentReviewHistoryItem,
} from "@/lib/cashier";

interface CashierOverviewProps {
  metrics: CashierOverviewMetrics | null;
  pendingItems: PendingPaymentReviewItem[];
  recentHistory: PaymentReviewHistoryItem[];
  onSelectTab: (tab: string) => void;
  onViewProof: (item: PendingPaymentReviewItem) => void;
}

export function CashierOverview({
  metrics,
  pendingItems,
  recentHistory,
  onSelectTab,
  onViewProof,
}: CashierOverviewProps) {
  // Live values from Supabase queries
  const pendingCount = metrics?.pendingCount ?? pendingItems.length;
  const pendingAmount =
    metrics?.pendingAmount ??
    pendingItems.reduce((acc, it) => acc + (it.payment_amount || it.proof_submitted_amount || 0), 0);
  const todayVerifiedCount = metrics?.todayVerifiedCount ?? 0;
  const todayVerifiedAmount = metrics?.todayVerifiedAmount ?? 0;
  const totalVerifiedCount = metrics?.totalVerifiedCount ?? 0;
  const totalVerifiedAmount = metrics?.totalVerifiedAmount ?? 0;
  const rejectedCount = metrics?.rejectedCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header with Rekik Café Branding & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <div>
          <h1 className="text-2xl font-bold font-display text-[#2A1810] tracking-tight">
            Rekik Café Dashboard
          </h1>
          <p className="text-sm text-[#70645C] mt-0.5">
            Monitor real-time incoming payment proofs, verify transactions, and manage café reconciliation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[#EFE5DB] text-[#4A3022] hover:bg-[#EFE5DB] border border-[#DFCFC1] px-3 py-1 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
            Live Supabase Sync
          </Badge>
        </div>
      </div>

      {/* Alert Banner for Pending Reviews */}
      {pendingCount > 0 ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-50 to-amber-100/60 border border-amber-200/80 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
                <Clock className="h-6 w-6" />
              </div>
              <div className="space-y-0.5">
                <h2 className="font-bold text-[#2A1810] font-display text-base sm:text-lg">
                  {pendingCount} Payment {pendingCount === 1 ? "Proof" : "Proofs"} Awaiting Verification
                </h2>
                <p className="text-sm text-[#70645C]">
                  Total value awaiting approval:{" "}
                  <strong className="text-[#2A1810] font-mono">
                    {pendingAmount.toLocaleString()} ETB
                  </strong>
                  . Review now to confirm kitchen preparation.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => onSelectTab("pending")}
              className="bg-[#C8102E] hover:bg-[#a60d26] text-white font-medium shadow-sm shrink-0 rounded-xl"
            >
              Start Reviewing <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-0.5">
              <h2 className="font-bold text-[#1E3A24] font-display text-base">
                All Customer Payments Verified
              </h2>
              <p className="text-sm text-[#4E6B54]">
                There are currently no orders pending payment proof verification. Incoming submissions will appear here live.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4 Live Summary Cards (Matching Master Prompt Exact Spec) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Pending Payment Reviews */}
        <Card className="rounded-2xl border-[#EAE3D9] bg-white shadow-sm hover:border-amber-400/60 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#8A796E]">
              Pending Payment Reviews
            </CardTitle>
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold font-mono text-[#2A1810]">
              {pendingCount}
            </div>
            <p className="text-xs text-[#70645C] mt-1 font-medium">
              Worth{" "}
              <span className="font-bold text-[#2A1810]">
                {pendingAmount.toLocaleString()} ETB
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Approved Payments */}
        <Card className="rounded-2xl border-[#EAE3D9] bg-white shadow-sm hover:border-emerald-400/60 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#8A796E]">
              Approved Payments
            </CardTitle>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold font-mono text-emerald-700">
              {totalVerifiedCount}
            </div>
            <p className="text-xs text-emerald-700/90 font-medium mt-1">
              <span className="font-bold">{totalVerifiedAmount.toLocaleString()} ETB</span> confirmed
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Rejected Payments */}
        <Card className="rounded-2xl border-[#EAE3D9] bg-white shadow-sm hover:border-red-400/60 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#8A796E]">
              Rejected Payments
            </CardTitle>
            <div className="h-9 w-9 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center">
              <XCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold font-mono text-red-700">
              {rejectedCount}
            </div>
            <p className="text-xs text-[#70645C] mt-1 font-medium">
              Declined with required reason
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Total Verified Payments Today */}
        <Card className="rounded-2xl border-[#EAE3D9] bg-white shadow-sm hover:border-[#C8102E]/40 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#8A796E]">
              Total Verified Payments Today
            </CardTitle>
            <div className="h-9 w-9 rounded-xl bg-[#FAF0E6] text-[#C8102E] border border-[#EACEC0] flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold font-mono text-[#2A1810]">
              {todayVerifiedCount}
            </div>
            <p className="text-xs text-[#70645C] mt-1 font-medium">
              Collected:{" "}
              <span className="font-bold text-[#2A1810]">
                {todayVerifiedAmount.toLocaleString()} ETB
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Grid: Pending Review Queue & Recent History Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        {/* Left Column: Immediate Review Queue (7 cols) */}
        <div className="lg:col-span-7 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <h3 className="text-base font-bold font-display text-[#2A1810]">
                Immediate Review Queue
              </h3>
              {pendingItems.length > 0 && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-xs">
                  {pendingItems.length} awaiting
                </Badge>
              )}
            </div>
            {pendingItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectTab("pending")}
                className="text-xs font-semibold text-[#C8102E] hover:text-[#9c0c23] hover:bg-red-50"
              >
                View all ({pendingItems.length}) <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {pendingItems.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-[#DFCFC1] bg-white/70 text-center text-sm text-[#70645C]">
              <Coffee className="h-8 w-8 mx-auto text-[#B3A295] mb-2" />
              <p className="font-medium text-[#2A1810]">Review queue is clear</p>
              <p className="text-xs text-[#8A796E] mt-0.5">
                New customer payment proofs will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingItems.slice(0, 4).map((item) => {
                const amountDiff = item.payment_amount - item.order_total;
                const hasDiscrepancy = Math.abs(amountDiff) > 0.01;

                return (
                  <div
                    key={item.proof_id}
                    className="p-4 rounded-2xl border border-[#EAE3D9] bg-white shadow-sm hover:border-[#D6C7B7] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#2A1810] text-sm font-mono">
                          {item.order_number}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-[#FAF2EB] text-[#5C3B28] border border-[#E6D5C7]"
                        >
                          {item.order_method === "dine_in"
                            ? `Dine-in ${item.table_number ? `(${item.table_number})` : ""}`
                            : "Delivery"}
                        </Badge>
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-semibold">
                          Awaiting Review
                        </Badge>
                        {hasDiscrepancy && (
                          <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px] font-semibold">
                            Amount Mismatch
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-[#70645C]">
                        <span className="font-medium text-[#2A1810]">{item.customer_name}</span>
                        {item.customer_phone && ` • ${item.customer_phone}`}
                        {item.payment_method && ` • ${item.payment_method}`}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F0EBE3]">
                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-[#2A1810]">
                          {item.payment_amount.toLocaleString()} ETB
                        </div>
                        <div className="text-[10px] text-[#8A796E]">
                          {new Date(item.proof_submitted_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onViewProof(item)}
                        className="bg-[#2A1810] hover:bg-[#3D251A] text-white text-xs rounded-xl shadow-sm h-8 px-3"
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        Verify
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Recent Review History (5 cols) */}
        <div className="lg:col-span-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold font-display text-[#2A1810]">
              Recent Verification Activity
            </h3>
            {recentHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectTab("history")}
                className="text-xs font-semibold text-[#70645C] hover:text-[#2A1810]"
              >
                View History <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {recentHistory.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-[#DFCFC1] bg-white/70 text-center text-sm text-[#70645C]">
              No reviews completed yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentHistory.slice(0, 4).map((item) => (
                <div
                  key={item.review_id}
                  className="p-3.5 rounded-2xl border border-[#EAE3D9] bg-white shadow-sm flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#2A1810] font-mono">
                        {item.order_number}
                      </span>
                      {item.decision === "approved" ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-1.5 py-0">
                          Approved
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px] px-1.5 py-0">
                          Rejected
                        </Badge>
                      )}
                    </div>
                    <div className="text-[#70645C] truncate">
                      {item.customer_name} • {item.payment_method}
                    </div>
                    {item.reason && item.decision === "rejected" && (
                      <div className="text-[11px] text-red-700 truncate italic">
                        "{item.reason}"
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold font-mono text-[#2A1810]">
                      {item.payment_amount.toLocaleString()} ETB
                    </div>
                    <div className="text-[10px] text-[#8A796E]">
                      {new Date(item.reviewed_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
