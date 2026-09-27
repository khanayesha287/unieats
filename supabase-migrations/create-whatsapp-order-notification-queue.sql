-- ================================================================
-- UniEats: Additive WhatsApp order notification queue
-- ================================================================
-- This queue is separate from the legacy whatsapp_order_notifications table.
-- Run after the public.orders table exists.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_order_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'order_created',
  recipient_phone TEXT,
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

CREATE INDEX IF NOT EXISTS whatsapp_order_notification_queue_status_idx
  ON public.whatsapp_order_notification_queue (status, created_at);

CREATE INDEX IF NOT EXISTS whatsapp_order_notification_queue_order_idx
  ON public.whatsapp_order_notification_queue (order_id, event_type, status);

CREATE OR REPLACE FUNCTION public.set_whatsapp_order_notification_queue_updated_at()
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

DROP TRIGGER IF EXISTS whatsapp_order_notification_queue_updated_at
  ON public.whatsapp_order_notification_queue;
CREATE TRIGGER whatsapp_order_notification_queue_updated_at
  BEFORE UPDATE ON public.whatsapp_order_notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_whatsapp_order_notification_queue_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_order_notification_queue()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.whatsapp_order_notification_queue (
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

DROP TRIGGER IF EXISTS orders_enqueue_whatsapp_order_notification_queue
  ON public.orders;
CREATE TRIGGER orders_enqueue_whatsapp_order_notification_queue
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_whatsapp_order_notification_queue();

CREATE OR REPLACE FUNCTION public.remove_whatsapp_order_notification_queue()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_order_notification_queue
  WHERE order_id = OLD.id::TEXT;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS orders_remove_whatsapp_order_notification_queue
  ON public.orders;
CREATE TRIGGER orders_remove_whatsapp_order_notification_queue
  AFTER DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_whatsapp_order_notification_queue();

ALTER TABLE public.whatsapp_order_notification_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_order_notification_queue
  FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_order_notification_queue
  TO service_role;

REVOKE ALL ON FUNCTION public.set_whatsapp_order_notification_queue_updated_at()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_whatsapp_order_notification_queue()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_whatsapp_order_notification_queue()
  FROM PUBLIC;
