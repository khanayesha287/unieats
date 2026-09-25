-- ================================================================
-- UniEats: Durable WhatsApp order notifications
-- ================================================================
-- Run after the orders and order_items tables exist.
-- The service-role backend is the only actor allowed to read/update
-- this table. Students never submit notification payloads or recipients.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_order_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'order_created',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_message_id TEXT,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, event_type)
);

CREATE INDEX IF NOT EXISTS whatsapp_order_notifications_status_idx
  ON public.whatsapp_order_notifications (status, created_at);

CREATE OR REPLACE FUNCTION public.set_whatsapp_notification_updated_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_notification_updated_at
  ON public.whatsapp_order_notifications;
CREATE TRIGGER whatsapp_notification_updated_at
  BEFORE UPDATE ON public.whatsapp_order_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_whatsapp_notification_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_order_notification()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.whatsapp_order_notifications (
    order_id,
    event_type,
    status,
    idempotency_key
  )
  VALUES (
    NEW.id::TEXT,
    'order_created',
    'pending',
    'order-created:' || NEW.id::TEXT
  )
  ON CONFLICT (order_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_whatsapp_order_notification()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_order_notifications
  WHERE order_id = OLD.id::TEXT;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS orders_enqueue_whatsapp_notification ON public.orders;
CREATE TRIGGER orders_enqueue_whatsapp_notification
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_whatsapp_order_notification();

DROP TRIGGER IF EXISTS orders_remove_whatsapp_notification ON public.orders;
CREATE TRIGGER orders_remove_whatsapp_notification
  AFTER DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_whatsapp_order_notification();

ALTER TABLE public.whatsapp_order_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_notifications_no_client_access
  ON public.whatsapp_order_notifications;

-- No anon/authenticated policy is intentional. The server-side service role
-- processes this table and bypasses RLS; browser clients cannot read, insert,
-- update, retry, or alter notification records.
REVOKE ALL ON TABLE public.whatsapp_order_notifications FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_whatsapp_order_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_whatsapp_order_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_whatsapp_notification_updated_at() FROM PUBLIC;
