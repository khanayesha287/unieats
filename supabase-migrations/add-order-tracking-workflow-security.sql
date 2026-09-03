-- ============================================================================
-- UniEats: Guest tracking, status-event notifications, and staff boundaries
-- ============================================================================
-- Run after harden-staff-canteen-rls.sql and the orders, order_items,
-- staff_profiles, and WhatsApp queue tables exist.
-- The raw guest token is never stored; only its SHA-256 hash is persisted.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_token_hash TEXT;

CREATE INDEX IF NOT EXISTS orders_tracking_token_hash_idx
  ON public.orders (tracking_token_hash)
  WHERE tracking_token_hash IS NOT NULL;

-- A checkout must include a tracking capability and a real canteen reference.
DROP POLICY IF EXISTS orders_checkout_insert ON public.orders;
CREATE POLICY orders_checkout_insert ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    canteen_id IS NOT NULL
    AND tracking_token_hash IS NOT NULL
    AND length(tracking_token_hash) = 64
    AND status = 'pending'
  );

DROP POLICY IF EXISTS order_items_checkout_insert ON public.order_items;
CREATE POLICY order_items_checkout_insert ON public.order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id)
  );

-- Students have no direct SELECT policy. The server tracking endpoint verifies
-- the token hash using the service-role client and returns a minimal projection.

-- --------------------------------------------------------------------------
-- Durable WhatsApp queue: trusted recipient and event-specific status records
-- --------------------------------------------------------------------------
ALTER TABLE public.whatsapp_order_notifications
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

UPDATE public.whatsapp_order_notifications n
SET recipient_phone = o.phone
FROM public.orders o
WHERE n.order_id = o.id::TEXT
  AND n.recipient_phone IS NULL;

CREATE INDEX IF NOT EXISTS whatsapp_order_notifications_order_idx
  ON public.whatsapp_order_notifications (order_id, event_type, status);

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_order_notification()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.whatsapp_order_notifications
    (order_id, event_type, recipient_phone, status, idempotency_key)
  VALUES
    (NEW.id::TEXT, 'order_created', NEW.phone, 'pending', 'order-created:' || NEW.id::TEXT)
  ON CONFLICT (order_id, event_type) DO UPDATE
    SET recipient_phone = EXCLUDED.recipient_phone
  WHERE public.whatsapp_order_notifications.status = 'pending';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_status_notification()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_name TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  event_name := CASE NEW.status
    WHEN 'confirmed' THEN 'accepted'
    WHEN 'preparing' THEN 'preparing'
    WHEN 'ready' THEN 'ready'
    WHEN 'out_for_delivery' THEN 'out_for_delivery'
    WHEN 'delivered' THEN 'delivered'
    ELSE NULL
  END;

  IF event_name IS NOT NULL THEN
    INSERT INTO public.whatsapp_order_notifications
      (order_id, event_type, recipient_phone, status, idempotency_key)
    VALUES
      (NEW.id::TEXT, event_name, NEW.phone, 'pending', 'order-status:' || NEW.id::TEXT || ':' || event_name)
    ON CONFLICT (order_id, event_type) DO UPDATE
      SET recipient_phone = EXCLUDED.recipient_phone
      WHERE public.whatsapp_order_notifications.status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enqueue_whatsapp_status_notification ON public.orders;
CREATE TRIGGER orders_enqueue_whatsapp_status_notification
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_whatsapp_status_notification();

-- --------------------------------------------------------------------------
-- Deterministic workflow transitions for non-admin staff.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_order_workflow_update()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_role TEXT := public.current_staff_role();
BEGIN
  IF staff_role = 'canteen_owner' THEN
    IF NEW.canteen_id IS DISTINCT FROM OLD.canteen_id
      OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
      OR NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.student_name IS DISTINCT FROM OLD.student_name
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.order_type IS DISTINCT FROM OLD.order_type
    THEN
      RAISE EXCEPTION 'Canteen staff may only update order status';
    END IF;
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
      OR (OLD.status = 'confirmed' AND NEW.status IN ('preparing', 'cancelled'))
      OR (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Invalid canteen order status transition';
    END IF;
  ELSIF staff_role = 'driver' THEN
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id
      OR NEW.canteen_id IS DISTINCT FROM OLD.canteen_id
      OR NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.student_name IS DISTINCT FROM OLD.student_name
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    THEN
      RAISE EXCEPTION 'Driver staff may only update order status';
    END IF;
    IF NOT (
      (OLD.status = 'ready' AND NEW.status = 'out_for_delivery')
      OR (OLD.status = 'out_for_delivery' AND NEW.status = 'delivered')
    ) THEN
      RAISE EXCEPTION 'Invalid driver order status transition';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_workflow_update ON public.orders;
CREATE TRIGGER validate_order_workflow_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_workflow_update();

-- --------------------------------------------------------------------------
-- Driver authorization: driver_id is the authenticated staff user UUID.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS orders_staff_select ON public.orders;
CREATE POLICY orders_staff_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_staff_role() = 'admin'
    OR (public.current_staff_role() = 'canteen_owner' AND canteen_id = public.current_staff_canteen_id())
    OR (public.current_staff_role() = 'driver' AND order_type = 'delivery' AND driver_id = auth.uid())
  );

DROP POLICY IF EXISTS orders_staff_update ON public.orders;
CREATE POLICY orders_staff_update ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.current_staff_role() = 'admin'
    OR (public.current_staff_role() = 'canteen_owner' AND canteen_id = public.current_staff_canteen_id())
    OR (public.current_staff_role() = 'driver' AND order_type = 'delivery' AND driver_id = auth.uid())
  )
  WITH CHECK (
    public.current_staff_role() = 'admin'
    OR (public.current_staff_role() = 'canteen_owner' AND canteen_id = public.current_staff_canteen_id())
    OR (public.current_staff_role() = 'driver' AND order_type = 'delivery' AND driver_id = auth.uid())
  );

DROP POLICY IF EXISTS order_items_staff_select ON public.order_items;
CREATE POLICY order_items_staff_select ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          public.current_staff_role() = 'admin'
          OR (public.current_staff_role() = 'canteen_owner' AND o.canteen_id = public.current_staff_canteen_id())
          OR (public.current_staff_role() = 'driver' AND o.order_type = 'delivery' AND o.driver_id = auth.uid())
        )
    )
  );

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_order_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_order_notifications FROM anon, authenticated;
