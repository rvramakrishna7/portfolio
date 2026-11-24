-- Migration 006: Outreach drafts table and indexes
-- Plain statements only, no dollar quote tokens.

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'linkedin_note', 'linkedin_dm')),
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'discarded')),
  model TEXT,
  edited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_drafts_job_id ON outreach_drafts (job_id);
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_status_created_at ON outreach_drafts (status, created_at DESC);
