-- Migration 004: Add triage timestamp, contact email, and direct apply url
-- Plain SQL statements only

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_url TEXT;
