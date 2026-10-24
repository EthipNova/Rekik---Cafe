import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  Users,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/site/Section";
import {
  fetchAdminCustomers,
  formatCustomerFullDateTime,
  formatCustomerRelativeDate,
  formatETB,
  maskPhone,
  type DerivedCustomer,
} from "@/lib/customers";
import { methodLabels, statusLabels, type Order, type OrderMethod } from "@/lib/orders";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customer Management — Rekik Café" },
      {
        name: "description",
        content: "View customer profiles and order history derived from customer orders.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminCustomers,
});

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1 bg-success/15 text-success border-success/30 font-medium text-xs py-0.5 px-2"
      >
        <CheckCircle2 className="size-3" aria-hidden />
        <span>Paid</span>
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge
        variant="secondary"
        className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium text-xs py-0.5 px-2"
      >
        <Clock className="size-3" aria-hidden />
        <span>Pending</span>
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge
        variant="destructive"
        className="inline-flex items-center gap-1 font-medium text-xs py-0.5 px-2"
      >
        <AlertCircle className="size-3" aria-hidden />
        <span>Failed</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs uppercase">
      {status}
    </Badge>
  );
}

function MethodBadge({ method }: { method: OrderMethod | string }) {
  const icon =
    method === "dine-in" ? (
      <Utensils className="size-3" aria-hidden />
    ) : method === "delivery" ? (
      <MapPin className="size-3" aria-hidden />
    ) : (
      <ShoppingBag className="size-3" aria-hidden />
    );

  const label = methodLabels[method as OrderMethod] || method;

  return (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1 font-normal text-xs py-0.5 px-2"
    >
      {icon}
      <span>{label}</span>
    </Badge>
  );
}

function OrderStageBadge({ status }: { status: string }) {
  const isComplete = status === "completed" || status === "delivered";
  const isReady = status === "ready" || status === "out-for-delivery";

  if (isComplete) {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1 bg-success/15 text-success border-success/30 font-medium text-xs py-0.5 px-2"
      >
        <CheckCircle2 className="size-3" aria-hidden />
        <span>{statusLabels[status as keyof typeof statusLabels] || status}</span>
      </Badge>
    );
  }

  if (isReady) {
    return (
      <Badge
        variant="secondary"
        className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium text-xs py-0.5 px-2"
      >
        <Clock className="size-3" aria-hidden />
        <span>{statusLabels[status as keyof typeof statusLabels] || status}</span>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs font-normal">
      {statusLabels[status as keyof typeof statusLabels] || status}
    </Badge>
  );
}

function getItemCount(order: Order): number {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum, item) => sum + (item.quantity || 1), 0);
}

function AdminCustomers() {
  const [customers, setCustomers] = useState<DerivedCustomer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchErr } = await fetchAdminCustomers();
    if (fetchErr) {
      setError(fetchErr.message || "Failed to load customer profiles from database");
      setCustomers(null);
    } else {
      setCustomers(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const allCustomers = useMemo(() => customers ?? [], [customers]);

  // Overview metrics
  const totalCustomersCount = allCustomers.length;
  const activeCustomersCount = allCustomers.filter((c) => c.isRecent).length;
  const totalOrdersCount = allCustomers.reduce((sum, c) => sum + c.orderCount, 0);
  const totalSpendingAmount = allCustomers.reduce((sum, c) => sum + c.totalSpent, 0);

  // Filter customers
  const filteredCustomers = useMemo(() => {
    return allCustomers.filter((c) => {
      // Fulfillment method filter (matches preferred method or any order with that method)
      if (methodFilter !== "all") {
        const matchesPreferred = c.preferredMethod === methodFilter;
        const matchesAnyOrder = c.orders.some((o) => o.method === methodFilter);
        if (!matchesPreferred && !matchesAnyOrder) {
          return false;
        }
      }

      // Customer activity filter (recent or returning)
      if (activityFilter === "recent" && !c.isRecent) {
        return false;
      }
      if (activityFilter === "returning" && !c.isReturning) {
        return false;
      }

      // Search query filter (matches name, phone, raw phone, or order numbers)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = c.name.toLowerCase().includes(q);
        const phoneMatch = c.phone.toLowerCase().includes(q);
        const rawPhoneMatch = c.rawPhone.toLowerCase().includes(q);
        const orderMatch = c.orders.some(
          (o) =>
            (o.number && o.number.toLowerCase().includes(q)) ||
            (o.id && o.id.toLowerCase().includes(q)),
        );

        if (!nameMatch && !phoneMatch && !rawPhoneMatch && !orderMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allCustomers, methodFilter, activityFilter, searchQuery]);

  // Sort customers
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      if (sortBy === "recent") {
        const timeA = new Date(a.lastOrderDate).getTime() || 0;
        const timeB = new Date(b.lastOrderDate).getTime() || 0;
        return timeB - timeA;
      }
      if (sortBy === "oldest") {
        const timeA = new Date(a.firstOrderDate).getTime() || 0;
        const timeB = new Date(b.firstOrderDate).getTime() || 0;
        return timeA - timeB;
      }
      if (sortBy === "most-orders") {
        return b.orderCount - a.orderCount;
      }
      if (sortBy === "highest-spending") {
        return b.totalSpent - a.totalSpent;
      }
      if (sortBy === "lowest-spending") {
        return a.totalSpent - b.totalSpent;
      }
      if (sortBy === "name-asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name-desc") {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });
  }, [filteredCustomers, sortBy]);

  const selectedCustomer = allCustomers.find((c) => c.id === selectedCustomerId) ?? null;

  const resetFilters = () => {
    setSearchQuery("");
    setMethodFilter("all");
    setActivityFilter("all");
    setSortBy("recent");
  };

  const isFiltered =
    searchQuery.trim() !== "" ||
    methodFilter !== "all" ||
    activityFilter !== "all" ||
    sortBy !== "recent";

  const handleCopyPhone = (phoneStr: string) => {
    if (!phoneStr || phoneStr === "Not provided") return;
    navigator.clipboard.writeText(phoneStr);
    toast.success("Customer phone number copied to clipboard");
  };

  return (
    <div className="space-y-8">
      {/* 1. HEADER & OVERVIEW */}
      <header>
        <h1 className="font-display text-3xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review customer order history, visit frequencies, and dining preferences.
        </p>
      </header>

      {/* 2. OVERVIEW METRICS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Customers */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-primary">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Customers
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {error ? "—" : totalCustomersCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {error
              ? "Unavailable due to database error"
              : totalCustomersCount === 1
                ? "Customer profile in database"
                : "Customer profiles in database"}
          </p>
        </div>

        {/* Active Customers */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-success">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Customers
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-success/10 text-success">
              <UserCheck className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {error ? "—" : activeCustomersCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {error ? "Unavailable due to database error" : "Ordered within the last 30 days"}
          </p>
        </div>

        {/* Total Orders */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Orders
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShoppingBag className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {error ? "—" : totalOrdersCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {error ? "Unavailable due to database error" : "Recorded across all customer orders"}
          </p>
        </div>

        {/* Total Customer Spending */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Customer Spending
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {error ? "—" : formatETB(totalSpendingAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {error ? "Unavailable due to database error" : "Cumulative client order volume"}
          </p>
        </div>
      </div>

      {/* 3. SEARCH & FILTERS */}
      <div className="surface-card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search by customer name, phone, order #…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
              aria-label="Search customers"
            />
          </div>

          {/* Fulfillment Method Filter */}
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by fulfillment method">
              <SelectValue placeholder="Fulfillment method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fulfillment methods</SelectItem>
              <SelectItem value="dine-in">Dine-in</SelectItem>
              <SelectItem value="takeaway">Takeaway</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>

          {/* Activity Filter */}
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by customer activity">
              <SelectValue placeholder="Customer activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activity</SelectItem>
              <SelectItem value="recent">Recent (Last 30 days)</SelectItem>
              <SelectItem value="returning">Returning (&gt;1 order)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Secondary controls row: Sorting & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
            <span>Sort by:</span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-7 text-xs w-[160px]" aria-label="Sort customers">
                <SelectValue placeholder="Sort order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent order</SelectItem>
                <SelectItem value="oldest">Oldest customer</SelectItem>
                <SelectItem value="most-orders">Most orders</SelectItem>
                <SelectItem value="highest-spending">Highest spending</SelectItem>
                <SelectItem value="lowest-spending">Lowest spending</SelectItem>
                <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z–A)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Showing <strong>{sortedCustomers.length}</strong> of{" "}
              <strong>{allCustomers.length}</strong> customers
            </span>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary"
                onClick={resetFilters}
              >
                <RotateCcw className="size-3" aria-hidden />
                Reset filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 4. CUSTOMER LIST */}
      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <p className="animate-pulse">Loading customer profiles from Supabase…</p>
        </div>
      ) : error ? (
        <div className="surface-card p-12 text-center space-y-4 border-destructive/20 bg-destructive/5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Failed to load customer profiles
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadCustomers()}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            <span>Retry connection</span>
          </Button>
        </div>
      ) : allCustomers.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8 text-muted-foreground" />}
          title="No customers yet"
          description="Customer profiles will appear here automatically as orders are submitted through checkout."
          action={
            <Button asChild>
              <Link to="/menu">Go to Menu</Link>
            </Button>
          }
        />
      ) : sortedCustomers.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-3">
          <p className="text-base font-medium">No customers found</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No customer profiles match your search criteria or active filters. Try adjusting your
            query.
          </p>
          <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            Reset all filters
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Table */}
          <div className="hidden md:block surface-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                    <TableHead className="font-semibold text-xs uppercase tracking-wider">
                      Customer
                    </TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider">
                      Phone
                    </TableHead>
                    <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">
                      Orders
                    </TableHead>
                    <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">
                      Total Spent
                    </TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider">
                      Last Order
                    </TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider">
                      Preferred Method
                    </TableHead>
                    <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCustomers.map((customer) => {
                    const initials = customer.name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();

                    return (
                      <TableRow
                        key={customer.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setSelectedCustomerId(customer.id)}
                      >
                        {/* Customer Name & Initial */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                              {initials || "C"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground text-sm flex items-center gap-1.5 truncate">
                                <span>{customer.name}</span>
                                {customer.isReturning && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 font-normal bg-secondary text-secondary-foreground"
                                  >
                                    Returning
                                  </Badge>
                                )}
                              </p>
                              {customer.isRecent && (
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-normal">
                                  Active recently
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Masked Phone */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {maskPhone(customer.phone)}
                        </TableCell>

                        {/* Orders count */}
                        <TableCell className="text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                            {customer.orderCount}
                          </span>
                        </TableCell>

                        {/* Total Spent */}
                        <TableCell className="text-right font-display font-semibold text-foreground whitespace-nowrap">
                          {formatETB(customer.totalSpent)}
                        </TableCell>

                        {/* Last Order date */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <span className="font-medium text-foreground">
                            {formatCustomerRelativeDate(customer.lastOrderDate)}
                          </span>
                        </TableCell>

                        {/* Preferred Method */}
                        <TableCell className="whitespace-nowrap">
                          <MethodBadge method={customer.preferredMethod} />
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1.5 hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomerId(customer.id);
                            }}
                            aria-label={`View details for ${customer.name}`}
                          >
                            <Eye className="size-3.5" aria-hidden />
                            <span>Details</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="block md:hidden space-y-3">
            {sortedCustomers.map((customer) => {
              const initials = customer.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();

              return (
                <div
                  key={customer.id}
                  className="surface-card p-4 space-y-3 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setSelectedCustomerId(customer.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                        {initials || "C"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">
                          {customer.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{maskPhone(customer.phone)}</p>
                      </div>
                    </div>
                    <MethodBadge method={customer.preferredMethod} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-y border-border/50 py-2.5 text-center text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">
                        Orders
                      </span>
                      <span className="font-semibold text-foreground text-sm">
                        {customer.orderCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">
                        Total Spent
                      </span>
                      <span className="font-semibold text-foreground text-sm">
                        {formatETB(customer.totalSpent)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">
                        Last Order
                      </span>
                      <span className="font-medium text-foreground text-xs mt-0.5 block">
                        {formatCustomerRelativeDate(customer.lastOrderDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {customer.isReturning ? "Returning customer" : "First-time diner"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5 gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCustomerId(customer.id);
                      }}
                    >
                      <Eye className="size-3" aria-hidden />
                      View history
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 5. CUSTOMER DETAILS SHEET */}
      <Sheet
        open={Boolean(selectedCustomerId)}
        onOpenChange={(open) => !open && setSelectedCustomerId(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto space-y-6 bg-cream dark:bg-card"
        >
          {selectedCustomer ? (
            <>
              <SheetHeader className="text-left space-y-1 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-display font-semibold text-lg">
                    {selectedCustomer.name
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "C"}
                  </div>
                  <div>
                    <SheetTitle className="font-display text-2xl font-bold">
                      {selectedCustomer.name}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      {selectedCustomer.isReturning ? (
                        <Badge
                          variant="secondary"
                          className="bg-secondary text-secondary-foreground text-[10px] py-0 px-1.5 font-normal"
                        >
                          Returning diner
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                          New diner
                        </Badge>
                      )}
                      {selectedCustomer.isRecent && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          Active recently
                        </span>
                      )}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              {/* Customer Lifetime Summary Stats */}
              <section aria-labelledby="customer-lifetime-stats" className="space-y-3">
                <h3
                  id="customer-lifetime-stats"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Customer Summary
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="surface-card p-3.5 space-y-1 text-center">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground block">
                      Total Orders
                    </span>
                    <span className="font-display text-xl font-bold text-foreground">
                      {selectedCustomer.orderCount}
                    </span>
                  </div>
                  <div className="surface-card p-3.5 space-y-1 text-center">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground block">
                      Total Spending
                    </span>
                    <span className="font-display text-lg font-bold text-primary">
                      {formatETB(selectedCustomer.totalSpent)}
                    </span>
                  </div>
                  <div className="surface-card p-3.5 space-y-1 text-center">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground block">
                      Avg. Order Value
                    </span>
                    <span className="font-display text-lg font-bold text-foreground">
                      {formatETB(
                        selectedCustomer.orderCount > 0
                          ? Math.round(selectedCustomer.totalSpent / selectedCustomer.orderCount)
                          : 0,
                      )}
                    </span>
                  </div>
                </div>
              </section>

              {/* Customer Contact & Profile Details */}
              <section aria-labelledby="customer-contact-info" className="space-y-3">
                <h3
                  id="customer-contact-info"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Contact & Profile
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5 text-sm">
                  {/* Phone */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                      <Phone className="size-3.5" aria-hidden /> Phone
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{selectedCustomer.phone}</span>
                      {selectedCustomer.phone !== "Not provided" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-foreground"
                          onClick={() => handleCopyPhone(selectedCustomer.phone)}
                          title="Copy phone"
                        >
                          <Copy className="size-3" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Preferred Fulfillment Method */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                      <Utensils className="size-3.5" aria-hidden /> Preferred Method
                    </span>
                    <MethodBadge method={selectedCustomer.preferredMethod} />
                  </div>

                  {/* First Order Date */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                      <Calendar className="size-3.5" aria-hidden /> First Order
                    </span>
                    <span className="text-xs text-foreground font-medium">
                      {formatCustomerFullDateTime(selectedCustomer.firstOrderDate)}
                    </span>
                  </div>

                  {/* Most Recent Order Date */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                      <Clock className="size-3.5" aria-hidden /> Most Recent Order
                    </span>
                    <span className="text-xs text-foreground font-medium">
                      {formatCustomerFullDateTime(selectedCustomer.lastOrderDate)}
                    </span>
                  </div>

                  {/* Known Tables */}
                  {selectedCustomer.tables.length > 0 && (
                    <div className="border-t border-border/50 pt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Known Dining Tables</span>
                      <span className="font-medium text-foreground">
                        {selectedCustomer.tables.map((t) => `Table #${t}`).join(", ")}
                      </span>
                    </div>
                  )}

                  {/* Known Delivery Addresses */}
                  {selectedCustomer.addresses.length > 0 && (
                    <div className="border-t border-border/50 pt-2 text-xs space-y-1">
                      <span className="text-muted-foreground block">
                        Saved Delivery Locations ({selectedCustomer.addresses.length})
                      </span>
                      <div className="space-y-1">
                        {selectedCustomer.addresses.map((addr, idx) => (
                          <p
                            key={idx}
                            className="font-medium text-foreground flex items-start gap-1"
                          >
                            <span>📍</span>
                            <span>{addr}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Order History */}
              <section aria-labelledby="customer-order-history" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="customer-order-history"
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    Order History
                  </h3>
                  <span className="text-xs text-muted-foreground font-medium">
                    {selectedCustomer.orders.length}{" "}
                    {selectedCustomer.orders.length === 1 ? "order" : "orders"}
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedCustomer.orders.map((order) => (
                    <div
                      key={order.id || order.number}
                      className="rounded-xl border border-border bg-card/60 p-4 space-y-3 text-sm"
                    >
                      {/* Order top bar */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-foreground">
                            {order.number}
                          </span>
                          <MethodBadge method={order.method} />
                        </div>
                        <span className="font-display font-semibold text-primary">
                          {formatETB(order.total)}
                        </span>
                      </div>

                      {/* Status & Date */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <OrderStageBadge status={order.status} />
                          <PaymentStatusBadge status={order.paymentStatus} />
                        </div>
                        <span>
                          {new Date(order.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          ·{" "}
                          {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Order Items Preview */}
                      <div className="border-t border-border/50 pt-2 text-xs space-y-1">
                        <span className="text-muted-foreground text-[11px] block">
                          Items ({getItemCount(order)}):
                        </span>
                        <ul className="space-y-1">
                          {order.items?.map((item, idx) => (
                            <li key={idx} className="flex justify-between text-muted-foreground">
                              <span>
                                {item.quantity}× {item.name}
                              </span>
                              <span>{formatETB((item.price || 0) * (item.quantity || 1))}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Table or Delivery Address details */}
                      {order.method === "dine-in" && order.customer?.table && (
                        <div className="text-xs text-muted-foreground">
                          Dine-in at <strong>Table #{order.customer.table}</strong>
                        </div>
                      )}
                      {order.method === "delivery" && order.customer?.address && (
                        <div className="text-xs text-muted-foreground flex items-start gap-1">
                          <span>📍</span>
                          <span>{order.customer.address}</span>
                        </div>
                      )}

                      {/* Customer Order Receipt link */}
                      <div className="border-t border-border/50 pt-2 flex justify-end">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-primary hover:text-primary gap-1"
                        >
                          <Link to="/order/$id" params={{ id: order.id || order.number }}>
                            <span>View customer receipt</span>
                            <ExternalLink className="size-3" aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Close Button */}
              <div className="pt-2 border-t border-border">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelectedCustomerId(null)}
                >
                  Close
                </Button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center space-y-3 my-auto">
              <h3 className="font-display text-lg font-semibold">Customer not found</h3>
              <p className="text-xs text-muted-foreground">
                The selected customer could not be found in active order records.
              </p>
              <Button variant="outline" size="sm" onClick={() => setSelectedCustomerId(null)}>
                Close
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
