-- Migration 008: Tracked links, visits logging, and reply detection events
-- Plain statements only, no dollar quote tokens.

-- 1. Add track_code column to outreach_drafts
ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS track_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_drafts_track_code ON outreach_drafts (track_code) WHERE track_code IS NOT NULL;

-- 2. Extend visits table if not exists or ensure required columns
-- Note: visits was created in 001_init.sql with (id, tracking_code, path, referrer_host, device, country, at).
-- We add is_bot to visits to classify crawler/preview visits vs human visits.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

-- 3. Reply events table
CREATE TABLE IF NOT EXISTS reply_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES outreach_drafts(id) ON DELETE SET NULL,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('exact', 'possible')),
  subject_snippet VARCHAR(120) NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  received_at TIMESTAMPTZ NOT NULL,
  alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reply_events_job_id ON reply_events (job_id);
CREATE INDEX IF NOT EXISTS idx_reply_events_alerted_at ON reply_events (alerted_at);
