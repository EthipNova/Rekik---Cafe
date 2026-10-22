import type { OrderMethod, OrderStatus } from "./orders";

/** DEMO DATA for the admin dashboard — replaced by GET /api/admin/* later. */
export type BoardOrder = {
  number: string;
  method: OrderMethod;
  status: OrderStatus;
  total: number;
  customer: string;
  items: number;
  paymentStatus: "paid" | "pending" | "failed";
};

export const demoBoardOrders: BoardOrder[] = [
  {
    number: "#1024",
    method: "dine-in",
    status: "received",
    total: 600,
    customer: "Table 4",
    items: 3,
    paymentStatus: "paid",
  },
  {
    number: "#1025",
    method: "delivery",
    status: "received",
    total: 880,
    customer: "Selam A.",
    items: 4,
    paymentStatus: "pending",
  },
  {
    number: "#1021",
    method: "takeaway",
    status: "confirmed",
    total: 350,
    customer: "Yonas T.",
    items: 2,
    paymentStatus: "paid",
  },
  {
    number: "#1022",
    method: "dine-in",
    status: "confirmed",
    total: 250,
    customer: "Table 9",
    items: 1,
    paymentStatus: "paid",
  },
  {
    number: "#1020",
    method: "delivery",
    status: "preparing",
    total: 1080,
    customer: "Hana M.",
    items: 5,
    paymentStatus: "paid",
  },
  {
    number: "#1023",
    method: "dine-in",
    status: "preparing",
    total: 480,
    customer: "Table 2",
    items: 2,
    paymentStatus: "paid",
  },
  {
    number: "#1018",
    method: "takeaway",
    status: "ready",
    total: 300,
    customer: "Abel K.",
    items: 1,
    paymentStatus: "paid",
  },
  {
    number: "#1019",
    method: "delivery",
    status: "ready",
    total: 730,
    customer: "Meron G.",
    items: 3,
    paymentStatus: "failed",
  },
];

export const dashboardStats = [
  { label: "Today's Orders", value: "24" },
  { label: "Pending Orders", value: "6" },
  { label: "Completed Orders", value: "18" },
  { label: "Today's Revenue", value: "8,450 ETB" },
  { label: "Unavailable Products", value: "2" },
];

export const revenueByHour = [
  { hour: "09", revenue: 420 },
  { hour: "10", revenue: 680 },
  { hour: "11", revenue: 910 },
  { hour: "12", revenue: 1580 },
  { hour: "13", revenue: 1740 },
  { hour: "14", revenue: 1120 },
  { hour: "15", revenue: 860 },
  { hour: "16", revenue: 1140 },
];
