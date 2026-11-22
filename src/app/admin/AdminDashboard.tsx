"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StoredJob } from "@/lib/jobs/repository";
import { formatJobAge } from "@/lib/jobs/freshness";
import { MAX_AGE_DAYS_DEFAULT } from "@/config/job-profile";

interface StatItem {
  id: string;
  label: string;
  value: number;
  hint: string;
}

type TabKey = "jobs" | "pipeline" | "messages" | "visits" | "settings";
type ViewFilter = "shortlist" | "hidden" | "all";

interface TabConfig {
  key: TabKey;
  label: string;
  description: string;
  emptyHeading: string;
  emptyText: string;
}

const TABS: TabConfig[] = [
  {
    key: "jobs",
    label: "Jobs",
    description: "Curated tech leads and matches",
    emptyHeading: "No jobs found",
    emptyText: "Click 'Run search now' above to ingest active listings from RemoteOK, Jobicy, Arbeitnow, and WeWorkRemotely.",
  },
  {
    key: "pipeline",
    label: "Pipeline",
    description: "Active outreach and application stages",
    emptyHeading: "Pipeline is clear",
    emptyText: "Shortlisted roles and application statuses from drafted to interview will be tracked here.",
  },
  {
    key: "messages",
    label: "Messages",
    description: "Recruiter contacts and correspondence drafts",
    emptyHeading: "No messages to review",
    emptyText: "Owner-approved email drafts and correspondence logs will be managed here.",
  },
  {
    key: "visits",
    label: "Visits",
    description: "Privacy-preserving referral analytics",
    emptyHeading: "No visits recorded",
    emptyText: "Visits with referral tags and device types will show here with zero cookies or tracking.",
  },
  {
    key: "settings",
    label: "Settings",
    description: "Database and system configurations",
    emptyHeading: "System settings ready",
    emptyText: "Database connection status, secret rotation, and email preferences will be configured here.",
  },
];

export function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("jobs");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Job Search & List State
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [viewCounts, setViewCounts] = useState<{
    shortlist: number;
    hidden: number;
    all: number;
  }>({ shortlist: 0, hidden: 0, all: 0 });
  const [stats, setStats] = useState({
    jobsFound: 0,
    newToday: 0,
    applied: 0,
    replies: 0,
    visits: 0,
  });
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [lastSourceCounts, setLastSourceCounts] = useState<Record<string, number> | null>(null);
  const [lastRunStats, setLastRunStats] = useState<{ llmCalls: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [viewFilter, setViewFilter] = useState<ViewFilter>("shortlist");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [maxAgeDays, setMaxAgeDays] = useState<number>(MAX_AGE_DAYS_DEFAULT);

  // Pipeline search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set("view", viewFilter);
      params.set("maxAgeDays", String(maxAgeDays));
      if (sourceFilter) params.set("source", sourceFilter);
      if (searchQuery) params.set("q", searchQuery);

      const res = await fetch(`/api/admin/jobs?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load jobs (HTTP ${res.status})`);
      }
      const data = await res.json();
      setJobs(data.jobs || []);
      if (data.viewCounts) setViewCounts(data.viewCounts);
      if (data.stats) setStats(data.stats);
      if (data.lastRun?.finished_at) {
        setLastRunTime(data.lastRun.finished_at);
        setLastSourceCounts(data.lastRun.source_counts || null);
        if (data.lastRun.stats?.llmCalls !== undefined) {
          setLastRunStats({ llmCalls: data.lastRun.stats.llmCalls });
        }
      }
    } catch (err: unknown) {
      setFetchError(
        err instanceof Error
          ? err.message
          : "Database connection unavailable or failed to load data."
      );
    } finally {
      setIsLoading(false);
    }
  }, [viewFilter, sourceFilter, searchQuery, maxAgeDays]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        params.set("view", viewFilter);
        params.set("maxAgeDays", String(maxAgeDays));
        if (sourceFilter) params.set("source", sourceFilter);
        if (searchQuery) params.set("q", searchQuery);

        const res = await fetch(`/api/admin/jobs?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to load jobs (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (!ignore) {
          setJobs(data.jobs || []);
          if (data.viewCounts) setViewCounts(data.viewCounts);
          if (data.stats) setStats(data.stats);
          if (data.lastRun?.finished_at) {
            setLastRunTime(data.lastRun.finished_at);
            setLastSourceCounts(data.lastRun.source_counts || null);
            if (data.lastRun.stats?.llmCalls !== undefined) {
              setLastRunStats({ llmCalls: data.lastRun.stats.llmCalls });
            }
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setFetchError(
            err instanceof Error
              ? err.message
              : "Database connection unavailable or failed to load data."
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [viewFilter, sourceFilter, searchQuery, maxAgeDays]);

  const handleRunSearch = async () => {
    if (isSearching) return;
    setIsSearching(true);
    setSearchProgress("Starting search across sources...");

    try {
      // 1. Start search
      const startRes = await fetch("/api/admin/search/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!startRes.ok) throw new Error("Could not initiate job search");
      const { runId, pendingTriage, totalFetched } = await startRes.json();

      setSearchProgress(`Fetched ${totalFetched} listings. Triaging ${pendingTriage} opportunities...`);

      // 2. Loop step batches
      let done = false;
      let remaining = pendingTriage;

      while (!done) {
        const stepRes = await fetch("/api/admin/search/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId, batchSize: 15 }),
        });
        if (!stepRes.ok) throw new Error("Error during triage step");
        const stepData = await stepRes.json();
        done = stepData.done;
        remaining = stepData.remaining;
        setSearchProgress(`Triaging: ${remaining} opportunities remaining...`);
        if (done) break;
      }

      setSearchProgress("Search complete! Reloading opportunities...");
      await fetchJobs();
    } catch (err: unknown) {
      setSearchProgress(
        `Search failed: ${err instanceof Error ? err.message : "Network error"}`
      );
    } finally {
      setIsSearching(false);
      setTimeout(() => setSearchProgress(null), 5000);
    }
  };

  const handleUpdateStatus = async (
    id: string,
    newStatus: "new" | "shortlisted" | "skipped" | "applied"
  ) => {
    try {
      const res = await fetch(`/api/admin/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setJobs((prev) =>
          prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j))
        );
        fetchJobs();
      }
    } catch {
      // Silent error fallback for action
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  };

  const currentTab = TABS.find((t) => t.key === activeTab) || TABS[0];

  const ALL_SOURCES = [
    "remoteok",
    "jobicy",
    "arbeitnow",
    "weworkremotely",
    "greenhouse",
    "lever",
    "ashby",
    "hn",
  ] as const;

  const availableSources = Array.from(
    new Set([
      ...ALL_SOURCES,
      ...jobs.map((j) => j.source).filter(Boolean),
    ])
  );

  const statItems: StatItem[] = [
    { id: "jobs-found", label: "Jobs found", value: stats.jobsFound, hint: "Total indexed opportunities" },
    { id: "new-today", label: "New today", value: stats.newToday, hint: "Ingested in the last 24 hours" },
    { id: "applied", label: "Applied", value: stats.applied, hint: "Applications submitted" },
    { id: "replies", label: "Replies", value: stats.replies, hint: "Responses from recruiters" },
    { id: "visits", label: "Portfolio visits", value: stats.visits, hint: "Tracked portfolio inbound views" },
  ];

  return (
    <div className="admin-dashboard-container">
      <header className="admin-head">
        <div className="admin-brand">
          <h1>Ramakrishna Job Desk</h1>
          <span className="admin-status-badge">Private</span>
        </div>
        <div className="admin-head-actions">
          <ThemeToggle />
          <button
            className="btn ghost admin-logout-btn"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Sign out of Job Desk"
          >
            {isLoggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      <main id="main" className="admin-content">
        <section className="admin-stats-section" aria-label="Key metrics">
          <h2 className="sr-only">Key Metrics</h2>
          <div className="admin-stats-grid">
            {statItems.map((stat) => (
              <div key={stat.id} className="admin-stat-card">
                <span className="admin-stat-num">{stat.value}</span>
                <span className="admin-stat-label">{stat.label}</span>
                <span className="admin-stat-hint">{stat.hint}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-tabs-section" aria-label="Job Desk views">
          <div className="admin-tabs-nav" role="tablist" aria-label="Dashboard sections">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`admin-tab-btn${activeTab === tab.key ? " active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
                aria-selected={activeTab === tab.key}
                role="tab"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="admin-tab-panel" role="tabpanel" aria-label={currentTab.label}>
            <div className="admin-panel-header">
              <div>
                <h2>{currentTab.label}</h2>
                <p className="admin-panel-desc">{currentTab.description}</p>
              </div>

              {activeTab === "jobs" && (
                <div className="admin-jobs-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleRunSearch}
                    disabled={isSearching}
                  >
                    {isSearching ? "Searching..." : "Run search now"}
                  </button>
                </div>
              )}
            </div>

            {activeTab === "jobs" && (
              <div className="admin-jobs-view">
                {searchProgress && (
                  <div className="admin-search-status" role="status">
                    <p>{searchProgress}</p>
                  </div>
                )}

                {lastRunTime && (
                  <div className="admin-last-run-info">
                    <span>Last run: {new Date(lastRunTime).toLocaleString()}</span>
                    {lastRunStats && (
                      <span className="admin-stats-summary">
                        LLM: {lastRunStats.llmCalls} calls
                      </span>
                    )}
                    {lastSourceCounts && (
                      <span className="admin-sources-summary">
                        Sources: {Object.entries(lastSourceCounts).map(([k, v]) => `${k} (${v})`).join(", ")}
                      </span>
                    )}
                  </div>
                )}

                {/* Filters */}
                <div className="admin-filter-bar">
                  <div className="admin-view-filters" role="group" aria-label="Filter job views">
                    <button
                      type="button"
                      className={`btn filter-btn${viewFilter === "shortlist" ? " active" : ""}`}
                      onClick={() => setViewFilter("shortlist")}
                    >
                      Shortlist ({viewCounts.shortlist})
                    </button>
                    <button
                      type="button"
                      className={`btn filter-btn${viewFilter === "hidden" ? " active" : ""}`}
                      onClick={() => setViewFilter("hidden")}
                    >
                      Hidden ({viewCounts.hidden})
                    </button>
                    <button
                      type="button"
                      className={`btn filter-btn${viewFilter === "all" ? " active" : ""}`}
                      onClick={() => setViewFilter("all")}
                    >
                      All ({viewCounts.all})
                    </button>
                  </div>

                  <div className="admin-search-filters">
                    <label htmlFor="posted-within-select" className="sr-only">Posted within</label>
                    <select
                      id="posted-within-select"
                      className="admin-select"
                      value={maxAgeDays}
                      onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                    >
                      <option value={3}>Posted within 3 days</option>
                      <option value={7}>Posted within 7 days</option>
                      <option value={10}>Posted within 10 days</option>
                    </select>

                    <label htmlFor="source-select" className="sr-only">Source</label>
                    <select
                      id="source-select"
                      className="admin-select"
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                    >
                      <option value="">All Sources</option>
                      {availableSources.map((src) => {
                        let label = src.charAt(0).toUpperCase() + src.slice(1);
                        if (src === "hn") label = "Hacker News";
                        if (src === "remoteok") label = "RemoteOK";
                        if (src === "weworkremotely") label = "WeWorkRemotely";
                        return (
                          <option key={src} value={src}>
                            {label}
                          </option>
                        );
                      })}
                    </select>

                    <label htmlFor="job-search-input" className="sr-only">Search roles or skills</label>
                    <input
                      id="job-search-input"
                      type="text"
                      className="admin-search-input"
                      placeholder="Search roles or skills..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Error state */}
                {fetchError && (
                  <div className="admin-error-box" role="alert">
                    <p>{fetchError}</p>
                  </div>
                )}

                {/* Loading state */}
                {isLoading && (
                  <div className="admin-loading-indicator">
                    <p>Loading opportunities...</p>
                  </div>
                )}

                {/* Jobs listing */}
                {!isLoading && !fetchError && jobs.length === 0 && (
                  <div className="admin-empty-card">
                    <h3>{currentTab.emptyHeading}</h3>
                    <p>{currentTab.emptyText}</p>
                  </div>
                )}

                {!isLoading && !fetchError && jobs.length > 0 && (
                  <div className="admin-jobs-list" role="feed" aria-label="Job listings">
                    {jobs.map((job) => (
                      <article key={job.id} className="admin-job-card" data-job-id={job.id}>
                        <div className="admin-job-top">
                          <div className="admin-job-main">
                            <h3 className="admin-job-title">{job.title}</h3>
                            <div className="admin-job-meta">
                              <span className="admin-job-company">{job.company}</span>
                              <span className="admin-meta-sep">•</span>
                              <span className="admin-job-source-tag">
                                via <a href={job.url} target="_blank" rel="noopener noreferrer">{job.source}</a>
                              </span>
                              <span className="admin-meta-sep">•</span>
                              <span className="admin-job-date">
                                {formatJobAge(job.posted_at, job.fetched_at)}
                              </span>
                            </div>
                          </div>

                          <div className="admin-job-badges">
                            {job.match_score !== null && (
                              <span className="badge score-badge">Match: {job.match_score}</span>
                            )}
                            <span className={`badge exp-badge ${job.exp_class}`}>
                              Exp: {job.exp_class}
                            </span>
                            <span className={`badge geo-badge ${job.geo_eligibility}`}>
                              Geo: {job.geo_eligibility}
                            </span>
                            {job.contact_email && (
                              <span className="badge email-badge" title={job.contact_email}>
                                Email available
                              </span>
                            )}
                          </div>
                        </div>

                        {job.summary_line && (
                          <p className="admin-job-summary">{job.summary_line}</p>
                        )}

                        {viewFilter === "hidden" && job.filter_reason && (
                          <p className="admin-job-filter-reason">
                            <strong>Reason:</strong> {job.filter_reason}
                          </p>
                        )}

                        {job.skills && job.skills.length > 0 && (
                          <div className="admin-job-skills">
                            {job.skills.map((s) => (
                              <span key={s} className="skill-pill">{s}</span>
                            ))}
                          </div>
                        )}

                        <div className="admin-job-actions">
                          <a
                            href={job.apply_url || job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn ghost btn-sm"
                          >
                            Open ↗
                          </a>
                          <button
                            type="button"
                            className={`btn ${job.status === "shortlisted" ? "primary" : "ghost"} btn-sm`}
                            onClick={() => handleUpdateStatus(job.id, "shortlisted")}
                          >
                            Shortlist
                          </button>
                          <button
                            type="button"
                            className={`btn ${job.status === "applied" ? "primary" : "ghost"} btn-sm`}
                            onClick={() => handleUpdateStatus(job.id, "applied")}
                          >
                            Mark applied
                          </button>
                          <button
                            type="button"
                            className="btn ghost btn-sm btn-danger"
                            onClick={() => handleUpdateStatus(job.id, "skipped")}
                          >
                            Skip
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab !== "jobs" && (
              <div className="admin-empty-card">
                <h3>{currentTab.emptyHeading}</h3>
                <p>{currentTab.emptyText}</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
