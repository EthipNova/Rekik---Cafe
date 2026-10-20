/**
 * ============================================================================
 * NEBA Café — Waiter System Types (src/types/waiter.ts)
 * ============================================================================
 * Strict types representing the waiter database schema and dashboard state.
 */

export type StaffRole = "waiter" | "cashier" | "admin";

export type OrderDbStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "completed"
  | "cancelled"
  | "rejected";

export type WaiterDecision = "pending" | "approved" | "rejected";

export type OrderDbMethod = "dine_in" | "pickup" | "delivery";

export type PaymentDbStatus = "pending" | "paid" | "failed" | "refunded";

export type PaymentProofDbStatus = "pending" | "approved" | "rejected";

export interface WaiterProfile {
  userId: string;
  fullName: string;
  phone: string | null;
  role: StaffRole;
  isAvailable: boolean;
  isActive: boolean;
  email?: string | undefined;
  createdAt?: string | undefined;
}

export interface WaiterOrderItem {
  id?: string | undefined;
  productId?: string | null | undefined;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface WaiterOrderApproval {
  id?: string | undefined;
  orderId: string;
  waiterId: string;
  decision: "approved" | "rejected";
  comments: string | null;
  decidedAt: string;
}

export interface WaiterStatusLog {
  id?: string | undefined;
  orderId: string;
  fromStatus?: string | null | undefined;
  toStatus: string;
  changedBy?: string | null | undefined;
  notes?: string | null | undefined;
  createdAt: string;
}

export interface WaiterPaymentProof {
  id: string;
  paymentId: string;
  orderId: string;
  screenshotPath: string;
  submittedAmount: number;
  transactionReference?: string | null | undefined;
  status: PaymentProofDbStatus;
  rejectionReason?: string | null | undefined;
  reviewedBy?: string | null | undefined;
  submittedAt: string;
  reviewedAt?: string | null | undefined;
}

export interface WaiterPayment {
  id: string;
  orderId: string;
  method: string;
  status: PaymentDbStatus;
  amount: number;
  transactionReference?: string | null | undefined;
  paidAt?: string | null | undefined;
  proof?: WaiterPaymentProof | null | undefined;
}

export interface WaiterOrder {
  id: string;
  orderNumber: string;
  orderReference: string | null;
  customerId?: string | null | undefined;
  waiterId?: string | null | undefined;
  method: OrderDbMethod;
  status: OrderDbStatus;
  waiterDecision: WaiterDecision;
  customerName: string;
  customerPhone: string | null;
  tableNumber: string | null;
  deliveryAddress: string | null;
  customerNotes: string | null;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  totalAmount: number;
  waiterAssignedAt?: string | null | undefined;
  waiterDecidedAt?: string | null | undefined;
  waiterRejectionReason?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
  items: WaiterOrderItem[];
  payments?: WaiterPayment[] | undefined;
  approvals?: WaiterOrderApproval[] | undefined;
  statusLogs?: WaiterStatusLog[] | undefined;
}

export interface WaiterNotification {
  id: string;
  recipientUserId: string;
  orderId?: string | null | undefined;
  paymentProofId?: string | null | undefined;
  title: string;
  message: string;
  notificationType: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null | undefined;
  order?: {
    orderNumber: string;
    totalAmount: number;
  } | null | undefined;
}

export interface WaiterMetrics {
  pendingReview: number;
  approvedToday: number;
  awaitingPayment: number;
  underCashierReview: number;
  completedToday: number;
  rejectedTotal: number;
  todayTotalRevenue: number;
  totalAssignedActive: number;
}
