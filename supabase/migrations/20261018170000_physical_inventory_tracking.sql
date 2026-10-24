-- ============================================================================
-- Rekik Café — Category 4: Physical Inventory & Stock Monitoring System
-- File: supabase/migrations/20261018170000_physical_inventory_tracking.sql
-- ============================================================================
-- Safe, non-destructive, forward migration to establish:
-- 1. Physical stock tracking attributes on public.products (nullable quantities)
-- 2. Protection of public.products via Row-Level Security
-- 3. Optional global low-stock threshold on public.store_settings
-- 4. Append-only stock movement ledger (public.stock_movements)
-- 5. Trusted helper functions and least-privilege RLS policies
-- 6. Atomic, serialized mutation RPCs with negative-stock prevention
-- 7. Idempotent order stock consumption and restoration functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend public.products with Physical Inventory Columns
-- ----------------------------------------------------------------------------
-- Existing products preserve all columns and data.
-- stock_quantity is NULL by default until an authorized opening count is recorded.
-- A NULL stock_quantity explicitly denotes uninitialized/untracked inventory,
-- NEVER an invented or confirmed zero count.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_inventory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stock_unit text NOT NULL DEFAULT 'portion',
  ADD COLUMN IF NOT EXISTS min_stock_threshold numeric DEFAULT NULL;

COMMENT ON COLUMN public.products.track_inventory IS 'Flag indicating whether physical stock tracking is enabled for this product.';
COMMENT ON COLUMN public.products.stock_quantity IS 'Authoritative physical on-hand quantity. NULL indicates no opening count has been entered yet.';
COMMENT ON COLUMN public.products.stock_unit IS 'Standardized unit of measure (e.g., portion, unit, kg, g, liter, ml, bottle, can, cup, pack).';
COMMENT ON COLUMN public.products.min_stock_threshold IS 'Optional product-specific low stock alert threshold. Overrides global store setting when populated.';

-- Non-negative quantity and threshold constraints
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS check_products_stock_quantity_non_negative;
ALTER TABLE public.products
  ADD CONSTRAINT check_products_stock_quantity_non_negative
  CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS check_products_min_threshold_non_negative;
ALTER TABLE public.products
  ADD CONSTRAINT check_products_min_threshold_non_negative
  CHECK (min_stock_threshold IS NULL OR min_stock_threshold >= 0);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS check_products_stock_unit_valid;
ALTER TABLE public.products
  ADD CONSTRAINT check_products_stock_unit_valid
  CHECK (stock_unit IN ('portion', 'unit', 'kg', 'g', 'liter', 'ml', 'bottle', 'can', 'cup', 'pack'));

-- ----------------------------------------------------------------------------
-- 2. Secure public.products with Row-Level Security (RLS)
-- ----------------------------------------------------------------------------
-- Diners can view products for ordering, but direct updates to prices,
-- availability, and physical stock quantities are restricted to authorized staff.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view products" ON public.products;
CREATE POLICY "Public can view products"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff can manage products" ON public.products;
CREATE POLICY "Staff can manage products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ----------------------------------------------------------------------------
-- 3. Extend public.store_settings with Global Low Stock Threshold
-- ----------------------------------------------------------------------------
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS default_low_stock_threshold numeric DEFAULT 10;

COMMENT ON COLUMN public.store_settings.default_low_stock_threshold IS 'Fallback low-stock alert threshold when a tracked product does not specify min_stock_threshold.';

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS check_store_low_stock_threshold;
ALTER TABLE public.store_settings
  ADD CONSTRAINT check_store_low_stock_threshold
  CHECK (default_low_stock_threshold IS NULL OR default_low_stock_threshold >= 0);

-- ----------------------------------------------------------------------------
-- 4. Create public.stock_movements Ledger Table
-- ----------------------------------------------------------------------------
-- Strict append-only ledger.
-- product_id references products(id) ON DELETE RESTRICT to guarantee audit
-- integrity; historical movements can never be cascade-deleted.
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type text NOT NULL,
  quantity_change numeric NOT NULL,
  previous_quantity numeric DEFAULT NULL,
  new_quantity numeric NOT NULL,
  reference_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text DEFAULT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stock_movements IS 'Immutable audit ledger of all physical stock movements, receipts, consumptions, and manual adjustments.';

-- Constraints on stock_movements
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS check_stock_movements_type_valid;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT check_stock_movements_type_valid
  CHECK (movement_type IN (
    'opening',
    'purchase',
    'adjustment',
    'waste',
    'order_consumption',
    'order_cancellation_restoration'
  ));

-- Quantity change must be non-zero for adjustments, purchases, and waste.
-- Opening count of 0 is permitted when establishing an initial zero balance.
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS check_stock_movements_quantity_non_zero;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT check_stock_movements_quantity_non_zero
  CHECK (quantity_change != 0 OR movement_type = 'opening');

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS check_stock_movements_new_qty_non_negative;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT check_stock_movements_new_qty_non_negative
  CHECK (new_quantity >= 0);

-- Indexes for product history, chronological audit, and order idempotency
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_chronological
  ON public.stock_movements(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at
  ON public.stock_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_order_lookup
  ON public.stock_movements(reference_order_id)
  WHERE reference_order_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. Role Authorization Helper Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_inventory_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Service role and superuser processes are authorized
  IF (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role')
     OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
     OR (current_user IN ('postgres', 'service_role')) THEN
    RETURN true;
  END IF;

  -- 2. Authenticated user must have ADMIN role in public.users OR
  -- active role of 'admin', 'owner', or 'manager' in public.staff_profiles
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'ADMIN'::public.user_role
  ) OR EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE user_id = auth.uid()
      AND is_active = true
      AND LOWER(role) IN ('admin', 'owner', 'manager')
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Row-Level Security & Direct Table Privileges on stock_movements
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read stock movements" ON public.stock_movements;
CREATE POLICY "Staff can read stock movements"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

-- Critical: Revoke direct writes from clients to ensure movements can ONLY be
-- created through the trusted, serialized RPC functions below.
REVOKE INSERT, UPDATE, DELETE ON public.stock_movements FROM anon, authenticated;
GRANT SELECT ON public.stock_movements TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Atomic Stock Mutation RPC (record_stock_mutation)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_stock_mutation(
  p_product_id uuid,
  p_movement_type text,
  p_quantity_change numeric,
  p_notes text DEFAULT NULL,
  p_reference_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_product record;
  v_prev_qty numeric;
  v_new_qty numeric;
  v_movement_id uuid;
BEGIN
  v_caller_id := auth.uid();

  -- 1. Authenticate and authorize caller
  IF NOT public.is_inventory_manager() THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized inventory managers can perform stock adjustments';
  END IF;

  -- 2. Validate requested operation
  IF p_movement_type NOT IN ('opening', 'purchase', 'adjustment', 'waste', 'order_consumption', 'order_cancellation_restoration') THEN
    RAISE EXCEPTION 'Invalid stock movement type: %', p_movement_type;
  END IF;

  IF p_movement_type = 'opening' THEN
    IF p_quantity_change IS NULL OR p_quantity_change < 0 THEN
      RAISE EXCEPTION 'Opening stock quantity must be non-negative (received: %)', p_quantity_change;
    END IF;
  ELSE
    IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN
      RAISE EXCEPTION 'Stock quantity change cannot be null or zero';
    END IF;
  END IF;

  -- 3. Lock product row to serialize concurrent changes
  SELECT id, name, stock_quantity, track_inventory, stock_unit
  INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with ID % not found', p_product_id;
  END IF;

  -- 4. Verify tracking is enabled
  IF NOT COALESCE(v_product.track_inventory, false) THEN
    RAISE EXCEPTION 'Inventory tracking is disabled for product "%". Enable tracking before recording stock.', v_product.name;
  END IF;

  -- 5. Opening stock versus subsequent adjustments
  IF p_movement_type = 'opening' THEN
    IF v_product.stock_quantity IS NOT NULL THEN
      RAISE EXCEPTION 'Opening stock has already been recorded for product "%" (current on-hand: % %). Use adjustment or purchase instead.',
        v_product.name, v_product.stock_quantity, v_product.stock_unit;
    END IF;

    v_prev_qty := NULL;
    v_new_qty := p_quantity_change;
  ELSE
    IF v_product.stock_quantity IS NULL THEN
      RAISE EXCEPTION 'Opening stock has not been initialized for product "%". Please record an opening count first.',
        v_product.name;
    END IF;

    v_prev_qty := v_product.stock_quantity;
    v_new_qty := v_prev_qty + p_quantity_change;

    -- Prevent negative stock
    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product "%": current on-hand is %, requested change is % (resulting quantity % is negative)',
        v_product.name, v_prev_qty, p_quantity_change, v_new_qty;
    END IF;
  END IF;

  -- 6. Atomically update product stock
  UPDATE public.products
  SET stock_quantity = v_new_qty,
      updated_at = now()
  WHERE id = p_product_id;

  -- 7. Atomically record movement in audit ledger
  INSERT INTO public.stock_movements (
    id,
    product_id,
    movement_type,
    quantity_change,
    previous_quantity,
    new_quantity,
    reference_order_id,
    notes,
    actor_id,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_product_id,
    p_movement_type,
    p_quantity_change,
    v_prev_qty,
    v_new_qty,
    p_reference_order_id,
    p_notes,
    v_caller_id,
    now()
  ) RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'product_id', p_product_id,
    'movement_type', p_movement_type,
    'quantity_change', p_quantity_change,
    'previous_quantity', v_prev_qty,
    'new_quantity', v_new_qty
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Configure Product Inventory Tracking RPC (configure_product_inventory)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.configure_product_inventory(
  p_product_id uuid,
  p_track_inventory boolean,
  p_stock_unit text DEFAULT 'portion',
  p_min_stock_threshold numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_inventory_manager() THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized inventory managers can configure inventory tracking';
  END IF;

  IF p_stock_unit NOT IN ('portion', 'unit', 'kg', 'g', 'liter', 'ml', 'bottle', 'can', 'cup', 'pack') THEN
    RAISE EXCEPTION 'Invalid stock unit: %', p_stock_unit;
  END IF;

  IF p_min_stock_threshold IS NOT NULL AND p_min_stock_threshold < 0 THEN
    RAISE EXCEPTION 'Minimum stock threshold cannot be negative: %', p_min_stock_threshold;
  END IF;

  UPDATE public.products
  SET track_inventory = p_track_inventory,
      stock_unit = COALESCE(p_stock_unit, stock_unit, 'portion'),
      min_stock_threshold = p_min_stock_threshold,
      updated_at = now()
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with ID % not found', p_product_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'track_inventory', p_track_inventory,
    'stock_unit', p_stock_unit,
    'min_stock_threshold', p_min_stock_threshold
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Order Stock Consumption & Restoration RPCs (Safety-Gated)
-- ----------------------------------------------------------------------------
-- Authoritative order consumption event: Transitions to 'payment_verified'.
-- Idempotency: Checks idx_stock_movements_order_lookup; will not re-deduct
-- if a movement for this order already exists.
CREATE OR REPLACE FUNCTION public.deduct_order_inventory(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order record;
  v_item record;
  v_prod record;
  v_prev_qty numeric;
  v_new_qty numeric;
  v_deducted_count integer := 0;
BEGIN
  -- 1. Caller authorization check
  IF NOT (
    public.is_admin_or_staff()
    OR (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role')
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (current_user IN ('postgres', 'service_role'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only staff or system processes can deduct order stock';
  END IF;

  -- 2. Check idempotency: If already deducted, return gracefully
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_order_id = p_order_id
      AND movement_type = 'order_consumption'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_deducted',
      'message', 'Stock for this order has already been deducted'
    );
  END IF;

  -- 3. Verify order exists and is in an authoritative consumption status
  SELECT id, status INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.status NOT IN ('payment_verified', 'confirmed', 'preparing', 'ready', 'completed') THEN
    RAISE EXCEPTION 'Cannot deduct stock: Order % is in non-consumable status "%"', p_order_id, v_order.status;
  END IF;

  -- 4. Iterate over order items for tracked products
  FOR v_item IN
    SELECT product_id, quantity, name
    FROM public.order_items
    WHERE order_id = p_order_id
      AND product_id IS NOT NULL
      AND quantity > 0
  LOOP
    -- Lock product row
    SELECT id, name, stock_quantity, track_inventory
    INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF FOUND AND COALESCE(v_prod.track_inventory, false) AND v_prod.stock_quantity IS NOT NULL THEN
      v_prev_qty := v_prod.stock_quantity;
      v_new_qty := v_prev_qty - v_item.quantity;

      IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'Cannot complete order: Insufficient stock for product "%" (available: %, required: %)',
          v_prod.name, v_prev_qty, v_item.quantity;
      END IF;

      -- Update product stock
      UPDATE public.products
      SET stock_quantity = v_new_qty,
          updated_at = now()
      WHERE id = v_prod.id;

      -- Record consumption movement
      INSERT INTO public.stock_movements (
        id,
        product_id,
        movement_type,
        quantity_change,
        previous_quantity,
        new_quantity,
        reference_order_id,
        notes,
        actor_id,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_prod.id,
        'order_consumption',
        -v_item.quantity,
        v_prev_qty,
        v_new_qty,
        p_order_id,
        'Order consumption for order ' || p_order_id::text,
        auth.uid(),
        now()
      );

      v_deducted_count := v_deducted_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'deducted',
    'items_deducted', v_deducted_count
  );
END;
$$;

-- Compensating restoration function for cancelled or refunded orders
CREATE OR REPLACE FUNCTION public.restore_order_inventory(
  p_order_id uuid,
  p_reason text DEFAULT 'Order cancelled or rejected'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mov record;
  v_prod record;
  v_restored_count integer := 0;
BEGIN
  -- 1. Caller authorization check
  IF NOT (
    public.is_admin_or_staff()
    OR (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role')
    OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
    OR (current_user IN ('postgres', 'service_role'))
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only staff or system processes can restore order stock';
  END IF;

  -- 2. Check if already restored
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_order_id = p_order_id
      AND movement_type = 'order_cancellation_restoration'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_restored',
      'message', 'Stock for this order has already been restored'
    );
  END IF;

  -- 3. Iterate through previous consumption movements for this order
  FOR v_mov IN
    SELECT product_id, quantity_change
    FROM public.stock_movements
    WHERE reference_order_id = p_order_id
      AND movement_type = 'order_consumption'
  LOOP
    SELECT id, name, stock_quantity INTO v_prod
    FROM public.products
    WHERE id = v_mov.product_id
    FOR UPDATE;

    IF FOUND AND v_prod.stock_quantity IS NOT NULL THEN
      UPDATE public.products
      SET stock_quantity = v_prod.stock_quantity + ABS(v_mov.quantity_change),
          updated_at = now()
      WHERE id = v_prod.id;

      INSERT INTO public.stock_movements (
        id,
        product_id,
        movement_type,
        quantity_change,
        previous_quantity,
        new_quantity,
        reference_order_id,
        notes,
        actor_id,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_prod.id,
        'order_cancellation_restoration',
        ABS(v_mov.quantity_change),
        v_prod.stock_quantity,
        v_prod.stock_quantity + ABS(v_mov.quantity_change),
        p_order_id,
        COALESCE(p_reason, 'Restoration on cancellation/refund'),
        auth.uid(),
        now()
      );

      v_restored_count := v_restored_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'restored',
    'items_restored', v_restored_count
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Grant Function Execution Privileges
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.is_inventory_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_mutation(uuid, text, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_product_inventory(uuid, boolean, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_order_inventory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_inventory(uuid, text) TO authenticated;
