-- Migration 001: Initial schema for Portfolio Admin & Job Desk
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_hash_at ON login_attempts(ip_hash, at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  remote_scope TEXT,
  description TEXT,
  posted_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exp_min_years INT,
  exp_class TEXT CHECK (exp_class IN ('fresher', 'junior', 'unclear', 'senior')),
  match_score INT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'shortlisted', 'skipped', 'applied')),
  CONSTRAINT uq_jobs_source_source_id UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_posted_at ON jobs(status, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_match_score ON jobs(match_score DESC);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  company TEXT,
  email TEXT,
  linkedin_url TEXT,
  source_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

CREATE TABLE IF NOT EXISTS outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin', 'whatsapp', 'other')),
  tracking_code TEXT UNIQUE,
  draft TEXT,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'sent', 'connected', 'dm_sent', 'replied', 'interview', 'closed')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach(status);
CREATE INDEX IF NOT EXISTS idx_outreach_tracking_code ON outreach(tracking_code);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id UUID REFERENCES outreach(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_outreach_id ON events(outreach_id);
CREATE INDEX IF NOT EXISTS idx_events_type_at ON events(type, at DESC);

CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code TEXT,
  path TEXT NOT NULL,
  referrer_host TEXT,
  device TEXT,
  country TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visits_tracking_code ON visits(tracking_code);
CREATE INDEX IF NOT EXISTS idx_visits_at ON visits(at DESC);

CREATE TABLE IF NOT EXISTS inbound_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_raw_created_at ON inbound_raw(created_at DESC);
