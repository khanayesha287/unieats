-- UniEats: Add department, discount, and special_instructions columns
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- These columns enhance the order record with department info and discount tracking.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS special_instructions TEXT;
