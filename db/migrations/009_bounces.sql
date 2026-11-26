-- Migration 009: remember when a sent email bounced.
-- Plain statements only, no dollar quote tokens.

ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
