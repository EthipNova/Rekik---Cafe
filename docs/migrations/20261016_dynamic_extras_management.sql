-- ==============================================================================
-- GURSHA CAFE: DYNAMIC EXTRAS MANAGEMENT AND PRICE PERSISTENCE
-- File: supabase/migrations/20261016_dynamic_extras_management.sql
-- Target: Staging Supabase Project qwmgiamqheqadpyfrqvr
-- ==============================================================================
-- 1. Seeds default extras into public.store_settings (key = 'extras')
-- 2. Updates public.create_order to support dynamic, admin-configured extras:
--    - Single top-level DECLARE block (no nested DECLARE blocks)
--    - Upfront structural validation of store_settings "extras" configuration
--    - Upfront structural validation of store_settings "menu" configuration
--    - Strict menu precedence: store_settings.menu overrides public.menu_items
--    - Eliminates hardcoded food menu fallbacks so deleted items cannot be ordered
--    - Strict server-side extras pricing & case-insensitive duplicate rejection
--    - Rejection of disabled, missing, deleted, or empty extras
--    - Combined snapshot convention in order_items.extra_price
--    - Full baseline delivery, payment methods, ETA, and auth preservation
-- ==============================================================================

-- 1. Seed initial default extras into store_settings if not already present
INSERT INTO public.store_settings (key, value)
VALUES (
  'extras',
  '[
    {"id": "extra-injera", "name": "Extra injera", "price": 30, "enabled": true},
    {"id": "ayib-cheese", "name": "Ayib cheese", "price": 45, "enabled": true},
    {"id": "boiled-egg", "name": "Boiled egg", "price": 35, "enabled": true},
    {"id": "extra-awaze", "name": "Extra awaze", "price": 20, "enabled": true}
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 2. Update create_order to authoritatively read dynamic extras from store_settings
CREATE OR REPLACE FUNCTION public.create_order(
  p_order jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_guest_token text;
  v_order_id uuid;
  v_code text;
  v_customer_name text;
  v_phone text;
  v_service_type text;
  v_zone text;
  v_address text;
  v_payment_method text;
  v_scheduled_for timestamptz;
  v_status text;
  v_proof_status text;
  v_eta integer;
  v_distance_km numeric := 0;
  v_delivery_fee numeric := 0;
  v_subtotal numeric := 0;
  v_service_charge numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_item_id text;
  v_qty integer;
  v_base_choice text;
  v_base_extra numeric := 0;
  v_spice integer;
  v_extras text[];
  v_extras_seen text[];
  v_extra_elem text;
  v_extra_normalized text;
  v_extra_matched boolean;
  v_extra_price numeric := 0;
  v_matched_name text;
  v_matched_price numeric;
  v_matched_enabled boolean;
  v_note text;
  v_item_name text;
  v_base_price numeric;
  v_in_stock boolean;
  v_item_total numeric;
  v_attempts integer := 0;
  v_deliv_settings jsonb;
  v_dest jsonb;
  v_dest_matched boolean := false;
  v_dest_enabled boolean := true;
  v_custom_menu jsonb;
  v_menu_elem jsonb;
  v_extras_config jsonb;
  v_extra_obj jsonb;
  -- Top-level validation variables (replaces nested DECLARE blocks)
  v_cfg_seen_names text[];
  v_cfg_entry jsonb;
  v_cfg_name text;
  v_cfg_price numeric;
  v_menu_seen_ids text[];
  v_cfg_menu_entry jsonb;
  v_cfg_menu_id text;
  v_cfg_menu_price numeric;
BEGIN
  -- 1. Identity binding: user_id is strictly derived from session auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    v_guest_token := substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 48);
  ELSE
    v_guest_token := NULL;
  END IF;

  -- 2. Validate Order Header
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'Order payload must be a valid JSON object';
  END IF;

  v_customer_name := trim(coalesce(p_order->>'customer_name', ''));
  v_phone := trim(coalesce(p_order->>'phone', ''));
  v_service_type := lower(trim(coalesce(p_order->>'service_type', '')));
  v_payment_method := lower(trim(coalesce(p_order->>'payment_method', '')));
  v_zone := trim(coalesce(p_order->>'zone', ''));
  v_address := trim(coalesce(p_order->>'address', ''));

  IF char_length(v_customer_name) < 2 THEN
    RAISE EXCEPTION 'Customer name must be at least 2 characters';
  END IF;

  IF char_length(v_phone) < 7 THEN
    RAISE EXCEPTION 'A valid phone number is required';
  END IF;

  -- Normalize service type ('dine-in' or 'dine_in', 'takeaway' or 'pickup', 'delivery')
  IF v_service_type IN ('dine-in', 'dine_in') THEN
    v_service_type := 'dine-in';
  ELSIF v_service_type IN ('takeaway', 'pickup') THEN
    v_service_type := 'takeaway';
  ELSIF v_service_type = 'delivery' THEN
    v_service_type := 'delivery';
  ELSE
    RAISE EXCEPTION 'Invalid service type: %', v_service_type;
  END IF;

  -- Normalize payment method (supports all baseline payment methods)
  IF v_payment_method NOT IN ('cash', 'telebirr', 'cbe', 'boa', 'cbe_birr', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method: %', v_payment_method;
  END IF;

  -- Validate delivery constraints and compute verified delivery fee server-side
  IF v_service_type = 'delivery' THEN
    IF char_length(v_address) < 3 THEN
      RAISE EXCEPTION 'Delivery address is required for delivery orders';
    END IF;

    IF char_length(v_zone) = 0 THEN
      RAISE EXCEPTION 'Delivery destination/zone is required for delivery orders';
    END IF;

    -- Load authoritative delivery configuration from store_settings
    SELECT value INTO v_deliv_settings
    FROM public.store_settings
    WHERE key = 'delivery';

    IF v_deliv_settings IS NOT NULL AND (v_deliv_settings ? 'enabled') AND NOT (v_deliv_settings->>'enabled')::boolean THEN
      RAISE EXCEPTION 'Delivery service is currently disabled';
    END IF;

    IF v_deliv_settings IS NOT NULL AND (v_deliv_settings ? 'destinations') AND jsonb_typeof(v_deliv_settings->'destinations') = 'array' THEN
      FOR v_dest IN SELECT * FROM jsonb_array_elements(v_deliv_settings->'destinations')
      LOOP
        IF lower(v_dest->>'id') = lower(v_zone) OR lower(v_dest->>'name') = lower(v_zone) THEN
          v_dest_matched := true;
          v_dest_enabled := coalesce((v_dest->>'enabled')::boolean, true);
          v_distance_km := coalesce((v_dest->>'distanceKm')::numeric, 0);
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_dest_matched THEN
      RAISE EXCEPTION 'Unknown or invalid delivery zone: "%". Delivery is only available for supported destinations.', v_zone;
    END IF;

    IF NOT v_dest_enabled THEN
      RAISE EXCEPTION 'Delivery destination "%" is currently disabled', v_zone;
    END IF;

    IF v_distance_km < 0 THEN
      v_distance_km := 0;
    END IF;

    -- Server authoritative delivery fee formula: ETB 30 + (distance_km * 10)
    v_delivery_fee := 30 + (v_distance_km * 10);
  ELSE
    v_delivery_fee := 0;
    v_distance_km := 0;
  END IF;

  -- Validate optional scheduled time
  IF p_order ? 'scheduled_for' AND p_order->>'scheduled_for' IS NOT NULL AND p_order->>'scheduled_for' <> '' THEN
    BEGIN
      v_scheduled_for := (p_order->>'scheduled_for')::timestamptz;
      IF v_scheduled_for < now() - interval '5 minutes' THEN
        RAISE EXCEPTION 'Scheduled order time cannot be in the past';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_scheduled_for := NULL;
    END;
  ELSE
    v_scheduled_for := NULL;
  END IF;

  -- Determine initial status and ETA according to baseline
  v_status := CASE WHEN v_payment_method = 'cash' THEN 'placed' ELSE 'payment_pending' END;
  v_proof_status := 'none';
  v_eta := CASE v_service_type WHEN 'dine-in' THEN 20 WHEN 'takeaway' THEN 25 ELSE 40 END;

  -- Pre-load and rigorously validate authoritative configurations from store_settings
  SELECT value INTO v_extras_config
  FROM public.store_settings
  WHERE key = 'extras';

  IF v_extras_config IS NOT NULL THEN
    IF jsonb_typeof(v_extras_config) <> 'array' THEN
      RAISE EXCEPTION 'Store configuration error: "extras" setting must be a JSON array';
    END IF;

    v_cfg_seen_names := ARRAY[]::text[];
    FOR v_cfg_entry IN SELECT * FROM jsonb_array_elements(v_extras_config)
    LOOP
      IF jsonb_typeof(v_cfg_entry) <> 'object' THEN
        RAISE EXCEPTION 'Store configuration error: each entry in "extras" setting must be a JSON object';
      END IF;

      v_cfg_name := lower(trim(coalesce(v_cfg_entry->>'name', '')));
      IF v_cfg_name = '' THEN
        RAISE EXCEPTION 'Store configuration error: extra entry has an empty or missing name';
      END IF;

      IF v_cfg_name = ANY(v_cfg_seen_names) THEN
        RAISE EXCEPTION 'Store configuration error: duplicate extra name "%" found in settings', v_cfg_entry->>'name';
      END IF;
      v_cfg_seen_names := array_append(v_cfg_seen_names, v_cfg_name);

      IF v_cfg_entry->>'price' IS NULL OR trim(v_cfg_entry->>'price') = '' THEN
        RAISE EXCEPTION 'Store configuration error: extra "%" has a missing price', v_cfg_entry->>'name';
      END IF;

      BEGIN
        v_cfg_price := (v_cfg_entry->>'price')::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Store configuration error: extra "%" has an invalid numeric price "%"', v_cfg_entry->>'name', v_cfg_entry->>'price';
      END;

      IF v_cfg_price < 0 THEN
        RAISE EXCEPTION 'Store configuration error: extra "%" price cannot be negative (got %)', v_cfg_entry->>'name', v_cfg_price;
      END IF;

      IF v_cfg_entry ? 'enabled' AND jsonb_typeof(v_cfg_entry->'enabled') <> 'boolean' THEN
        RAISE EXCEPTION 'Store configuration error: extra "%" has an invalid enabled flag (expected boolean)', v_cfg_entry->>'name';
      END IF;
    END LOOP;
  END IF;

  SELECT value INTO v_custom_menu
  FROM public.store_settings
  WHERE key = 'menu';

  IF v_custom_menu IS NOT NULL THEN
    IF jsonb_typeof(v_custom_menu) <> 'array' THEN
      RAISE EXCEPTION 'Store configuration error: "menu" setting must be a JSON array';
    END IF;

    v_menu_seen_ids := ARRAY[]::text[];
    FOR v_cfg_menu_entry IN SELECT * FROM jsonb_array_elements(v_custom_menu)
    LOOP
      IF jsonb_typeof(v_cfg_menu_entry) <> 'object' THEN
        RAISE EXCEPTION 'Store configuration error: each entry in "menu" setting must be a JSON object';
      END IF;

      v_cfg_menu_id := lower(trim(coalesce(v_cfg_menu_entry->>'id', '')));
      IF v_cfg_menu_id = '' THEN
        RAISE EXCEPTION 'Store configuration error: menu entry has an empty or missing id';
      END IF;

      IF v_cfg_menu_id = ANY(v_menu_seen_ids) THEN
        RAISE EXCEPTION 'Store configuration error: duplicate menu id "%" found in settings', v_cfg_menu_entry->>'id';
      END IF;
      v_menu_seen_ids := array_append(v_menu_seen_ids, v_cfg_menu_id);

      IF trim(coalesce(v_cfg_menu_entry->>'name', '')) = '' THEN
        RAISE EXCEPTION 'Store configuration error: menu item "%" has an empty name', v_cfg_menu_id;
      END IF;

      IF v_cfg_menu_entry->>'price' IS NULL OR trim(v_cfg_menu_entry->>'price') = '' THEN
        RAISE EXCEPTION 'Store configuration error: menu item "%" has a missing price', v_cfg_menu_id;
      END IF;

      BEGIN
        v_cfg_menu_price := (v_cfg_menu_entry->>'price')::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Store configuration error: menu item "%" has an invalid numeric price "%"', v_cfg_menu_id, v_cfg_menu_entry->>'price';
      END;

      IF v_cfg_menu_price < 0 THEN
        RAISE EXCEPTION 'Store configuration error: menu item "%" price cannot be negative (got %)', v_cfg_menu_id, v_cfg_menu_price;
      END IF;

      IF v_cfg_menu_entry ? 'inStock' AND jsonb_typeof(v_cfg_menu_entry->'inStock') <> 'boolean' THEN
        RAISE EXCEPTION 'Store configuration error: menu item "%" has an invalid inStock flag (expected boolean)', v_cfg_menu_id;
      END IF;
    END LOOP;
  END IF;

  -- 3. Validate Items Array
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order exceeds maximum permitted item count (50)';
  END IF;

  -- 4. Create Order Header with Unique 4-character Code (GR-XXXX)
  v_order_id := gen_random_uuid();
  v_attempts := 0;

  LOOP
    v_code := 'GR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    BEGIN
      INSERT INTO public.orders (
        id,
        code,
        user_id,
        guest_lookup_token,
        customer_name,
        phone,
        service_type,
        zone,
        distance_km,
        address,
        subtotal,
        delivery_fee,
        service_charge,
        total,
        payment_method,
        proof_status,
        proof_image,
        proof_note,
        status,
        eta,
        scheduled_for,
        created_at
      ) VALUES (
        v_order_id,
        v_code,
        v_user_id,
        v_guest_token,
        v_customer_name,
        v_phone,
        v_service_type,
        v_zone,
        v_distance_km,
        v_address,
        0,
        0,
        0,
        0,
        v_payment_method,
        'none',
        '',
        '',
        v_status,
        v_eta,
        v_scheduled_for,
        now()
      );
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts > 20 THEN
        RAISE EXCEPTION 'Could not generate unique order code after 20 attempts';
      END IF;
    END;
  END LOOP;

  -- Process and insert each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item IS NULL OR jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Each item in order items must be a valid JSON object';
    END IF;

    v_item_id := trim(coalesce(v_item->>'menu_item_id', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    IF v_qty <= 0 OR v_qty > 100 THEN
      RAISE EXCEPTION 'Invalid quantity for item %: % (must be 1-100)', coalesce(v_item_id, 'unknown'), v_qty;
    END IF;

    -- Look up price: 1) store_settings custom menu, 2) authoritative menu_items catalog table
    v_base_price := NULL;
    v_item_name := NULL;
    v_in_stock := true;

    -- Check custom menu in store_settings first (admin-configured overrides)
    IF v_custom_menu IS NOT NULL THEN
      FOR v_menu_elem IN SELECT * FROM jsonb_array_elements(v_custom_menu)
      LOOP
        IF lower(trim(coalesce(v_menu_elem->>'id', ''))) = lower(v_item_id) THEN
          v_item_name := trim(v_menu_elem->>'name');
          v_base_price := (v_menu_elem->>'price')::numeric;
          v_in_stock := coalesce((v_menu_elem->>'inStock')::boolean, true);
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- If not found in custom menu, check authoritative menu_items catalog table
    IF v_base_price IS NULL THEN
      SELECT name, price, in_stock INTO v_item_name, v_base_price, v_in_stock
      FROM public.menu_items
      WHERE lower(id) = lower(v_item_id);
    END IF;

    -- Reject unknown, uncatalogued, or deleted items (strictly prevents ordering deleted items)
    IF v_base_price IS NULL OR v_item_name IS NULL THEN
      RAISE EXCEPTION 'Invalid or unknown menu item: %', v_item_id;
    END IF;

    IF NOT v_in_stock THEN
      RAISE EXCEPTION 'Item "%" is currently out of stock', v_item_name;
    END IF;

    -- Validate serving choice (base)
    v_base_choice := coalesce(v_item->>'base_choice', 'Injera');
    IF lower(v_base_choice) IN ('kita bread', 'kita') THEN
      v_base_extra := 25;
      v_base_choice := 'Kita bread';
    ELSIF lower(v_base_choice) IN ('injera', '') THEN
      v_base_extra := 0;
      v_base_choice := 'Injera';
    ELSIF lower(v_base_choice) IN ('no base', 'none') THEN
      v_base_extra := 0;
      v_base_choice := 'None';
    ELSE
      RAISE EXCEPTION 'Invalid serving choice "%" for item %', v_base_choice, v_item_name;
    END IF;

    v_spice := coalesce((v_item->>'spice_level')::integer, 0);
    IF v_spice < 0 OR v_spice > 3 THEN
      v_spice := 0;
    END IF;

    v_note := coalesce(v_item->>'note', '');

    -- Validate extras field: allowed to be omitted or null or empty array, but non-array is strictly rejected
    IF v_item ? 'extras' AND v_item->'extras' IS NOT NULL AND jsonb_typeof(v_item->'extras') <> 'null' THEN
      IF jsonb_typeof(v_item->'extras') <> 'array' THEN
        RAISE EXCEPTION 'Item "%" extras must be a JSON array', v_item_name;
      END IF;
    END IF;

    -- Validate extras against dynamic store_settings extras or trusted drink add-ons
    v_extras := ARRAY[]::text[];
    v_extras_seen := ARRAY[]::text[];
    v_extra_price := 0;

    IF v_item ? 'extras' AND v_item->'extras' IS NOT NULL AND jsonb_typeof(v_item->'extras') = 'array' THEN
      FOR v_extra_elem IN SELECT jsonb_array_elements_text(v_item->'extras')
      LOOP
        v_matched_name := NULL;
        v_matched_price := NULL;
        v_matched_enabled := true;
        v_extra_matched := false;
        v_extra_normalized := lower(trim(coalesce(v_extra_elem, '')));

        IF v_extra_normalized = '' THEN
          RAISE EXCEPTION 'Item "%" contains an empty extra option name', v_item_name;
        END IF;

        -- Prevent duplicate extras or drinks on a single item to eliminate exploit vectors
        IF v_extra_normalized = ANY(v_extras_seen) THEN
          RAISE EXCEPTION 'Duplicate extra option "%" for item %', v_extra_elem, v_item_name;
        END IF;
        v_extras_seen := array_append(v_extras_seen, v_extra_normalized);

        -- 1. Check authoritative store_settings (key = 'extras')
        IF v_extras_config IS NOT NULL THEN
          FOR v_extra_obj IN SELECT * FROM jsonb_array_elements(v_extras_config)
          LOOP
            IF lower(trim(coalesce(v_extra_obj->>'name', ''))) = v_extra_normalized THEN
              v_extra_matched := true;
              v_matched_name := trim(v_extra_obj->>'name');
              v_matched_price := (v_extra_obj->>'price')::numeric;
              v_matched_enabled := coalesce((v_extra_obj->>'enabled')::boolean, true);
              EXIT;
            END IF;
          END LOOP;
        END IF;

        IF v_extra_matched THEN
          IF NOT v_matched_enabled THEN
            RAISE EXCEPTION 'Extra option "%" is currently disabled and cannot be selected', v_extra_elem;
          END IF;
          v_extra_price := v_extra_price + v_matched_price;
          v_extras := array_append(v_extras, v_matched_name);
        -- 2. Drink add-ons (strictly separate from admin-managed food extras)
        ELSIF v_extra_normalized = 'ethiopian coffee' THEN
          v_extra_price := v_extra_price + 60;
          v_extras := array_append(v_extras, 'Ethiopian coffee');
        ELSIF v_extra_normalized = 'soft drink' THEN
          v_extra_price := v_extra_price + 45;
          v_extras := array_append(v_extras, 'Soft drink');
        ELSIF v_extra_normalized = 'ambo water' THEN
          v_extra_price := v_extra_price + 40;
          v_extras := array_append(v_extras, 'Ambo water');
        ELSE
          RAISE EXCEPTION 'Invalid extra option "%" for item %', v_extra_elem, v_item_name;
        END IF;
      END LOOP;
    END IF;

    -- Calculate item total server-side
    v_item_total := (v_base_price + v_base_extra + v_extra_price) * v_qty;
    v_subtotal := v_subtotal + v_item_total;

    INSERT INTO public.order_items (
      id,
      order_id,
      menu_item_id,
      name,
      base_price,
      quantity,
      base_choice,
      spice_level,
      extras,
      extra_price,
      item_total,
      note
    ) VALUES (
      gen_random_uuid(),
      v_order_id,
      v_item_id,
      v_item_name,
      v_base_price,
      v_qty,
      v_base_choice,
      v_spice,
      v_extras,
      (v_base_extra + v_extra_price),
      v_item_total,
      v_note
    );
  END LOOP;

  -- 5. Calculate final summary totals
  IF v_service_type = 'dine-in' THEN
    v_service_charge := round(v_subtotal * 0.05);
  ELSE
    v_service_charge := 0;
  END IF;

  v_total := v_subtotal + v_delivery_fee + v_service_charge;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      delivery_fee = v_delivery_fee,
      service_charge = v_service_charge,
      total = v_total
  WHERE id = v_order_id;

  -- Return created order and secret token (only to caller at creation time)
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'code', v_code,
    'total', v_total,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery_fee,
    'service_charge', v_service_charge,
    'guest_lookup_token', v_guest_token,
    'status', v_status,
    'created_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, jsonb) TO anon, authenticated, service_role;
