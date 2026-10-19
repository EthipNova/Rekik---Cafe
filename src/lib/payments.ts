import { supabase } from "@/lib/supabase";

export type PaymentStatus = "pending" | "paid" | "failed";
export type OrderMethod = "dine-in" | "takeaway" | "delivery";
export type OrderStatus =
  "received" | "confirmed" | "preparing" | "ready" | "out-for-delivery" | "delivered" | "completed";

export type PaymentProduct = {
  id: string;
  name: string;
  image_url: string | null;
  price?: number | null;
};

export type PaymentOrderItem = {
  id: string;
  order_id?: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  products?: PaymentProduct | null;
};

export type PaymentCustomer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
};

export type PaymentOrder = {
  id: string;
  order_number: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  method: OrderMethod;
  status: OrderStatus;
  table_number?: string | null;
  delivery_address?: string | null;
  subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
  customers?: PaymentCustomer | null;
  order_items?: PaymentOrderItem[];
};

export type PaymentProofRecord = {
  id: string;
  payment_id: string;
  order_id: string;
  submitted_by?: string | null;
  screenshot_path: string;
  submitted_amount: number;
  transaction_reference: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  signed_url?: string | null;
};

export type PaymentRecord = {
  id: string;
  order_id: string;
  method: string;
  status: PaymentStatus;
  amount: number;
  transaction_reference: string | null;
  paid_at: string | null;
  created_at: string;
  orders: PaymentOrder | null;
  payment_proofs?: PaymentProofRecord[];
};

export type PaymentSummaryMetrics = {
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
  pendingAmount: number;
  failedCount: number;
  failedAmount: number;
  pendingProofCount: number;
};

/**
 * Normalizes raw relational response from Supabase/PostgREST
 * to handle single-object or array relation shapes safely.
 */
function normalizePaymentRecord(raw: any): PaymentRecord {
  const orderRaw = Array.isArray(raw.orders) ? raw.orders[0] : raw.orders;
  let normalizedOrder: PaymentOrder | null = null;

  if (orderRaw) {
    const customerRaw = Array.isArray(orderRaw.customers)
      ? orderRaw.customers[0]
      : orderRaw.customers;

    const itemsRaw = Array.isArray(orderRaw.order_items) ? orderRaw.order_items : [];

    const normalizedItems: PaymentOrderItem[] = itemsRaw.map((item: any) => {
      const productRaw = Array.isArray(item.products) ? item.products[0] : item.products;
      return {
        id: item.id,
        order_id: item.order_id,
        product_id: item.product_id,
        name: item.name,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        line_total:
          Number(item.line_total) || (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
        products: productRaw
          ? {
              id: productRaw.id,
              name: productRaw.name,
              image_url: productRaw.image_url ?? null,
              price: Number(productRaw.price) || 0,
            }
          : null,
      };
    });

    normalizedOrder = {
      id: orderRaw.id,
      order_number: orderRaw.order_number || `#${orderRaw.id?.slice(0, 4) || ""}`,
      customer_id: orderRaw.customer_id ?? null,
      customer_name: orderRaw.customer_name || customerRaw?.name || "Guest diner",
      customer_phone: orderRaw.customer_phone || customerRaw?.phone || "",
      method: (orderRaw.method as OrderMethod) || "dine-in",
      status: (orderRaw.status as OrderStatus) || "received",
      table_number: orderRaw.table_number ?? null,
      delivery_address: orderRaw.delivery_address ?? null,
      subtotal: Number(orderRaw.subtotal) || 0,
      discount_amount: Number(orderRaw.discount_amount) || 0,
      delivery_fee: Number(orderRaw.delivery_fee) || 0,
      total_amount: Number(orderRaw.total_amount) || 0,
      created_at: orderRaw.created_at,
      updated_at: orderRaw.updated_at,
      customers: customerRaw
        ? {
            id: customerRaw.id,
            name: customerRaw.name,
            phone: customerRaw.phone,
            email: customerRaw.email ?? null,
          }
        : null,
      order_items: normalizedItems,
    };
  }

  const rawProofs = Array.isArray(raw.payment_proofs)
    ? raw.payment_proofs
    : raw.payment_proofs
      ? [raw.payment_proofs]
      : [];

  const normalizedProofs: PaymentProofRecord[] = rawProofs.map((proof: any) => ({
    id: proof.id,
    payment_id: proof.payment_id,
    order_id: proof.order_id,
    submitted_by: proof.submitted_by ?? null,
    screenshot_path: proof.screenshot_path,
    submitted_amount: Number(proof.submitted_amount) || 0,
    transaction_reference: proof.transaction_reference ?? null,
    status: (proof.status as "pending" | "approved" | "rejected") || "pending",
    rejection_reason: proof.rejection_reason ?? null,
    reviewed_by: proof.reviewed_by ?? null,
    submitted_at: proof.submitted_at,
    reviewed_at: proof.reviewed_at ?? null,
    signed_url: proof.signed_url ?? null,
  }));

  const primaryRef =
    raw.transaction_reference ??
    (normalizedProofs.length > 0 ? normalizedProofs[0]!.transaction_reference : null);

  return {
    id: raw.id,
    order_id: raw.order_id,
    method: raw.method || "Mobile Payment",
    status: (raw.status as PaymentStatus) || "pending",
    amount: Number(raw.amount) || 0,
    transaction_reference: primaryRef,
    paid_at: raw.paid_at ?? null,
    created_at: raw.created_at,
    orders: normalizedOrder,
    payment_proofs: normalizedProofs,
  };
}

/**
 * Fetches all payment records joined with their order, customer,
 * order_items, product details, and payment proofs.
 * Automatically generates temporary signed URLs for all storage screenshot paths.
 */
export async function fetchAdminPayments(): Promise<{
  data: PaymentRecord[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from("payments" as any)
      .select(
        `
        id,
        order_id,
        method,
        status,
        amount,
        transaction_reference,
        paid_at,
        created_at,
        payment_proofs (
          id,
          payment_id,
          order_id,
          submitted_by,
          screenshot_path,
          submitted_amount,
          transaction_reference,
          status,
          rejection_reason,
          reviewed_by,
          submitted_at,
          reviewed_at
        ),
        orders (
          id,
          order_number,
          customer_id,
          customer_name,
          customer_phone,
          method,
          status,
          table_number,
          delivery_address,
          subtotal,
          discount_amount,
          delivery_fee,
          total_amount,
          created_at,
          updated_at,
          customers (
            id,
            name,
            phone,
            email
          ),
          order_items (
            id,
            order_id,
            product_id,
            name,
            quantity,
            unit_price,
            line_total,
            products (
              id,
              name,
              image_url,
              price
            )
          )
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const records = (data || []).map(normalizePaymentRecord);

    // Collect distinct storage file paths for signed URL resolution
    const filePaths: string[] = [];
    for (const r of records) {
      for (const proof of r.payment_proofs || []) {
        if (
          proof.screenshot_path &&
          proof.screenshot_path !== "reference-only" &&
          !proof.screenshot_path.startsWith("http://") &&
          !proof.screenshot_path.startsWith("https://") &&
          !proof.screenshot_path.startsWith("data:")
        ) {
          const clean = proof.screenshot_path.replace(/^payment-proofs\//, "");
          if (!filePaths.includes(clean)) filePaths.push(clean);
        }
      }
    }

    if (filePaths.length > 0) {
      try {
        const { data: signedResults } = await supabase.storage
          .from("payment-proofs")
          .createSignedUrls(filePaths, 3600);

        if (Array.isArray(signedResults)) {
          const urlMap = new Map<string, string>();
          for (const s of signedResults) {
            if (s.path && s.signedUrl) {
              urlMap.set(s.path, s.signedUrl);
              urlMap.set(`payment-proofs/${s.path}`, s.signedUrl);
            }
          }

          for (const r of records) {
            for (const proof of r.payment_proofs || []) {
              const clean = proof.screenshot_path.replace(/^payment-proofs\//, "");
              const url = urlMap.get(clean) || urlMap.get(proof.screenshot_path);
              if (url) proof.signed_url = url;
            }
          }
        }
      } catch (signErr) {
        console.warn("[payments] Failed to create signed URLs for proofs:", signErr);
      }
    }

    return { data: records, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to fetch payments data"),
    };
  }
}

/**
 * Computes summary metrics directly from payment transaction records.
 * - Total Revenue: Sum of payments.amount ONLY where status === 'paid'
 * - Paid Transactions: Count of payments with status === 'paid'
 * - Pending Payments: Count & sum of payments with status === 'pending'
 * - Failed Transactions: Count & sum of payments with status === 'failed'
 * - Pending Proof Reviews: Count of payment proofs awaiting cashier approval
 */
export function calculatePaymentMetrics(payments: PaymentRecord[]): PaymentSummaryMetrics {
  const paidPayments = payments.filter((p) => p.status === "paid");
  const pendingPayments = payments.filter((p) => p.status === "pending");
  const failedPayments = payments.filter((p) => p.status === "failed");

  const totalRevenue = paidPayments.reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  const failedAmount = failedPayments.reduce((sum, p) => sum + p.amount, 0);

  let pendingProofCount = 0;
  for (const p of payments) {
    const hasPendingProof = (p.payment_proofs || []).some((proof) => proof.status === "pending");
    if (hasPendingProof) pendingProofCount++;
  }

  return {
    totalRevenue,
    paidCount: paidPayments.length,
    pendingCount: pendingPayments.length,
    pendingAmount,
    failedCount: failedPayments.length,
    failedAmount,
    pendingProofCount,
  };
}

/**
 * Cashier / Reception action to approve a payment proof.
 */
export async function approveCashierPayment(input: {
  paymentProofId?: string;
  paymentId?: string;
  orderId?: string;
  note?: string;
}): Promise<{ success: boolean; message?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {}

  const res = await fetch("/api/payment-proofs/approve", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Failed to approve payment");
  }

  return res.json();
}

/**
 * Cashier / Reception action to reject a payment proof with mandatory reason.
 */
export async function rejectCashierPayment(input: {
  paymentProofId?: string;
  paymentId?: string;
  orderId?: string;
  reason: string;
}): Promise<{ success: boolean; message?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {}

  const res = await fetch("/api/payment-proofs/reject", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Failed to reject payment");
  }

  return res.json();
}

/**
 * Cashier / Reception action to mark cash / in-person payment as settled.
 */
export async function settleCashPayment(input: {
  paymentId?: string;
  orderId?: string;
  note?: string;
}): Promise<{ success: boolean; message?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {}

  const res = await fetch("/api/payment-proofs/cash-settle", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Failed to settle cash payment");
  }

  return res.json();
}
