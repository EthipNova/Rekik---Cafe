import fs from "node:fs";
import path from "node:path";
import { serverSupabase } from "../src/server/supabase";

async function main() {
  console.log("Seeding test cashier and orders...");

  // 1. Ensure Cashier user exists in auth.users and staff_profiles
  const cashierId = "5d2b434b-0b18-461b-a12d-9a93ac8fc92a";
  await serverSupabase.auth.admin.updateUserById(cashierId, {
    email: "cashier@rekikcafe.com",
    password: "Password123!",
    email_confirm: true,
    user_metadata: {
      full_name: "Rekik Cashier",
      role: "cashier"
    }
  });

  await serverSupabase.from("staff_profiles").upsert({
    user_id: cashierId,
    full_name: "Rekik Cashier",
    phone: "0911223344",
    role: "cashier",
    is_available: true,
    is_active: true,
    updated_at: new Date().toISOString()
  });

  console.log("Cashier profile verified: cashier@rekikcafe.com / Password123!");

  // 2. Upload sample proof screenshot to private bucket
  const sampleImagePath = path.resolve(process.cwd(), "public/images/secure-payments.png");
  const sampleBuffer = fs.readFileSync(sampleImagePath);

  await serverSupabase.storage
    .from("payment-proofs")
    .upload("proofs/proof-rk-101.png", sampleBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  await serverSupabase.storage
    .from("payment-proofs")
    .upload("proofs/proof-rk-102.png", sampleBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  await serverSupabase.storage
    .from("payment-proofs")
    .upload("proofs/proof-rk-103.png", sampleBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  console.log("Uploaded demo proof screenshots to payment-proofs bucket.");

  // Clean up any old demo review rows
  const demoProofIds = [
    "00000000-0000-0000-0000-000000003001",
    "00000000-0000-0000-0000-000000003002",
    "00000000-0000-0000-0000-000000003003",
  ];
  await serverSupabase.from("payment_reviews").delete().in("payment_proof_id", demoProofIds);
  await serverSupabase.from("payment_proofs").delete().in("id", demoProofIds);
  await serverSupabase.from("order_status_logs").delete().in("order_id", [
    "00000000-0000-0000-0000-000000001001",
    "00000000-0000-0000-0000-000000001002",
    "00000000-0000-0000-0000-000000001003",
  ]);
  await serverSupabase.from("audit_logs").delete().in("payment_proof_id", demoProofIds);
  await serverSupabase.from("notifications").delete().in("payment_proof_id", demoProofIds);

  // 3. Create Sample Customer
  const custId = "c1111111-1111-1111-1111-111111111111";
  await serverSupabase.from("customers").upsert({
    id: custId,
    name: "Almaz Kebede",
    phone: "0911556677",
    email: "almaz.kebede@example.com",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 4. Create Order 1: Awaiting Cashier Review (Pending)
  const order1Id = "00000000-0000-0000-0000-000000001001";
  const pay1Id = "00000000-0000-0000-0000-000000002001";
  const proof1Id = "00000000-0000-0000-0000-000000003001";

  await serverSupabase.from("orders").upsert({
    id: order1Id,
    order_number: "RK-1001",
    customer_id: custId,
    customer_name: "Almaz Kebede",
    customer_phone: "0911556677",
    method: "dine_in",
    status: "pending",
    waiter_decision: "approved",
    table_number: "Table 4",
    subtotal: 450,
    discount_amount: 0,
    delivery_fee: 0,
    total_amount: 450,
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
  });

  await serverSupabase.from("order_items").upsert([
    {
      id: "00000000-0000-0000-0000-000000004001",
      order_id: order1Id,
      name: "Rekik Signature Special Roast",
      quantity: 2,
      unit_price: 120,
      line_total: 240,
    },
    {
      id: "00000000-0000-0000-0000-000000004002",
      order_id: order1Id,
      name: "Classic Cheeseburger with Fries",
      quantity: 1,
      unit_price: 210,
      line_total: 210,
    },
  ]);

  await serverSupabase.from("payments").upsert({
    id: pay1Id,
    order_id: order1Id,
    method: "Telebirr",
    status: "pending",
    amount: 450,
    transaction_reference: "TLB-78239104",
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 60000).toISOString(),
  });

  await serverSupabase.from("payment_proofs").upsert({
    id: proof1Id,
    payment_id: pay1Id,
    order_id: order1Id,
    screenshot_path: "proofs/proof-rk-101.png",
    submitted_amount: 450,
    transaction_reference: "TLB-78239104",
    status: "pending",
    submitted_at: new Date(Date.now() - 10 * 60000).toISOString(),
  });

  // 5. Create Order 2: Another Awaiting Cashier Review (CBE Birr delivery)
  const order2Id = "00000000-0000-0000-0000-000000001002";
  const pay2Id = "00000000-0000-0000-0000-000000002002";
  const proof2Id = "00000000-0000-0000-0000-000000003002";

  await serverSupabase.from("orders").upsert({
    id: order2Id,
    order_number: "RK-1002",
    customer_name: "Dawit Haile",
    customer_phone: "0922334455",
    method: "delivery",
    status: "pending",
    waiter_decision: "approved",
    delivery_address: "Bole Medhanialem, Aberus Complex, 4th Floor",
    subtotal: 620,
    discount_amount: 0,
    delivery_fee: 50,
    total_amount: 670,
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60000).toISOString(),
  });

  await serverSupabase.from("order_items").upsert([
    {
      id: "00000000-0000-0000-0000-000000004003",
      order_id: order2Id,
      name: "Chicken Pizza (Large)",
      quantity: 1,
      unit_price: 480,
      line_total: 480,
    },
    {
      id: "00000000-0000-0000-0000-000000004004",
      order_id: order2Id,
      name: "Fresh Strawberry Smoothie",
      quantity: 2,
      unit_price: 70,
      line_total: 140,
    },
  ]);

  await serverSupabase.from("payments").upsert({
    id: pay2Id,
    order_id: order2Id,
    method: "CBE Birr",
    status: "pending",
    amount: 670,
    transaction_reference: "CBE-99482103",
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 25 * 60000).toISOString(),
  });

  await serverSupabase.from("payment_proofs").upsert({
    id: proof2Id,
    payment_id: pay2Id,
    order_id: order2Id,
    screenshot_path: "proofs/proof-rk-102.png",
    submitted_amount: 670,
    transaction_reference: "CBE-99482103",
    status: "pending",
    submitted_at: new Date(Date.now() - 25 * 60000).toISOString(),
  });

  // 6. Create Order 3: Previously Reviewed & Approved
  const order3Id = "00000000-0000-0000-0000-000000001003";
  const pay3Id = "00000000-0000-0000-0000-000000002003";
  const proof3Id = "00000000-0000-0000-0000-000000003003";
  const review3Id = "00000000-0000-0000-0000-000000005003";

  await serverSupabase.from("orders").upsert({
    id: order3Id,
    order_number: "RK-1000",
    customer_name: "Sara Tesfaye",
    customer_phone: "0933445566",
    method: "dine_in",
    status: "confirmed",
    waiter_decision: "approved",
    table_number: "Table 2",
    subtotal: 300,
    discount_amount: 0,
    delivery_fee: 0,
    total_amount: 300,
    created_at: new Date(Date.now() - 120 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 90 * 60000).toISOString(),
  });

  await serverSupabase.from("payments").upsert({
    id: pay3Id,
    order_id: order3Id,
    method: "Telebirr",
    status: "paid",
    amount: 300,
    transaction_reference: "TLB-11029384",
    paid_at: new Date(Date.now() - 90 * 60000).toISOString(),
    created_at: new Date(Date.now() - 100 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 90 * 60000).toISOString(),
  });

  await serverSupabase.from("payment_proofs").upsert({
    id: proof3Id,
    payment_id: pay3Id,
    order_id: order3Id,
    screenshot_path: "proofs/proof-rk-103.png",
    submitted_amount: 300,
    transaction_reference: "TLB-11029384",
    status: "approved",
    reviewed_by: cashierId,
    submitted_at: new Date(Date.now() - 100 * 60000).toISOString(),
    reviewed_at: new Date(Date.now() - 90 * 60000).toISOString(),
  });

  await serverSupabase.from("payment_reviews").upsert({
    id: review3Id,
    payment_proof_id: proof3Id,
    cashier_id: cashierId,
    decision: "approved",
    reason: "Verified via Telebirr SMS notification",
    reviewed_at: new Date(Date.now() - 90 * 60000).toISOString(),
  });

  // 7. Seed notification
  await serverSupabase.from("notifications").upsert({
    id: "00000000-0000-0000-0000-000000006001",
    recipient_user_id: cashierId,
    order_id: order1Id,
    payment_proof_id: proof1Id,
    title: "New Payment Proof Submitted",
    message: "Customer Almaz Kebede submitted a 450 ETB Telebirr payment proof for order RK-1001.",
    notification_type: "payment_proof_submitted",
    is_read: false,
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
  });

  console.log("Seeding complete! 2 pending reviews, 1 approved history, 1 notification seeded.");
}

main().catch(console.error);
