import { getSql, hasDatabaseUrl } from "../db";
import { NormalizedJob } from "./types";
import { TriagedJobResult } from "../llm/triage";
import { calculateJobAgeDays } from "./freshness";
import { MAX_AGE_DAYS_DEFAULT } from "../../config/job-profile";

export interface StoredJob {
  id: string;
  source: string;
  source_id: string;
  url: string;
  title: string;
  company: string;
  location: string | null;
  remote_scope: string | null;
  description: string | null;
  posted_at: string | null;
  fetched_at: string;
  exp_min_years: number | null;
  exp_class: "fresher" | "junior" | "unclear" | "senior";
  geo_eligibility: "worldwide" | "india_ok" | "restricted" | "unclear";
  geo_reason: string | null;
  skills: string[];
  filter_reason: string | null;
  summary_line: string | null;
  match_score: number | null;
  status: "new" | "shortlisted" | "skipped" | "applied";
  raw: unknown;
  last_seen_at: string;
  triaged_at?: string | null;
  contact_email?: string | null;
  apply_url?: string | null;
}

export interface SearchRunStats {
  llmCalls: number;
  llmErrors: number;
  llmSkippedStale: number;
  llmSkippedAlready?: number;
  llmSkippedIrrelevant?: number;
  shortlistCount: number;
  hiddenCount: number;
  languageHidden: number;
  boardsTotal?: number;
  boardsDone?: number;
  boardErrors?: Record<string, string>;
}

export interface SearchRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed";
  source_counts: Record<string, number>;
  new_jobs: number;
  filtered_out: number;
  error: string | null;
  stats?: SearchRunStats | null;
}

export interface JobsQueryOptions {
  view?: "shortlist" | "all" | "hidden";
  source?: string;
  q?: string;
  status?: string;
  maxAgeDays?: number;
  limit?: number;
  offset?: number;
}

export interface JobsRepository {
  upsertJob(job: NormalizedJob, triaged: TriagedJobResult): Promise<"new" | "existing">;
  getJob(source: string, sourceId: string): Promise<StoredJob | null>;
  getJobs(opts: JobsQueryOptions): Promise<{ jobs: StoredJob[]; total: number }>;
  getViewCounts(maxAgeDays?: number): Promise<{ shortlist: number; hidden: number; all: number }>;
  getStats(): Promise<{
    jobsFound: number;
    newToday: number;
    applied: number;
    replies: number;
    visits: number;
  }>;
  updateJobStatus(
    id: string,
    status: "new" | "shortlisted" | "skipped" | "applied"
  ): Promise<boolean>;
  createSearchRun(): Promise<string>;
  updateSearchRun(
    id: string,
    updates: Partial<SearchRun>
  ): Promise<void>;
  getSearchRun(id: string): Promise<SearchRun | null>;
  getLastSearchRun(): Promise<SearchRun | null>;
}

// In-Memory implementation for tests or when DB is not configured
export class InMemoryJobsRepository implements JobsRepository {
  private jobs = new Map<string, StoredJob>();
  private runs = new Map<string, SearchRun>();

  async upsertJob(
    job: NormalizedJob,
    triaged: TriagedJobResult
  ): Promise<"new" | "existing"> {
    const key = `${job.source}:${job.sourceId}`;
    const existing = this.jobs.get(key);
    const nowIso = new Date().toISOString();

    if (existing) {
      existing.title = job.title;
      existing.company = job.company;
      existing.location = job.location;
      existing.remote_scope = job.remoteScope;
      existing.description = job.description;
      existing.posted_at = job.postedAt;
      existing.exp_min_years = triaged.expMinYears;
      existing.exp_class = triaged.expClass;
      existing.geo_eligibility = triaged.geoEligibility;
      existing.geo_reason = triaged.geoReason;
      existing.skills = triaged.skills;
      existing.filter_reason = triaged.filterReason || null;
      existing.summary_line = triaged.summaryLine;
      existing.match_score = triaged.matchScore;
      existing.last_seen_at = nowIso;
      if (triaged.triagedAt) existing.triaged_at = triaged.triagedAt;
      if (job.contactEmail) existing.contact_email = job.contactEmail;
      if (job.applyUrl) existing.apply_url = job.applyUrl;
      return "existing";
    }

    const stored: StoredJob = {
      id: `mem-${this.jobs.size + 1}`,
      source: job.source,
      source_id: job.sourceId,
      url: job.url,
      title: job.title,
      company: job.company,
      location: job.location,
      remote_scope: job.remoteScope,
      description: job.description,
      posted_at: job.postedAt,
      fetched_at: nowIso,
      exp_min_years: triaged.expMinYears,
      exp_class: triaged.expClass,
      geo_eligibility: triaged.geoEligibility,
      geo_reason: triaged.geoReason,
      skills: triaged.skills,
      filter_reason: triaged.filterReason || null,
      summary_line: triaged.summaryLine,
      match_score: triaged.matchScore,
      status: "new",
      raw: { ...job, descriptionHash: triaged.descriptionHash },
      last_seen_at: nowIso,
      triaged_at: triaged.triagedAt || null,
      contact_email: job.contactEmail || null,
      apply_url: job.applyUrl || job.url,
    };

    this.jobs.set(key, stored);
    return "new";
  }

  async getJob(source: string, sourceId: string): Promise<StoredJob | null> {
    const key = `${source}:${sourceId}`;
    return this.jobs.get(key) || null;
  }

  async getJobs(opts: JobsQueryOptions): Promise<{ jobs: StoredJob[]; total: number }> {
    let list = Array.from(this.jobs.values());
    const view = opts.view || "shortlist";
    const maxAgeDays = opts.maxAgeDays ?? MAX_AGE_DAYS_DEFAULT;

    if (view === "shortlist") {
      list = list.filter((j) => {
        const isNotSkipped = j.status !== "skipped";
        const hasValidExp = ["fresher", "junior", "unclear"].includes(j.exp_class);
        const hasValidGeo = ["worldwide", "india_ok"].includes(j.geo_eligibility);
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        const isFresh = age <= maxAgeDays;
        const noFilter = !j.filter_reason;
        return isNotSkipped && hasValidExp && hasValidGeo && isFresh && noFilter;
      });
      list.sort((a, b) => {
        const scoreDiff = (b.match_score ?? 0) - (a.match_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        const timeA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const timeB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return timeB - timeA;
      });
    } else if (view === "hidden") {
      list = list.filter((j) => {
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        const isOlder = age > maxAgeDays;
        return (
          j.exp_class === "senior" ||
          j.geo_eligibility === "restricted" ||
          j.geo_eligibility === "unclear" ||
          j.status === "skipped" ||
          Boolean(j.filter_reason) ||
          isOlder
        );
      });
    } else {
      // "all" view: also filter by maxAgeDays
      list = list.filter((j) => {
        const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
        return age <= maxAgeDays;
      });
    }

    if (opts.source) {
      list = list.filter((j) => j.source.toLowerCase() === opts.source?.toLowerCase());
    }

    if (opts.status) {
      list = list.filter((j) => j.status === opts.status);
    }

    if (opts.q) {
      const qLower = opts.q.toLowerCase();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(qLower) ||
          j.company.toLowerCase().includes(qLower) ||
          j.skills.some((s) => s.toLowerCase().includes(qLower))
      );
    }

    const total = list.length;
    const offset = opts.offset || 0;
    const limit = opts.limit || 50;
    const paginated = list.slice(offset, offset + limit);

    return { jobs: paginated, total };
  }

  async getViewCounts(maxAgeDays: number = MAX_AGE_DAYS_DEFAULT): Promise<{ shortlist: number; hidden: number; all: number }> {
    const list = Array.from(this.jobs.values());
    let shortlist = 0;
    let hidden = 0;
    let all = 0;

    for (const j of list) {
      const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
      const isShortlistCandidate =
        ["fresher", "junior", "unclear"].includes(j.exp_class) &&
        ["worldwide", "india_ok"].includes(j.geo_eligibility) &&
        j.status !== "skipped" &&
        !j.filter_reason;

      const isHiddenCandidate =
        j.exp_class === "senior" ||
        j.geo_eligibility === "restricted" ||
        j.geo_eligibility === "unclear" ||
        j.status === "skipped" ||
        Boolean(j.filter_reason) ||
        age > maxAgeDays;

      if (isShortlistCandidate && age <= maxAgeDays) {
        shortlist++;
      }
      if (isHiddenCandidate) {
        hidden++;
      }
      if (age <= maxAgeDays) {
        all++;
      }
    }

    return { shortlist, hidden, all };
  }

  async getStats() {
    const list = Array.from(this.jobs.values());
    const today = new Date().toISOString().slice(0, 10);
    const jobsFound = list.length;
    const newToday = list.filter((j) => j.fetched_at.startsWith(today)).length;
    const applied = list.filter((j) => j.status === "applied").length;

    return {
      jobsFound,
      newToday,
      applied,
      replies: 0,
      visits: 0,
    };
  }

  async updateJobStatus(
    id: string,
    status: "new" | "shortlisted" | "skipped" | "applied"
  ): Promise<boolean> {
    for (const job of this.jobs.values()) {
      if (job.id === id) {
        job.status = status;
        return true;
      }
    }
    return false;
  }

  async createSearchRun(): Promise<string> {
    const id = `run-${this.runs.size + 1}`;
    this.runs.set(id, {
      id,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: "running",
      source_counts: {},
      new_jobs: 0,
      filtered_out: 0,
      error: null,
    });
    return id;
  }

  async updateSearchRun(id: string, updates: Partial<SearchRun>): Promise<void> {
    const run = this.runs.get(id);
    if (run) {
      Object.assign(run, updates);
    }
  }

  async getSearchRun(id: string): Promise<SearchRun | null> {
    return this.runs.get(id) || null;
  }

  async getLastSearchRun(): Promise<SearchRun | null> {
    const list = Array.from(this.runs.values());
    if (list.length === 0) return null;
    return list[list.length - 1];
  }
}

// Neon PostgreSQL Implementation with Parameterized Tagged Templates ONLY
export class NeonJobsRepository implements JobsRepository {
  async upsertJob(
    job: NormalizedJob,
    triaged: TriagedJobResult
  ): Promise<"new" | "existing"> {
    const sql = getSql();

    const rawPayload = {
      ...job,
      descriptionHash: triaged.descriptionHash,
    };

    try {
      // Try upserting with migration 004 columns (triaged_at, contact_email, apply_url)
      const rows = await sql`
        INSERT INTO jobs (
          source, source_id, url, title, company, location, remote_scope,
          description, posted_at, exp_min_years, exp_class, geo_eligibility,
          geo_reason, skills, filter_reason, summary_line, match_score,
          raw, last_seen_at, triaged_at, contact_email, apply_url
        ) VALUES (
          ${job.source},
          ${job.sourceId},
          ${job.url},
          ${job.title},
          ${job.company},
          ${job.location},
          ${job.remoteScope},
          ${job.description},
          ${job.postedAt},
          ${triaged.expMinYears},
          ${triaged.expClass},
          ${triaged.geoEligibility},
          ${triaged.geoReason},
          ${triaged.skills},
          ${triaged.filterReason || null},
          ${triaged.summaryLine},
          ${triaged.matchScore},
          ${JSON.stringify(rawPayload)},
          NOW(),
          ${triaged.triagedAt ? new Date(triaged.triagedAt) : null},
          ${job.contactEmail || null},
          ${job.applyUrl || job.url}
        )
        ON CONFLICT (source, source_id) DO UPDATE SET
          title = EXCLUDED.title,
          company = EXCLUDED.company,
          location = EXCLUDED.location,
          remote_scope = EXCLUDED.remote_scope,
          description = EXCLUDED.description,
          posted_at = EXCLUDED.posted_at,
          exp_min_years = EXCLUDED.exp_min_years,
          exp_class = EXCLUDED.exp_class,
          geo_eligibility = EXCLUDED.geo_eligibility,
          geo_reason = EXCLUDED.geo_reason,
          skills = EXCLUDED.skills,
          filter_reason = EXCLUDED.filter_reason,
          summary_line = EXCLUDED.summary_line,
          match_score = EXCLUDED.match_score,
          raw = EXCLUDED.raw,
          last_seen_at = NOW(),
          triaged_at = COALESCE(EXCLUDED.triaged_at, jobs.triaged_at),
          contact_email = COALESCE(EXCLUDED.contact_email, jobs.contact_email),
          apply_url = COALESCE(EXCLUDED.apply_url, jobs.apply_url)
        RETURNING (xmax = 0) AS is_new;
      `;
      return rows[0]?.is_new ? "new" : "existing";
    } catch {
      // Fallback if migration 004 has not yet run in database
      const rows = await sql`
        INSERT INTO jobs (
          source, source_id, url, title, company, location, remote_scope,
          description, posted_at, exp_min_years, exp_class, geo_eligibility,
          geo_reason, skills, filter_reason, summary_line, match_score,
          raw, last_seen_at
        ) VALUES (
          ${job.source},
          ${job.sourceId},
          ${job.url},
          ${job.title},
          ${job.company},
          ${job.location},
          ${job.remoteScope},
          ${job.description},
          ${job.postedAt},
          ${triaged.expMinYears},
          ${triaged.expClass},
          ${triaged.geoEligibility},
          ${triaged.geoReason},
          ${triaged.skills},
          ${triaged.filterReason || null},
          ${triaged.summaryLine},
          ${triaged.matchScore},
          ${JSON.stringify(rawPayload)},
          NOW()
        )
        ON CONFLICT (source, source_id) DO UPDATE SET
          title = EXCLUDED.title,
          company = EXCLUDED.company,
          location = EXCLUDED.location,
          remote_scope = EXCLUDED.remote_scope,
          description = EXCLUDED.description,
          posted_at = EXCLUDED.posted_at,
          exp_min_years = EXCLUDED.exp_min_years,
          exp_class = EXCLUDED.exp_class,
          geo_eligibility = EXCLUDED.geo_eligibility,
          geo_reason = EXCLUDED.geo_reason,
          skills = EXCLUDED.skills,
          filter_reason = EXCLUDED.filter_reason,
          summary_line = EXCLUDED.summary_line,
          match_score = EXCLUDED.match_score,
          raw = EXCLUDED.raw,
          last_seen_at = NOW()
        RETURNING (xmax = 0) AS is_new;
      `;
      return rows[0]?.is_new ? "new" : "existing";
    }
  }

  async getJob(source: string, sourceId: string): Promise<StoredJob | null> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM jobs
      WHERE source = ${source} AND source_id = ${sourceId}
      LIMIT 1
    `) as StoredJob[];
    return rows[0] || null;
  }

  async getJobs(opts: JobsQueryOptions): Promise<{ jobs: StoredJob[]; total: number }> {
    const sql = getSql();
    const limit = opts.limit || 50;
    const offset = opts.offset || 0;
    const view = opts.view || "shortlist";
    const maxAgeDays = opts.maxAgeDays ?? MAX_AGE_DAYS_DEFAULT;

    let rows: StoredJob[] = [];

    if (view === "shortlist") {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE exp_class IN ('fresher', 'junior', 'unclear')
          AND geo_eligibility IN ('worldwide', 'india_ok')
          AND status != 'skipped'
          AND filter_reason IS NULL
          AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
        ORDER BY match_score DESC, posted_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];
    } else if (view === "hidden") {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE exp_class = 'senior'
           OR geo_eligibility IN ('restricted', 'unclear')
           OR status = 'skipped'
           OR filter_reason IS NOT NULL
           OR COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];
    } else {
      rows = (await sql`
        SELECT * FROM jobs
        WHERE COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
        ORDER BY last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as StoredJob[];
    }

    const countRows = await sql`SELECT COUNT(*)::int as count FROM jobs`;
    const total = countRows[0]?.count || 0;

    return { jobs: rows, total };
  }

  async getViewCounts(maxAgeDays: number = MAX_AGE_DAYS_DEFAULT): Promise<{ shortlist: number; hidden: number; all: number }> {
    const sql = getSql();
    try {
      const rows = await sql`
        SELECT
          COUNT(*) FILTER (
            WHERE exp_class IN ('fresher', 'junior', 'unclear')
              AND geo_eligibility IN ('worldwide', 'india_ok')
              AND status != 'skipped'
              AND filter_reason IS NULL
              AND COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          )::int AS shortlist,
          COUNT(*) FILTER (
            WHERE exp_class = 'senior'
               OR geo_eligibility IN ('restricted', 'unclear')
               OR status = 'skipped'
               OR filter_reason IS NOT NULL
               OR COALESCE(posted_at, fetched_at) < NOW() - (${maxAgeDays} || ' days')::interval
          )::int AS hidden,
          COUNT(*) FILTER (
            WHERE COALESCE(posted_at, fetched_at) >= NOW() - (${maxAgeDays} || ' days')::interval
          )::int AS all
        FROM jobs;
      `;
      return {
        shortlist: Number(rows[0]?.shortlist || 0),
        hidden: Number(rows[0]?.hidden || 0),
        all: Number(rows[0]?.all || 0),
      };
    } catch {
      return { shortlist: 0, hidden: 0, all: 0 };
    }
  }

  async getStats() {
    const sql = getSql();

    const counts = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE fetched_at >= NOW() - INTERVAL '24 hours')::int AS new_today,
        COUNT(*) FILTER (WHERE status = 'applied')::int AS applied
      FROM jobs
    `;

    return {
      jobsFound: counts[0]?.total || 0,
      newToday: counts[0]?.new_today || 0,
      applied: counts[0]?.applied || 0,
      replies: 0,
      visits: 0,
    };
  }

  async updateJobStatus(
    id: string,
    status: "new" | "shortlisted" | "skipped" | "applied"
  ): Promise<boolean> {
    const sql = getSql();
    const res = await sql`
      UPDATE jobs SET status = ${status} WHERE id = ${id} RETURNING id
    `;
    return res.length > 0;
  }

  async createSearchRun(): Promise<string> {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO search_runs (started_at, status)
      VALUES (NOW(), 'running')
      RETURNING id
    `;
    return rows[0].id;
  }

  async updateSearchRun(id: string, updates: Partial<SearchRun>): Promise<void> {
    const sql = getSql();
    try {
      // Try updating with stats column if it exists in the schema
      await sql`
        UPDATE search_runs
        SET
          finished_at = ${updates.finished_at ? sql`NOW()` : null},
          status = ${updates.status || null},
          source_counts = ${updates.source_counts ? JSON.stringify(updates.source_counts) : null},
          new_jobs = ${updates.new_jobs ?? 0},
          filtered_out = ${updates.filtered_out ?? 0},
          error = ${updates.error || null},
          stats = ${updates.stats ? JSON.stringify(updates.stats) : null}
        WHERE id = ${id}
      `;
    } catch {
      // Fallback if stats column has not yet been migrated in production
      await sql`
        UPDATE search_runs
        SET
          finished_at = ${updates.finished_at ? sql`NOW()` : null},
          status = ${updates.status || null},
          source_counts = ${updates.source_counts ? JSON.stringify(updates.source_counts) : null},
          new_jobs = ${updates.new_jobs ?? 0},
          filtered_out = ${updates.filtered_out ?? 0},
          error = ${updates.error || null}
        WHERE id = ${id}
      `;
    }
  }

  async getSearchRun(id: string): Promise<SearchRun | null> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM search_runs WHERE id = ${id} LIMIT 1
    `) as SearchRun[];
    return rows[0] || null;
  }

  async getLastSearchRun(): Promise<SearchRun | null> {
    const sql = getSql();
    const rows = (await sql`
      SELECT * FROM search_runs ORDER BY started_at DESC LIMIT 1
    `) as SearchRun[];
    return rows[0] || null;
  }
}

let singletonRepo: JobsRepository | null = null;

export function getJobsRepository(): JobsRepository {
  if (singletonRepo) return singletonRepo;

  // Use in-memory repository if DATABASE_URL is missing or if explicitly requested by E2E_SEED or test env
  if (process.env.E2E_SEED === "1" || process.env.USE_IN_MEMORY_REPO === "1") {
    singletonRepo = new InMemoryJobsRepository();
    return singletonRepo;
  }

  if (hasDatabaseUrl()) {
    singletonRepo = new NeonJobsRepository();
  } else {
    singletonRepo = new InMemoryJobsRepository();
  }
  return singletonRepo;
}

export function setTestJobsRepository(repo: JobsRepository | null) {
  singletonRepo = repo;
}
