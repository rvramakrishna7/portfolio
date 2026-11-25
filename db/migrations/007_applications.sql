-- Migration 007: Applications, outreach drafts expansion and sent tracking
-- Plain statements only, no dollar quote tokens.

-- 1. Update outreach_drafts kind check constraint
ALTER TABLE outreach_drafts DROP CONSTRAINT IF EXISTS outreach_drafts_kind_check;
ALTER TABLE outreach_drafts ADD CONSTRAINT outreach_drafts_kind_check
  CHECK (kind IN ('email', 'linkedin_note', 'linkedin_dm', 'application_answer'));

-- 2. Add question, recipient, sent_at, sent_channel columns to outreach_drafts
ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS question TEXT;
ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS recipient TEXT;
ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS sent_channel TEXT;

-- 3. Add index on sent_at
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_sent_at ON outreach_drafts (sent_at);

-- 4. Extend jobs.status check constraint to allow 'replied', 'interview', 'offer', 'rejected'
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('new', 'shortlisted', 'skipped', 'applied', 'replied', 'interview', 'offer', 'rejected'));
