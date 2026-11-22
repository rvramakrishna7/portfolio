"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

interface StatItem {
  id: string;
  label: string;
  value: number;
  hint: string;
}

const STATS: StatItem[] = [
  { id: "jobs-found", label: "Jobs found", value: 0, hint: "Total indexed opportunities" },
  { id: "new-today", label: "New today", value: 0, hint: "Ingested in the last 24 hours" },
  { id: "applied", label: "Applied", value: 0, hint: "Applications submitted" },
  { id: "replies", label: "Replies", value: 0, hint: "Responses from recruiters" },
  { id: "visits", label: "Portfolio visits", value: 0, hint: "Tracked portfolio inbound views" },
];

type TabKey = "jobs" | "pipeline" | "messages" | "visits" | "settings";

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
    emptyHeading: "No jobs ingested yet",
    emptyText: "Job discovery feeds and incoming opportunities will appear here once connected.",
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

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  };

  const currentTab = TABS.find((t) => t.key === activeTab) || TABS[0];

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
            {STATS.map((stat) => (
              <div key={stat.id} className="admin-stat-card">
                <span className="admin-stat-num">{stat.value}</span>
                <span className="admin-stat-label">{stat.label}</span>
                <span className="admin-stat-hint">{stat.hint}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-tabs-section" aria-label="Job Desk views">
          <nav className="admin-tabs-nav" aria-label="Dashboard sections">
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
          </nav>

          <div className="admin-tab-panel" role="tabpanel" aria-label={currentTab.label}>
            <div className="admin-panel-header">
              <h2>{currentTab.label}</h2>
              <p className="admin-panel-desc">{currentTab.description}</p>
            </div>
            <div className="admin-empty-card">
              <h3>{currentTab.emptyHeading}</h3>
              <p>{currentTab.emptyText}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
