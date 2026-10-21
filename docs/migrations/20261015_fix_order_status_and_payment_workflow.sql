-- ==============================================================================
-- GURSHA CAFE: FIX ORDER STATUS WORKFLOW AND PAYMENT VERIFICATION
-- File: supabase/migrations/20261015_fix_order_status_and_payment_workflow.sql
-- ==============================================================================
-- 1. Standardize proof_status values to ('none', 'pending', 'approved', 'rejected')
-- 2. Decouple payment approval from order acceptance in admin_approve_payment_proof
-- 3. Enforce strict transition rules in admin_update_order_status:
--    - Non-delivery orders cannot be marked as dispatched (Out for delivery)
--    - Electronic payment orders cannot be accepted/processed without approved payment
--    - Completed and cancelled orders are terminal
-- ==============================================================================

-- 1. Backfill legacy proof_status values
UPDATE public.orders SET proof_status = 'approved' WHERE proof_status = 'verified';
UPDATE public.orders SET proof_status = 'pending' WHERE proof_status = 'pending_verification';

-- 2. Customer / Guest Payment Proof Submission (ensures proof_status is 'pending')
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
  p_code text,
  p_token text,
  p_image text,
  p_note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_current_user uuid;
  v_current_status text;
  v_current_proof_status text;
BEGIN
  v_current_user := auth.uid();

  -- Image validation & size check (max 5MB binary / 7.5MB text)
  IF p_image IS NULL OR trim(p_image) = '' THEN
    RAISE EXCEPTION 'Payment proof image is required';
  END IF;

  IF octet_length(p_image) > 7500000 THEN
    RAISE EXCEPTION 'Payment proof image exceeds maximum allowed size of 5MB';
  END IF;

  IF p_image NOT LIKE 'data:image/%' AND p_image NOT LIKE 'http://%' AND p_image NOT LIKE 'https://%' AND p_image NOT LIKE 'payment-proofs/%' THEN
    RAISE EXCEPTION 'Invalid payment proof image format. Must be an image data URL or valid image reference';
  END IF;

  -- Locate order and verify caller authorization:
  SELECT id, status, proof_status INTO v_order_id, v_current_status, v_current_proof_status
  FROM public.orders
  WHERE code = trim(p_code)
    AND (
      (v_current_user IS NOT NULL AND user_id = v_current_user)
      OR (p_token IS NOT NULL AND length(trim(p_token)) >= 16 AND guest_lookup_token = trim(p_token))
      OR (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = v_current_user))
    );

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Order not found or unauthorized to submit payment proof';
  END IF;

  -- Enforce permitted order statuses before accepting proof
  IF v_current_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot submit payment proof for % order', v_current_status;
  END IF;

  IF v_current_proof_status IN ('approved', 'verified') THEN
    RAISE EXCEPTION 'Payment proof has already been verified for this order';
  END IF;

  IF v_current_status NOT IN ('payment_pending', 'placed', 'pending') THEN
    RAISE EXCEPTION 'Payment proof cannot be submitted for order in state "%"', v_current_status;
  END IF;

  -- Update strictly customer-permitted fields
  UPDATE public.orders
  SET proof_image = p_image,
      proof_note = coalesce(trim(p_note), proof_note),
      proof_status = 'pending'
  WHERE id = v_order_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_payment_proof(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(text, text, text, text) TO anon, authenticated, service_role;

-- Backward-compatible wrapper
CREATE OR REPLACE FUNCTION public.submit_guest_payment_proof(
  p_code text,
  p_token text,
  p_image text,
  p_note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.submit_payment_proof(p_code, p_token, p_image, p_note);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_guest_payment_proof(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_guest_payment_proof(text, text, text, text) TO anon, authenticated, service_role;

-- 3. Administrator Payment Proof Approval (Decoupled from order acceptance)
CREATE OR REPLACE FUNCTION public.admin_approve_payment_proof(
  p_code text,
  p_staff_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proof_image text;
  v_current_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: administrator privilege required';
  END IF;

  SELECT proof_image, status INTO v_proof_image, v_current_status
  FROM public.orders
  WHERE code = trim(p_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_code;
  END IF;

  IF v_proof_image IS NULL OR trim(v_proof_image) = '' THEN
    RAISE EXCEPTION 'Cannot approve order %: no payment proof image has been submitted', p_code;
  END IF;

  -- Approve payment proof WITHOUT changing order status
  UPDATE public.orders
  SET proof_status = 'approved',
      staff_note = coalesce(p_staff_note, staff_note)
  WHERE code = trim(p_code);

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_payment_proof(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_proof(text, text) TO authenticated, service_role;

-- 4. Administrator Payment Proof Rejection
CREATE OR REPLACE FUNCTION public.admin_reject_payment_proof(
  p_code text,
  p_staff_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: administrator privilege required';
  END IF;

  UPDATE public.orders
  SET proof_status = 'rejected',
      staff_note = coalesce(p_staff_note, staff_note)
  WHERE code = trim(p_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_code;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reject_payment_proof(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_proof(text, text) TO authenticated, service_role;

-- 5. Administrator Order Status Transition
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_code text,
  p_status text,
  p_staff_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status text;
  v_service_type text;
  v_payment_method text;
  v_proof_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: administrator privilege required';
  END IF;

  p_status := lower(trim(p_status));
  IF p_status IN ('out for delivery', 'out_for_delivery', 'on the way') THEN
    p_status := 'dispatched';
  ELSIF p_status IN ('ready for pickup', 'ready_for_pickup') THEN
    p_status := 'ready';
  END IF;

  IF p_status NOT IN ('placed', 'payment_pending', 'accepted', 'preparing', 'ready', 'dispatched', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid order status: %', p_status;
  END IF;

  SELECT status, service_type, payment_method, proof_status 
  INTO v_current_status, v_service_type, v_payment_method, v_proof_status
  FROM public.orders
  WHERE code = trim(p_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_code;
  END IF;

  IF v_current_status = 'cancelled' AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cannot modify status of cancelled order %', p_code;
  END IF;

  IF v_current_status = 'completed' AND p_status NOT IN ('completed') THEN
    RAISE EXCEPTION 'Cannot modify status of completed order %', p_code;
  END IF;

  -- Non-delivery orders cannot be set to 'dispatched'
  IF p_status = 'dispatched' AND v_service_type <> 'delivery' THEN
    RAISE EXCEPTION 'Out for delivery stage is only applicable to delivery orders. This is a % order.', v_service_type;
  END IF;

  -- Electronic payment orders cannot move to kitchen stages without verified payment
  IF p_status IN ('accepted', 'preparing', 'ready', 'dispatched', 'completed')
     AND v_payment_method <> 'cash'
     AND v_proof_status NOT IN ('approved', 'verified') THEN
    RAISE EXCEPTION 'Cannot set status to "%": Payment proof must be approved first for % payment', p_status, v_payment_method;
  END IF;

  UPDATE public.orders
  SET status = p_status,
      staff_note = coalesce(p_staff_note, staff_note)
  WHERE code = trim(p_code);

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_order_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(text, text, text) TO authenticated, service_role;
