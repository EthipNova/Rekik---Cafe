import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  UtensilsCrossed,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Utensils,
  Truck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Phone,
  User,
  CreditCard,
  Banknote,
  ArrowRight,
  Sparkles,
  X,
  FileText,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatETB } from "@/lib/menu-data";
import { fetchCategories, fetchProducts } from "@/services/api";
import {
  createManualWaiterOrder,
  lookupCustomerByPhone,
  type CustomerLookupResult,
} from "@/lib/waiter";
import { WaiterPaymentDialog } from "@/components/waiter/WaiterPaymentDialog";
import type { Category, Product } from "@/lib/menu-data";
import type { WaiterOrder } from "@/types/waiter";

export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}

const QUICK_TABLES = [
  "Table 1",
  "Table 2",
  "Table 3",
  "Table 4",
  "Table 5",
  "Table 6",
  "Table 7",
  "Table 8",
  "Table 9",
  "Table 10",
  "VIP 1",
  "VIP 2",
  "Patio 1",
  "Patio 2",
];

export function WaiterMenuOrderView() {
  const navigate = useNavigate();

  // Menu data
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);

  // Cart / Order state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderMethod, setOrderMethod] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [tableNumber, setTableNumber] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [customerNotes, setCustomerNotes] = useState<string>("");

  // Customer phone lookup state
  const [lookingUpCustomer, setLookingUpCustomer] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<CustomerLookupResult | null>(null);
  const [hasSearchedCustomer, setHasSearchedCustomer] = useState(false);

  // Validation & Submission
  const [formErrors, setFormErrors] = useState<{ table?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Post-submission modal & payment
  const [createdOrder, setCreatedOrder] = useState<WaiterOrder | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Mobile cart sheet / view toggle
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Load menu data directly from Supabase
  const loadMenuData = async () => {
    setLoading(true);
    setLoadingError(null);
    try {
      const [cats, prods] = await Promise.all([
        fetchCategories().catch(() => []),
        fetchProducts().catch(() => []),
      ]);
      setCategories(cats || []);
      setProducts(prods || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load menu data";
      console.error("[WaiterMenu] Menu fetch error:", err);
      setLoadingError(msg);
      toast.error("Failed to load menu items. Please check network connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMenuData();
  }, []);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (selectedCategory !== "all") {
        if (p.categorySlug !== selectedCategory && p.categoryId !== selectedCategory) {
          return false;
        }
      }

      // Availability filter
      if (availableOnly && !p.available) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesDesc = (p.description || "").toLowerCase().includes(q);
        const matchesIng = (p.ingredients || []).some((i) => i.toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesIng) {
          return false;
        }
      }

      return true;
    });
  }, [products, selectedCategory, availableOnly, searchQuery]);

  // Cart operations
  const addToCart = (product: Product) => {
    if (!product.available) {
      toast.error(`"${product.name}" is currently unavailable.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast.success(`Added ${product.name}`);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [cart]);

  const total = subtotal;

  // Phone lookup for existing customer
  const handleLookupPhone = async (phoneToLookup?: string) => {
    const raw = phoneToLookup !== undefined ? phoneToLookup : customerPhone;
    const clean = raw.trim();
    if (!clean) {
      setFoundCustomer(null);
      setHasSearchedCustomer(false);
      return;
    }

    setLookingUpCustomer(true);
    setHasSearchedCustomer(true);
    try {
      const result = await lookupCustomerByPhone(clean);
      if (result) {
        setFoundCustomer(result);
        if (result.name && (!customerName.trim() || customerName === "Guest" || customerName === "Dine-in Guest")) {
          setCustomerName(result.name);
        }
        toast.success(`Found existing customer: ${result.name}`);
      } else {
        setFoundCustomer(null);
      }
    } catch {
      setFoundCustomer(null);
    } finally {
      setLookingUpCustomer(false);
    }
  };

  // Debounced phone lookup when 9 or 10 digits are typed
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handlePhoneChange = (val: string) => {
    setCustomerPhone(val);
    const digitsOnly = val.replace(/\D/g, "");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (digitsOnly.length >= 9) {
      debounceTimerRef.current = setTimeout(() => {
        void handleLookupPhone(val);
      }, 500);
    } else {
      setFoundCustomer(null);
      setHasSearchedCustomer(false);
    }
  };

  // Submit manual waiter order
  const handleCreateOrder = async () => {
    // 1. Validate cart
    if (cart.length === 0) {
      toast.error("Cart is empty. Please select at least one menu item.");
      return;
    }

    // 2. Validate table number for dine-in
    const errors: { table?: string } = {};
    if (orderMethod === "dine_in" && !tableNumber.trim()) {
      errors.table = "Table number is required for Dine-In orders.";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error(errors.table || "Please fix validation errors.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createManualWaiterOrder({
        items: cart.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          notes: item.notes,
        })),
        method: orderMethod,
        tableNumber: orderMethod === "dine_in" ? tableNumber.trim() : null,
        customerName: customerName.trim() || (orderMethod === "dine_in" ? "Dine-in Guest" : "Guest"),
        customerPhone: customerPhone.trim() || null,
        deliveryAddress: orderMethod === "delivery" ? deliveryAddress.trim() || null : null,
        customerNotes: customerNotes.trim() || null,
        initialPaymentMethod: "Pending Waiter Settlement",
      });

      setCreatedOrder(created);
      setShowSuccessModal(true);
      toast.success(`Order ${created.orderNumber} created successfully!`);

      // Clear the cart form
      setCart([]);
      setTableNumber("");
      setCustomerPhone("");
      setCustomerName("");
      setDeliveryAddress("");
      setCustomerNotes("");
      setFoundCustomer(null);
      setHasSearchedCustomer(false);
      setMobileCartOpen(false);

      // Trigger custom event so any background orders listeners update
      window.dispatchEvent(new CustomEvent("neba:waiter-order-update"));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create order";
      console.error("[WaiterMenu] Order creation failure:", err);
      toast.error(`Order failed: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartPayment = () => {
    setShowSuccessModal(false);
    setShowPaymentDialog(true);
  };

  const handlePaymentSuccess = (updated: WaiterOrder) => {
    setShowPaymentDialog(false);
    toast.success(`Payment recorded for ${updated.orderNumber}!`);
    void navigate({ to: "/waiter/orders" });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              Menu & Take Order
            </h1>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
              Live Menu
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Browse real Rekik Café items, create customer orders manually, and collect instant payments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadMenuData()}
            disabled={loading}
            className="h-9 gap-2 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Menu
          </Button>

          {/* Mobile Cart Trigger Button */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setMobileCartOpen(!mobileCartOpen)}
            className="h-9 gap-2 text-xs lg:hidden relative"
          >
            <ShoppingBag className="size-4" />
            <span>Order</span>
            {cartCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-white text-primary text-[11px] font-bold">
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Main Grid: Catalog (left) + Order Summary/POS (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Product Catalog (lg:col-span-7 xl:col-span-8) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Search & Availability Bar */}
          <div className="surface-card p-3 sm:p-4 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search food, coffee, drinks, ingredients…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant={availableOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAvailableOnly(!availableOnly)}
                  className="h-10 text-xs gap-1.5"
                >
                  <Filter className="size-3.5" />
                  <span>Available Only</span>
                </Button>
              </div>
            </div>

            {/* Categories Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`rounded-full px-3.5 py-1.5 font-medium transition-all shrink-0 ${
                  selectedCategory === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                All Items ({products.length})
              </button>
              {categories.map((cat) => {
                const count = products.filter(
                  (p) => p.categorySlug === cat.slug || p.categoryId === cat.id,
                ).length;
                const isSelected = selectedCategory === cat.slug || selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id || cat.slug}
                    type="button"
                    onClick={() => setSelectedCategory(cat.slug || cat.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-all shrink-0 ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {cat.imageUrl && (
                      <img
                        src={cat.imageUrl}
                        alt=""
                        className="size-4 rounded-full object-cover border border-white/20 shrink-0"
                        aria-hidden
                      />
                    )}
                    <span>{cat.name} ({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="surface-card p-12 text-center rounded-xl">
              <UtensilsCrossed className="size-8 text-primary animate-pulse mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Loading Rekik Café menu items…
              </p>
            </div>
          )}

          {/* Error State */}
          {!loading && loadingError && (
            <div className="surface-card p-8 text-center rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
              <AlertCircle className="size-8 text-destructive mx-auto" />
              <p className="text-sm font-semibold text-destructive">{loadingError}</p>
              <Button size="sm" variant="outline" onClick={() => void loadMenuData()}>
                Retry Loading
              </Button>
            </div>
          )}

          {/* Empty Catalog State */}
          {!loading && !loadingError && filteredProducts.length === 0 && (
            <div className="surface-card p-12 text-center rounded-xl space-y-2">
              <Utensils className="size-8 text-muted-foreground mx-auto" />
              <h3 className="text-base font-semibold">No menu items match your search</h3>
              <p className="text-xs text-muted-foreground">
                Try clearing your search query or selecting a different category.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                  setAvailableOnly(false);
                }}
                className="mt-2 text-xs"
              >
                Reset Filters
              </Button>
            </div>
          )}

          {/* Product Cards Grid */}
          {!loading && !loadingError && filteredProducts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filteredProducts.map((product) => {
                const inCartItem = cart.find((i) => i.product.id === product.id);
                const quantityInCart = inCartItem?.quantity || 0;

                return (
                  <div
                    key={product.id}
                    className={`surface-card rounded-xl overflow-hidden flex flex-col justify-between border transition-all hover:shadow-md ${
                      !product.available
                        ? "opacity-60 bg-muted/30 border-muted"
                        : inCartItem
                          ? "border-primary/50 ring-1 ring-primary/20 bg-primary/[0.02]"
                          : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div>
                      {/* Product Image */}
                      <div className="relative aspect-video w-full bg-secondary/40 overflow-hidden">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="size-full object-cover transition-transform duration-300 hover:scale-105"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/images/hero.jpg";
                            }}
                          />
                        ) : (
                          <div className="size-full flex items-center justify-center text-muted-foreground">
                            <Utensils className="size-6 opacity-30" />
                          </div>
                        )}

                        {/* Availability Badge */}
                        <div className="absolute top-2 left-2">
                          {product.available ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-emerald-500/90 text-white border-0 shadow-xs font-semibold backdrop-blur-xs"
                            >
                              Available
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 bg-destructive/90 text-white border-0 shadow-xs font-semibold"
                            >
                              Out of stock
                            </Badge>
                          )}
                        </div>

                        {/* In Cart Indicator */}
                        {quantityInCart > 0 && (
                          <div className="absolute top-2 right-2">
                            <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 font-bold shadow-xs">
                              {quantityInCart} in cart
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="p-3 space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="font-display text-sm font-semibold text-foreground line-clamp-1 leading-snug">
                            {product.name}
                          </h4>
                        </div>
                        {product.categorySlug && (
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                            {product.categorySlug}
                          </p>
                        )}
                        {product.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight pt-0.5">
                            {product.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bottom: Price + Action */}
                    <div className="p-3 pt-0 flex items-center justify-between border-t border-border/40 mt-2">
                      <span className="font-display text-sm font-bold text-primary">
                        {formatETB(product.price)}
                      </span>

                      {product.available ? (
                        quantityInCart > 0 ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-7 rounded-md"
                              onClick={() => updateQuantity(product.id, -1)}
                            >
                              <Minus className="size-3" />
                            </Button>
                            <span className="text-xs font-bold px-1.5 min-w-[20px] text-center">
                              {quantityInCart}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                              onClick={() => addToCart(product)}
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2.5 text-xs gap-1 rounded-md"
                            onClick={() => addToCart(product)}
                          >
                            <Plus className="size-3" />
                            <span>Add</span>
                          </Button>
                        )
                      ) : (
                        <span className="text-[10px] font-medium text-muted-foreground italic">
                          Unavailable
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Cart / Order Configuration Panel (lg:col-span-5 xl:col-span-4) */}
        <div
          className={`lg:col-span-5 xl:col-span-4 lg:sticky lg:top-4 space-y-4 ${
            mobileCartOpen
              ? "fixed inset-0 z-50 overflow-y-auto bg-background p-4 flex flex-col justify-between"
              : "hidden lg:block"
          }`}
        >
          <div className="surface-card rounded-xl p-4 sm:p-5 border border-border shadow-sm space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-5 text-primary" />
                <h3 className="font-display text-lg font-bold">Current Order</h3>
                {cartCount > 0 && (
                  <Badge variant="secondary" className="text-xs px-2 py-0">
                    {cartCount} {cartCount === 1 ? "item" : "items"}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {cart.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearCart}
                    className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
                  >
                    <Trash2 className="size-3" />
                    <span>Clear</span>
                  </Button>
                )}
                {/* Mobile close button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 lg:hidden"
                  onClick={() => setMobileCartOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <UtensilsCrossed className="size-5" />
                </div>
                <p className="text-sm font-medium text-foreground">Order cart is empty</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Select menu items from the left catalog to start building the customer's order.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-secondary/30 border border-border/50 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{item.product.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatETB(item.product.price)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center rounded-md border border-border bg-background">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="size-6 flex items-center justify-center hover:bg-secondary rounded-l-md"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="size-2.5" />
                        </button>
                        <span className="w-6 text-center font-bold text-xs">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="size-6 flex items-center justify-center hover:bg-secondary rounded-r-md"
                          aria-label="Increase quantity"
                        >
                          <Plus className="size-2.5" />
                        </button>
                      </div>

                      <span className="font-bold min-w-[65px] text-right text-primary">
                        {formatETB(item.product.price * item.quantity)}
                      </span>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded-sm"
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Order Type Selector */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <Label className="text-xs font-semibold">Order Type</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOrderMethod("dine_in");
                    setFormErrors({});
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg border text-xs font-medium transition-all ${
                    orderMethod === "dine_in"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border bg-background hover:bg-secondary/60 text-muted-foreground"
                  }`}
                >
                  <Utensils className="size-4 mb-1" />
                  <span>Dine-In</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrderMethod("takeaway");
                    setFormErrors({});
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg border text-xs font-medium transition-all ${
                    orderMethod === "takeaway"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border bg-background hover:bg-secondary/60 text-muted-foreground"
                  }`}
                >
                  <ShoppingBag className="size-4 mb-1" />
                  <span>Takeaway</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrderMethod("delivery");
                    setFormErrors({});
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg border text-xs font-medium transition-all ${
                    orderMethod === "delivery"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border bg-background hover:bg-secondary/60 text-muted-foreground"
                  }`}
                >
                  <Truck className="size-4 mb-1" />
                  <span>Delivery</span>
                </button>
              </div>
            </div>

            {/* Dine-In: Table Number (REQUIRED) */}
            {orderMethod === "dine_in" && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="table-number" className="text-xs font-semibold">
                    Table Number <span className="text-destructive font-bold">*</span>
                  </Label>
                  {formErrors.table && (
                    <span className="text-[11px] text-destructive font-medium">
                      {formErrors.table}
                    </span>
                  )}
                </div>

                <Input
                  id="table-number"
                  type="text"
                  placeholder="e.g. Table 4 / Patio 2"
                  value={tableNumber}
                  onChange={(e) => {
                    setTableNumber(e.target.value);
                    if (formErrors.table) setFormErrors({});
                  }}
                  className={`h-9 text-xs ${formErrors.table ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />

                {/* Quick table pills */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {QUICK_TABLES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setTableNumber(t);
                        if (formErrors.table) setFormErrors({});
                      }}
                      className={`text-[11px] px-2 py-0.5 rounded border transition-all ${
                        tableNumber === t
                          ? "bg-primary text-primary-foreground border-primary font-semibold"
                          : "bg-secondary/50 hover:bg-secondary border-border text-muted-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery Address (Optional) */}
            {orderMethod === "delivery" && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="delivery-address" className="text-xs font-semibold">
                  Delivery Destination
                </Label>
                <Input
                  id="delivery-address"
                  type="text"
                  placeholder="e.g. Bole, Building 4, Floor 2"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            {/* Customer Contact & Phone Lookup */}
            <div className="space-y-2 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <Label htmlFor="customer-phone" className="text-xs font-semibold">
                  Customer Phone
                </Label>
                {lookingUpCustomer && (
                  <span className="text-[11px] text-primary flex items-center gap-1 animate-pulse">
                    <RefreshCw className="size-2.5 animate-spin" /> Looking up…
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="customer-phone"
                    type="tel"
                    placeholder="e.g. 0911223344"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="h-9 pl-8 text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleLookupPhone()}
                  disabled={lookingUpCustomer || !customerPhone.trim()}
                  className="h-9 text-xs shrink-0"
                >
                  Lookup
                </Button>
              </div>

              {/* Customer Lookup Result Feedback */}
              {hasSearchedCustomer && (
                <div>
                  {foundCustomer ? (
                    <div className="flex items-center gap-1.5 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-semibold">{foundCustomer.name}</span>
                        <span className="text-[11px] opacity-80 block">
                          Verified customer ({foundCustomer.orderCount} previous{" "}
                          {foundCustomer.orderCount === 1 ? "order" : "orders"})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 p-2 rounded-md bg-secondary/50 text-muted-foreground text-xs">
                      <User className="size-3.5 shrink-0" />
                      <span>New guest customer — no prior record found.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Customer Name Field */}
              <div className="space-y-1">
                <Label htmlFor="customer-name" className="text-xs font-semibold">
                  Customer Name
                </Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="customer-name"
                    type="text"
                    placeholder="Guest name (optional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-9 pl-8 text-xs"
                  />
                </div>
              </div>

              {/* Order Notes / Special Instructions */}
              <div className="space-y-1">
                <Label htmlFor="customer-notes" className="text-xs font-semibold">
                  Kitchen Notes & Instructions
                </Label>
                <Textarea
                  id="customer-notes"
                  placeholder="e.g. Extra hot, no onions, fast service"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
            </div>

            {/* Financial Summary */}
            <div className="space-y-2 pt-3 border-t border-border">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal ({cartCount} items)</span>
                <span>{formatETB(subtotal)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-foreground pt-1 border-t border-border/50">
                <span>Total Due</span>
                <span className="text-primary">{formatETB(total)}</span>
              </div>
            </div>

            {/* Place Order Action Button */}
            <Button
              type="button"
              className="w-full h-11 text-sm font-bold shadow-md gap-2"
              disabled={submitting || cart.length === 0}
              onClick={handleCreateOrder}
            >
              {submitting ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  <span>Submitting Order…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>Place Customer Order ({formatETB(total)})</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Post-Creation Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
              <CheckCircle2 className="size-7" />
            </div>
            <DialogTitle className="font-display text-xl font-bold">
              Order {createdOrder?.orderNumber} Placed!
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              The order has been created and assigned to you. Choose how you wish to proceed.
            </DialogDescription>
          </DialogHeader>

          {createdOrder && (
            <div className="rounded-xl bg-secondary/40 p-4 border border-border/60 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Reference:</span>
                <span className="font-mono font-bold">{createdOrder.orderReference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Type:</span>
                <span className="font-semibold capitalize">
                  {createdOrder.method === "dine_in"
                    ? `Dine-In (${createdOrder.tableNumber || "Table"})`
                    : createdOrder.method === "pickup"
                      ? "Takeaway"
                      : "Delivery"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold">{createdOrder.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items:</span>
                <span className="font-semibold">{createdOrder.items?.length || 0} items</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-border pt-2 text-foreground">
                <span>Total Amount:</span>
                <span className="text-primary">{formatETB(createdOrder.totalAmount)}</span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-col gap-2 pt-2">
            <Button
              type="button"
              className="w-full h-10 text-xs font-bold gap-2"
              onClick={handleStartPayment}
            >
              <Banknote className="size-4" />
              <span>Collect Payment Now (Cash / CBE / Telebirr)</span>
            </Button>

            <div className="grid grid-cols-2 gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                className="w-full h-9 text-xs"
                onClick={() => {
                  setShowSuccessModal(false);
                  void navigate({ to: "/waiter/orders" });
                }}
              >
                <span>View in Orders</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full h-9 text-xs"
                onClick={() => setShowSuccessModal(false)}
              >
                <span>Take Next Order</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Collection Dialog */}
      <WaiterPaymentDialog
        order={createdOrder}
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}

