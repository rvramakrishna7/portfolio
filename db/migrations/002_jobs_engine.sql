-- Migration 002: Job Engine Schema Expansion (geo, skills, reasons, search_runs)

-- 1. Add geo_eligibility with check constraint
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geo_eligibility TEXT CHECK (geo_eligibility IN ('worldwide', 'india_ok', 'restricted', 'unclear')) DEFAULT 'unclear';

-- 2. Add geo_reason
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geo_reason TEXT;

-- 3. Add skills array
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}';

-- 4. Add filter_reason
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS filter_reason TEXT;

-- 5. Add summary_line
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS summary_line TEXT;

-- 6. Add raw jsonb for source payload
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS raw JSONB;

-- 7. Add last_seen_at
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- 8. Add search_runs table
CREATE TABLE IF NOT EXISTS search_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'done', 'failed')),
  source_counts JSONB,
  new_jobs INT DEFAULT 0,
  filtered_out INT DEFAULT 0,
  error TEXT
);

-- 9. Add indexes for efficient filtering and triage ordering
CREATE INDEX IF NOT EXISTS idx_jobs_exp_class ON jobs(exp_class);
CREATE INDEX IF NOT EXISTS idx_jobs_geo_eligibility ON jobs(geo_eligibility);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen_at ON jobs(last_seen_at DESC);
