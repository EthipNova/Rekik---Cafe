import { useState, useMemo } from "react";
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  History,
  Calendar,
  CreditCard,
  User,
  ExternalLink,
  ShieldAlert,
  ArrowUpDown,
  RefreshCw,
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
import type { PaymentReviewHistoryItem } from "@/lib/cashier";

interface ReviewHistoryViewProps {
  history: PaymentReviewHistoryItem[];
  loading: boolean;
  onInspectItem?: (item: PaymentReviewHistoryItem) => void;
  onViewProofUrl?: (proofId: string) => void;
  onRefresh: () => void;
}

export function ReviewHistoryView({
  history,
  loading,
  onInspectItem,
  onViewProofUrl,
  onRefresh,
}: ReviewHistoryViewProps) {
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const uniqueCashiers = useMemo(() => {
    const names = new Set(history.map((h) => h.cashier_name).filter(Boolean));
    return Array.from(names);
  }, [history]);

  const uniqueMethods = useMemo(() => {
    const methods = new Set(history.map((h) => h.payment_method).filter(Boolean));
    return Array.from(methods);
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.order_number.toLowerCase().includes(q) ||
        item.customer_name.toLowerCase().includes(q) ||
        (item.customer_phone && item.customer_phone.includes(q)) ||
        (item.reason && item.reason.toLowerCase().includes(q));

      const matchesDecision =
        decisionFilter === "all" || item.decision === decisionFilter;

      const matchesMethod =
        methodFilter === "all" ||
        item.payment_method.toLowerCase() === methodFilter.toLowerCase();

      const matchesCashier =
        cashierFilter === "all" || item.cashier_name === cashierFilter;

      return matchesSearch && matchesDecision && matchesMethod && matchesCashier;
    });
  }, [history, search, decisionFilter, methodFilter, cashierFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / itemsPerPage));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(start, start + itemsPerPage);
  }, [filteredHistory, currentPage, itemsPerPage]);

  const handleInspect = (item: PaymentReviewHistoryItem) => {
    if (onInspectItem) {
      onInspectItem(item);
    } else if (onViewProofUrl && item.proof_id) {
      onViewProofUrl(item.proof_id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-white p-4 rounded-2xl border border-[#EAE3D9] shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8C7A6E]" />
          <Input
            placeholder="Search order #, customer name, phone, notes..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 h-10 bg-[#FAF7F2] border-[#EAE3D9] text-[#2A1810] placeholder:text-[#8C7A6E] rounded-xl focus-visible:ring-[#C8102E]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Decision Filter */}
          <Select
            value={decisionFilter}
            onValueChange={(val) => {
              setDecisionFilter(val);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[130px] h-10 bg-[#FAF7F2] border-[#EAE3D9] text-[#2A1810] rounded-xl text-xs font-medium">
              <SelectValue placeholder="Decision" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Decisions</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          {/* Payment Method Filter */}
          {uniqueMethods.length > 1 && (
            <Select
              value={methodFilter}
              onValueChange={(val) => {
                setMethodFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[130px] h-10 bg-[#FAF7F2] border-[#EAE3D9] text-[#2A1810] rounded-xl text-xs font-medium">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {uniqueMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Cashier Filter */}
          {uniqueCashiers.length > 1 && (
            <Select
              value={cashierFilter}
              onValueChange={(val) => {
                setCashierFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[140px] h-10 bg-[#FAF7F2] border-[#EAE3D9] text-[#2A1810] rounded-xl text-xs font-medium">
                <SelectValue placeholder="Cashier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cashiers</SelectItem>
                {uniqueCashiers.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="h-10 px-3 text-xs border-[#EAE3D9] text-[#2A1810] hover:bg-[#FAF7F2] rounded-xl gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5 text-[#8C7A6E]" />
            Refresh
          </Button>
        </div>
      </div>

      {/* History Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-16 rounded-2xl border border-[#EAE3D9] bg-white p-4 animate-pulse"
            />
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-[#D6C7B7] bg-white">
          <History className="h-10 w-10 text-[#8C7A6E] mb-3 opacity-60" />
          <h3 className="text-lg font-bold font-display text-[#2A1810]">
            No Review Records Found
          </h3>
          <p className="text-sm text-[#70645C] max-w-sm mt-1">
            {history.length === 0
              ? "Completed payment reviews will appear here once cashiers approve or reject proofs."
              : "No records matched your search and filter criteria."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#EAE3D9] bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FAF7F2] border-b border-[#EAE3D9] text-xs font-semibold text-[#8C7A6E] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Order #</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Decision</th>
                  <th className="py-3.5 px-4">Reason / Notes</th>
                  <th className="py-3.5 px-4">Cashier</th>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EAE1]">
                {paginatedItems.map((item) => (
                  <tr key={item.review_id} className="hover:bg-[#FCFBF9] transition-colors">
                    {/* Order # */}
                    <td className="py-3.5 px-4 font-mono font-bold text-[#2A1810]">
                      {item.order_number}
                    </td>

                    {/* Customer */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#2A1810]">{item.customer_name}</div>
                      {item.customer_phone && (
                        <div className="text-xs text-[#70645C] font-mono">
                          {item.customer_phone}
                        </div>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 font-bold font-mono text-[#2A1810] whitespace-nowrap">
                      {item.payment_amount.toLocaleString()} ETB
                      <span className="block text-[11px] text-[#8C7A6E] font-sans font-normal">
                        {item.payment_method}
                      </span>
                    </td>

                    {/* Decision */}
                    <td className="py-3.5 px-4">
                      {item.decision === "approved" ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-50 text-emerald-800 border-emerald-300 flex items-center gap-1 w-fit font-bold"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-red-50 text-red-800 border-red-300 flex items-center gap-1 w-fit font-bold"
                        >
                          <XCircle className="h-3 w-3 text-red-600" />
                          Rejected
                        </Badge>
                      )}
                    </td>

                    {/* Reason */}
                    <td className="py-3.5 px-4 max-w-xs text-xs">
                      {item.reason ? (
                        <span className="text-[#2A1810] font-medium">{item.reason}</span>
                      ) : (
                        <span className="text-[#8C7A6E]">—</span>
                      )}
                    </td>

                    {/* Cashier */}
                    <td className="py-3.5 px-4 text-xs font-semibold text-[#2A1810] whitespace-nowrap">
                      {item.cashier_name}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-xs text-[#70645C] whitespace-nowrap font-mono">
                      <div>{new Date(item.reviewed_at).toLocaleDateString()}</div>
                      <div className="text-[11px] text-[#8C7A6E]">
                        {new Date(item.reviewed_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleInspect(item)}
                        className="h-8 text-xs font-semibold text-[#2A1810] hover:bg-[#FAF7F2] border border-[#EAE3D9] rounded-xl px-2.5"
                        title="Inspect payment details and proof"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1 text-[#8C7A6E]" />
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-[#EAE3D9] text-xs text-[#70645C] bg-[#FAF7F2]">
              <span>
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredHistory.length)} of{" "}
                {filteredHistory.length} review records
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="h-8 px-2.5 text-xs rounded-xl border-[#EAE3D9] bg-white text-[#2A1810]"
                >
                  Previous
                </Button>
                <span className="px-2 font-semibold text-[#2A1810]">
                  {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="h-8 px-2.5 text-xs rounded-xl border-[#EAE3D9] bg-white text-[#2A1810]"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
