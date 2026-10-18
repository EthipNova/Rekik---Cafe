import { getProduct } from "./menu-data";

export type OrderMethod = "dine-in" | "takeaway" | "delivery";
export type OrderStatus =
  "received" | "confirmed" | "preparing" | "ready" | "out-for-delivery" | "delivered" | "completed";

export type OrderItem = { productId: string; name: string; quantity: number; price: number };

export type Order = {
  id: string;
  number: string;
  createdAt: string;
  method: OrderMethod;
  status: OrderStatus;
  paymentStatus: "paid" | "pending" | "failed";
  paymentMethod: string;
  customer: {
    name: string;
    phone: string;
    table?: string;
    address?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  items: OrderItem[];
  subtotal: number;
  discount: number;
  delivery: number;
  distanceKm?: number | null;
  total: number;
  waiterId?: string | null;
  waiterName?: string | null;
  waiterDecision?: "pending" | "approved" | "rejected";
  waiterRejectionReason?: string | null;
  paymentProof?: {
    id: string;
    paymentId?: string;
    screenshotPath: string;
    submittedAmount: number;
    transactionReference?: string | null;
    status: "pending" | "approved" | "rejected";
    rejectionReason?: string | null;
    submittedAt: string;
  } | null;
};

const STORAGE_KEY = "neba.orders.v1";

export const dineInFlow: OrderStatus[] = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "completed",
];
export const deliveryFlow: OrderStatus[] = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "out-for-delivery",
  "delivered",
  "completed",
];

export const statusLabels: Record<OrderStatus, string> = {
  received: "Order Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
};

export const methodLabels: Record<OrderMethod, string> = {
  "dine-in": "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

export function flowFor(method: OrderMethod) {
  return method === "delivery" ? deliveryFlow : dineInFlow;
}

export function readOrders(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
}

export function writeOrders(orders: Order[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // Ignore storage quota or disabled localStorage errors
  }
}

export function saveOrder(order: Order): Order {
  const all = [order, ...readOrders()];
  writeOrders(all);
  return order;
}

export function findOrder(id: string) {
  return readOrders().find((o) => o.id === id || o.number === id);
}

export function buildOrder(input: {
  lines: { productId: string; name?: string; quantity: number; price?: number }[];
  method: OrderMethod;
  customer: Order["customer"];
  paymentMethod: string;
  delivery: number;
  paymentStatus?: "paid" | "pending" | "failed";
  discount?: number;
}): Order {
  const items: OrderItem[] = input.lines.flatMap((line) => {
    const product = getProduct(line.productId);
    const name = line.name || product?.name || "Menu Item";
    const price =
      line.price !== undefined
        ? Number(line.price)
        : product?.price !== undefined
          ? Number(product.price)
          : 0;
    return [
      {
        productId: product?.id || line.productId,
        name,
        quantity: Math.max(1, Number(line.quantity) || 1),
        price,
      },
    ];
  });
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = Math.max(0, Number(input.discount) || 0);
  const total = Math.max(0, subtotal - discount + input.delivery);
  const number = `#${1000 + (readOrders().length % 900) + Math.floor(Math.random() * 90)}`;
  return {
    id: `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    number,
    createdAt: new Date().toISOString(),
    method: input.method,
    status: "received",
    paymentStatus: input.paymentStatus || "paid",
    paymentMethod: input.paymentMethod,
    customer: input.customer,
    items,
    subtotal,
    discount,
    delivery: input.delivery,
    total,
  };
}
