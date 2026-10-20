import { useState, useMemo } from "react";
import { Search, Filter, User, ChevronRight, RotateCcw, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PendingPaymentReviewItem } from "@/lib/cashier";

interface PendingReviewsListProps {
  items: PendingPaymentReviewItem[];
  loading: boolean;
  onViewProof: (item: PendingPaymentReviewItem) => void;
  onApprove: (item: PendingPaymentReviewItem) => void;
  onReject: (item: PendingPaymentReviewItem) => void;
  onRefresh: () => void;
}

function formatReviewDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dateFormatted = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeFormatted = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateFormatted} • ${timeFormatted}`;
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number): string {
  return `ETB ${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PendingReviewsList({
  items,
  loading,
  onViewProof,
  onRefresh,
}: PendingReviewsListProps) {
  const [search, setSearch] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [methodFilter, setMethodFilter] = useState("all");

  const uniqueMethods = useMemo(() => {
    const set = new Set(items.map((i) => i.payment_method).filter(Boolean));
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const query = search.toLowerCase().trim();
      const matchesSearch =
        !query ||
        it.order_number.toLowerCase().includes(query) ||
        it.customer_name.toLowerCase().includes(query) ||
        (it.customer_phone && it.customer_phone.includes(query)) ||
        (it.transaction_reference && it.transaction_reference.toLowerCase().includes(query));

      const matchesMethod =
        methodFilter === "all" ||
        it.payment_method.toLowerCase().includes(methodFilter.toLowerCase());

      return matchesSearch && matchesMethod;
    });
  }, [items, search, methodFilter]);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Main Heading */}
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1A110D]">Rekik Café</h1>
        <p className="text-xs text-[#8A7B70] mt-0.5">Good Food &bull; Great Moments</p>
      </div>

      {/* Section Subheading */}
      <div>
        <h2 className="text-lg font-bold text-[#2A1810]">Pending Payment Reviews</h2>
        <p className="text-xs text-[#70645C] mt-0.5">
          Review customer payment proofs and verify payments.
        </p>
      </div>

      {/* Search Input & Filter Button */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8C7A6E]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order number or customer..."
            className="pl-10 pr-4 h-11 bg-[#EBE4D8] border-[#DFD6C8] rounded-xl text-sm text-[#2A1810] placeholder:text-[#8C7A6E] focus-visible:ring-1 focus-visible:ring-[#8C7A6E]"
          />
        </div>

        <div className="relative">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="h-11 w-11 p-0 rounded-xl bg-[#EBE4D8] border-[#DFD6C8] text-[#5C4538] hover:bg-[#E3DC CE]"
            title="Filter by payment method"
          >
            <Filter className="h-4 w-4" />
          </Button>

          {showFilterMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-[#EAE3D9] p-2 z-30 space-y-1 text-xs">
              <div className="font-semibold px-2 py-1 text-[#8C7A6E]">Filter by Method</div>
              <button
                type="button"
                onClick={() => {
                  setMethodFilter("all");
                  setShowFilterMenu(false);
                }}
                className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
                  methodFilter === "all"
                    ? "bg-[#FAF2EB] text-[#2A1810] font-bold"
                    : "text-[#70645C] hover:bg-neutral-50"
                }`}
              >
                All Methods
              </button>
              {uniqueMethods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMethodFilter(m);
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors capitalize ${
                    methodFilter === m
                      ? "bg-[#FAF2EB] text-[#2A1810] font-bold"
                      : "text-[#70645C] hover:bg-neutral-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Showing count text */}
      <div className="flex items-center justify-between text-xs text-[#8A7B70]">
        <span>
          Showing {filteredItems.length} pending {filteredItems.length === 1 ? "review" : "reviews"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs text-[#70645C] hover:text-[#2A1810] flex items-center gap-1 transition-colors"
        >
          <RotateCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Pending Items List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="h-20 bg-[#ECE5DB] animate-pulse rounded-2xl border border-[#DFD6C8]"
            />
          ))
        ) : filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const orderNum = item.order_number.startsWith("#")
              ? item.order_number
              : `#${item.order_number}`;
            const dateDisplay = formatReviewDate(item.proof_submitted_at || item.order_created_at);

            return (
              <div
                key={item.proof_id || item.order_id}
                onClick={() => onViewProof(item)}
                className="group cursor-pointer bg-[#EDE7DD] hover:bg-[#E6DFD4] border border-[#DFD6C8] rounded-2xl p-3.5 sm:p-4 transition-all shadow-xs flex items-center justify-between gap-4"
              >
                {/* Left side: Thumbnail + Order Info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-[#D5C9B8] bg-[#D8CFC2]">
                    <img
                      src="/images/coffee-thumb.jpg"
                      alt={item.order_number}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        // Fallback to about.jpg if coffee-thumb fails
                        (e.target as HTMLImageElement).src = "/images/about.jpg";
                      }}
                    />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="font-bold text-sm text-[#2A1810] truncate">{orderNum}</div>
                    <div className="flex items-center gap-1.5 text-xs text-[#5C4538] truncate">
                      <User className="h-3 w-3 shrink-0 text-[#8C7A6E]" />
                      <span className="truncate">{item.customer_name}</span>
                    </div>
                    <div className="text-[11px] text-[#8A7B70]">{dateDisplay}</div>
                  </div>
                </div>

                {/* Right side: Amount + Badge + Chevron */}
                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                  <div className="text-right space-y-1">
                    <div className="font-bold text-sm sm:text-base text-[#2A1810]">
                      {formatCurrency(item.payment_amount || item.order_total)}
                    </div>
                    <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                      Under Review
                    </span>
                  </div>

                  <ChevronRight className="h-5 w-5 text-[#8C7A6E] group-hover:text-[#2A1810] transition-colors" />
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center bg-[#EDE7DD] rounded-2xl border border-[#DFD6C8] space-y-2">
            <Inbox className="h-8 w-8 text-[#8C7A6E] mx-auto" />
            <div className="text-sm font-semibold text-[#2A1810]">No pending payment reviews</div>
            <p className="text-xs text-[#8A7B70]">
              All submitted payment proofs have been reviewed and verified.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
