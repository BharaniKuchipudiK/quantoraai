-- Migration: Stripe Monetization

-- Allow users to connect their Stripe accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;

-- Record completed orders from Stripe Checkout
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub TEXT NOT NULL REFERENCES users(google_sub) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    stripe_session_id TEXT NOT NULL UNIQUE,
    stripe_payment_intent_id TEXT,
    amount_total INTEGER NOT NULL,
    currency TEXT NOT NULL,
    customer_email TEXT,
    customer_name TEXT,
    line_items JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_sub ON orders(user_sub);
CREATE INDEX IF NOT EXISTS idx_orders_project_name ON orders(project_name);

-- Enable RLS and add a policy for admin/service role
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
