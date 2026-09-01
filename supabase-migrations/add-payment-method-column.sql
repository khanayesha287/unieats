-- UniEats: Add payment_method column to the orders table
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- The checkout flow sends payment_method ('cod' | 'online') and the
-- admin/canteen dashboards display it. Orders still save without this
-- column (it is dropped with a console warning), but the payment method
-- is not persisted until this migration is applied.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
