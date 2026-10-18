import { useState, useMemo } from "react";
import {
  Search,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Inbox,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Layers,
  Copy,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PendingPaymentReviewItem } from "@/lib/cashier";

interface PendingReviewsListProps {
  items: PendingPaymentReviewItem[];
  loading: boolean;
  onViewProof: (item: PendingPaymentReviewItem) => void;
  onApprove: (item: PendingPaymentReviewItem) => void;
  onReject: (item: PendingPaymentReviewItem) => void;
  onRefresh: () => void;
}

export function PendingReviewsList({
  items,
  loading,
  onViewProof,
  onApprove,
  onReject,
  onRefresh,
}: PendingReviewsListProps) {
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const toggleExpand = (id: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyOrderNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedId(num);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const uniqueMethods = useMemo(() => {
    const set = new Set(items.map((i) => i.payment_method).filter(Boolean));
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const list = items.filter((it) => {
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

    // Sort order: Oldest pending first prioritizes waiting customers
    list.sort((a, b) => {
      const timeA = new Date(a.proof_submitted_at || a.order_created_at).getTime();
      const timeB = new Date(b.proof_submitted_at || b.order_created_at).getTime();
      return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
    });

    return list;
  }, [items, search, methodFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  return (
    <div className="space-y-5">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold font-display text-[#2A1810]">
              Payment Reviews
            </h1>
            <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-bold px-2.5 py-0.5">
              {filteredItems.length} {filteredItems.length === 1 ? "Review" : "Reviews"}
            </Badge>
          </div>
          <p className="text-sm text-[#70645C] mt-0.5">
            Examine customer payment screenshots, match amounts with orders, and verify transaction proofs.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="border-[#D6C7B7] text-[#5C4538] hover:bg-[#FAF4ED] rounded-xl self-start sm:self-auto h-9"
        >
          <RotateCcw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Queue
        </Button>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#EAE3D9] shadow-sm flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8C7A6E]" />
          <Input
            placeholder="Search order #, customer, phone, reference..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 h-10 bg-[#FAF7F2] border-[#E2D8CC] focus-visible:ring-[#2A1810] rounded-xl text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Method Filter */}
          <Select
            value={methodFilter}
            onValueChange={(val) => {
              setMethodFilter(val);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[160px] h-10 bg-[#FAF7F2] border-[#E2D8CC] rounded-xl text-xs font-medium">
              <CreditCard className="mr-2 h-3.5 w-3.5 text-[#8C7A6E]" />
              <SelectValue placeholder="All Methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payment Methods</SelectItem>
              {uniqueMethods.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort Order */}
          <Select
            value={sortOrder}
            onValueChange={(val: "oldest" | "newest") => {
              setSortOrder(val);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[170px] h-10 bg-[#FAF7F2] border-[#E2D8CC] rounded-xl text-xs font-medium">
              <Clock className="mr-2 h-3.5 w-3.5 text-[#8C7A6E]" />
              <SelectValue placeholder="Sort Order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oldest">Oldest First (Prioritize)</SelectItem>
              <SelectItem value="newest">Newest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pending Items List */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFCFC1] bg-white p-12 text-center space-y-3">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
            <Inbox className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-base text-[#2A1810] font-display">
              No Pending Reviews Found
            </h3>
            <p className="text-sm text-[#70645C] max-w-md mx-auto">
              {search || methodFilter !== "all"
                ? "No pending payment proofs match your active filters. Try adjusting or clearing search terms."
                : "All incoming customer payments have been processed. Great job!"}
            </p>
          </div>
          {(search || methodFilter !== "all") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setMethodFilter("all");
              }}
              className="mt-2 text-xs border-[#D6C7B7] rounded-xl"
            >
              Clear Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedItems.map((item, idx) => {
            const isExpanded = expandedOrderIds.has(item.order_id);
            const amountDiff = item.payment_amount - item.order_total;
            const hasMismatch = Math.abs(amountDiff) > 0.01;
            const isUnderpaid = amountDiff < -0.01;
            const isOverpaid = amountDiff > 0.01;

            // Wait time in minutes
            const waitMinutes = Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(item.proof_submitted_at).getTime()) / 60000,
              ),
            );

            return (
              <div
                key={item.proof_id}
                className={`rounded-2xl border bg-white shadow-sm transition-all overflow-hidden ${
                  hasMismatch
                    ? "border-amber-300 hover:border-amber-400"
                    : "border-[#EAE3D9] hover:border-[#D6C7B7]"
                }`}
              >
                {/* Main Row Information */}
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left block: Order identification & customer */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-[#2A1810] font-mono text-base tracking-tight">
                          {item.order_number}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyOrderNumber(item.order_number)}
                          className="text-[#8C7A6E] hover:text-[#2A1810] transition-colors p-1"
                          title="Copy Order Number"
                        >
                          {copiedId === item.order_number ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      <Badge
                        variant="secondary"
                        className="text-[11px] font-semibold bg-[#FAF2EB] text-[#5C3B28] border border-[#E6D5C7]"
                      >
                        {item.order_method === "dine_in"
                          ? `Dine-in ${item.table_number ? `• Table ${item.table_number}` : ""}`
                          : "Delivery"}
                      </Badge>

                      <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[11px] font-bold">
                        Pending Cashier Review
                      </Badge>

                      {hasMismatch && (
                        <Badge className="bg-red-100 text-red-800 border-red-300 text-[11px] font-bold flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {isUnderpaid
                            ? `Short by ${Math.abs(amountDiff).toLocaleString()} ETB`
                            : `Overpaid by +${amountDiff.toLocaleString()} ETB`}
                        </Badge>
                      )}
                    </div>

                    {/* Customer & Payment Method Sub-info */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#70645C]">
                      <span className="font-semibold text-[#2A1810] flex items-center gap-1">
                        {item.customer_name}
                      </span>
                      {item.customer_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-[#8C7A6E]" />
                          {item.customer_phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <CreditCard className="h-3 w-3 text-[#8C7A6E]" />
                        Method: <strong className="text-[#2A1810]">{item.payment_method}</strong>
                      </span>
                      {item.transaction_reference && (
                        <span className="font-mono text-[#5C4538] bg-[#F5EFE8] px-1.5 py-0.5 rounded border border-[#E6DDD3]">
                          Ref: {item.transaction_reference}
                        </span>
                      )}
                    </div>

                    {/* Submission timing */}
                    <div className="text-[11px] text-[#8C7A6E] flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Submitted: {new Date(item.proof_submitted_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>•</span>
                      <span
                        className={`font-semibold ${
                          waitMinutes >= 15 ? "text-amber-700" : "text-[#70645C]"
                        }`}
                      >
                        Waiting: {waitMinutes} min{waitMinutes === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  {/* Right block: Amount and Action Button */}
                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-[#F0EBE3]">
                    <div className="text-left md:text-right">
                      <div className="text-xs text-[#8C7A6E] font-medium">Payment Amount</div>
                      <div className="text-xl font-extrabold font-mono text-[#2A1810]">
                        {item.payment_amount.toLocaleString()} ETB
                      </div>
                      <div className="text-[11px] text-[#70645C]">
                        Order Total: {item.order_total.toLocaleString()} ETB
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => onViewProof(item)}
                        className="bg-[#2A1810] hover:bg-[#3D251A] text-white font-medium text-xs rounded-xl shadow-sm h-10 px-4 flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        Verify Proof
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleExpand(item.order_id)}
                        className="h-10 w-10 text-[#70645C] hover:text-[#2A1810] rounded-xl"
                        title={isExpanded ? "Collapse Items" : "Expand Items"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Order Items Details */}
                {isExpanded && (
                  <div className="bg-[#FAF7F2] border-t border-[#EAE3D9] p-4 text-xs space-y-2">
                    <div className="font-bold text-[#2A1810] flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[#C8102E]" />
                      Ordered Items ({item.items.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {item.items.map((it, i) => (
                        <div
                          key={i}
                          className="bg-white p-2.5 rounded-xl border border-[#EAE3D9] flex items-center justify-between"
                        >
                          <span className="font-medium text-[#2A1810] truncate max-w-[150px]">
                            {it.quantity}x {it.name}
                          </span>
                          <span className="font-mono font-bold text-[#5C3B28]">
                            {it.line_total.toLocaleString()} ETB
                          </span>
                        </div>
                      ))}
                    </div>
                    {item.customer_notes && (
                      <div className="text-[11px] text-[#70645C] bg-[#FFF9F2] border border-[#F0E2D0] p-2 rounded-xl mt-2">
                        <strong className="text-[#2A1810]">Customer Note:</strong>{" "}
                        {item.customer_notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-[#70645C]">
          <div>
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 rounded-xl border-[#D6C7B7]"
            >
              Previous
            </Button>
            <span className="px-2 font-semibold text-[#2A1810]">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 rounded-xl border-[#D6C7B7]"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
