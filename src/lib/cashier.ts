export type CashierRole = "cashier" | "admin" | "waiter";

export interface CashierStaffProfile {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: CashierRole;
  is_available: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewOrderItem {
  id: string;
  product_id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface PendingPaymentReviewItem {
  proof_id: string;
  payment_id: string;
  order_id: string;
  order_number: string;
  order_reference?: string | null;
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  table_number?: string | null;
  delivery_address?: string | null;
  customer_notes?: string | null;
  order_method: string;
  order_status: string;
  order_created_at: string;
  order_total: number;
  subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  payment_amount: number;
  payment_method: string;
  payment_status: string;
  transaction_reference?: string | null;
  proof_screenshot_path: string;
  proof_submitted_amount: number;
  proof_status: "pending" | "approved" | "rejected";
  proof_submitted_at: string;
  waiter_id?: string | null;
  waiter_decision?: string | null;
  waiter_decided_at?: string | null;
  waiter_rejection_reason?: string | null;
  items: ReviewOrderItem[];
}

export interface PaymentReviewHistoryItem {
  review_id: string;
  proof_id: string;
  payment_id: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone?: string | null | undefined;
  payment_amount: number;
  payment_method: string;
  decision: "approved" | "rejected";
  reason?: string | null | undefined;
  cashier_id: string;
  cashier_name: string;
  reviewed_at: string;
  screenshot_path: string;
  order_created_at?: string | undefined;
  items_summary?: string | undefined;
}

export interface CashierOverviewMetrics {
  pendingCount: number;
  pendingAmount: number;
  todayVerifiedCount: number;
  todayVerifiedAmount: number;
  totalVerifiedCount: number;
  totalVerifiedAmount: number;
  rejectedCount: number;
}

export interface CashierNotification {
  id: string;
  recipient_user_id: string;
  order_id?: string | null;
  payment_proof_id?: string | null;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}
