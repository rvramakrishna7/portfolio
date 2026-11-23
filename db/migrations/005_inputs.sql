-- Migration 005: Bundle A inputs (custom boards, inbound raw tracking)
-- Plain statements only, no dollar quote tokens.

CREATE TABLE IF NOT EXISTS custom_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(kind, slug)
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS inbound_raw TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS inbound_source TEXT;
