"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import ContactFinder from "./ContactFinder";
import AnswerStudio from "./AnswerStudio";
import { readableDescription, shortLinkLabel } from "../../lib/jobs/description-text";
import { buildEmailParts, type EmailMode } from "@/lib/outreach/email-format";
import {
  StoredJob,
  CustomBoard,
  HiddenReasonsCounts,
  OutreachDraft,
  DraftCountsByStatus,
  PipelineJob,
} from "@/lib/jobs/repository";
import { formatJobAge } from "@/lib/jobs/freshness";
import { MAX_AGE_DAYS_DEFAULT } from "@/config/job-profile";
import { hasRealDescription, getMissingDescriptionNote } from "@/lib/jobs/classify";
import { formatLlmStatsSummary } from "@/lib/jobs/stats-format";

interface StatItem {
  id: string;
  label: string;
  value: number;
  hint: string;
}

type TabKey = "jobs" | "pipeline" | "messages" | "answers" | "visits" | "settings";
type ViewFilter = "shortlist" | "maybe" | "inbox" | "hidden" | "all";

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
    key: "answers",
    label: "Answers",
    description: "Paste a job description and questions, get human-sounding answers",
    emptyHeading: "No answers yet",
    emptyText: "Paste a job description and your questions to get answers.",
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

const HIDDEN_REASON_CHIPS: Array<{ key: keyof HiddenReasonsCounts; label: string }> = [
  { key: "senior_title", label: "Senior (title)" },
  { key: "senior_desc", label: "Senior (desc)" },
  { key: "onsite", label: "Onsite" },
  { key: "restricted", label: "Restricted" },
  { key: "geo_unclear", label: "Geo unclear" },
  { key: "stale", label: "Stale" },
  { key: "language", label: "Language" },
  { key: "skipped", label: "Skipped" },
  { key: "low_relevance", label: "Low relevance" },
  { key: "missing_desc", label: "Missing desc" },
];

const PRESET_QUESTIONS = [
  "What interests you about working for this company?",
  "Why this role?",
  "Tell us about a project you are proud of",
  "What is your biggest strength for this role?",
] as const;

// A "possible reply" is only open while the job is still before the reply stage.
// Once the owner confirms it (status "replied") or moves the job on, the badge goes away.
const REPLY_STAGE_REACHED = ["replied", "interview", "offer", "rejected"];
type IconName = "copy" | "mail" | "gmail" | "check" | "send" | "external";

const ICON_PATHS: Record<IconName, string> = {
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  mail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6",
  gmail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6M14 3h7v7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  send: "M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
};

function Ico({ name }: { name: IconName }) {
  return (
    <svg
      className="admin-ico"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function hasOpenPossibleReply(job: { status: string; possibleReply?: unknown }): boolean {
  return Boolean(job.possibleReply) && !REPLY_STAGE_REACHED.includes(job.status);
}

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "recently";
  }
}

export function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("jobs");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Job Search & List State
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [viewCounts, setViewCounts] = useState<{
    shortlist: number;
    maybe: number;
    inbox: number;
    hidden: number;
    all: number;
    reasons?: HiddenReasonsCounts;
  }>({ shortlist: 0, maybe: 0, inbox: 0, hidden: 0, all: 0 });
  const [stats, setStats] = useState({
    jobsFound: 0,
    newToday: 0,
    applied: 0,
    replies: 0,
    visits: 0,
  });
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [lastSourceCounts, setLastSourceCounts] = useState<Record<string, number> | null>(null);
  const [lastRunStats, setLastRunStats] = useState<{
    llmCalls: number;
    llmErrors?: number;
    llmLastError?: string;
    llmErrorReasons?: Record<string, number>;
    sources?: Record<string, { status: string; count: number; error?: string; note?: string }>;
  } | null>(null);
  const [isTestingGroq, setIsTestingGroq] = useState(false);
  const [groqTestResults, setGroqTestResults] = useState<{
    triage: { model: string; status: "ok" | "error"; error: string | null };
    outreach: { model: string; status: "ok" | "error"; error: string | null };
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [viewFilter, setViewFilter] = useState<ViewFilter>("shortlist");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [maxAgeDays, setMaxAgeDays] = useState<number>(MAX_AGE_DAYS_DEFAULT);
  const [reasonFilter, setReasonFilter] = useState<string>("");

  // Pipeline search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<string | null>(null);

  // Inbound "Add jobs" state
  const [showAddJobs, setShowAddJobs] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [waFile, setWaFile] = useState<File | null>(null);
  const [isSubmittingPaste, setIsSubmittingPaste] = useState(false);
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);
  const [isUploadingWa, setIsUploadingWa] = useState(false);
  const [inboundFeedback, setInboundFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings: Custom Boards & Connections state
  const [customBoards, setCustomBoards] = useState<CustomBoard[]>([]);
  const [newBoardKind, setNewBoardKind] = useState<"greenhouse" | "lever" | "ashby">("greenhouse");
  const [newBoardSlug, setNewBoardSlug] = useState("");
  const [newBoardLabel, setNewBoardLabel] = useState("");
  const [isAddingBoard, setIsAddingBoard] = useState(false);
  const [boardFeedback, setBoardFeedback] = useState<string | null>(null);

  // Outreach Drafts state (Bundle B1)
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [draftCounts, setDraftCounts] = useState<DraftCountsByStatus>({
    all: 0,
    draft: 0,
    approved: 0,
    discarded: 0,
  });
  const [draftFilter, setDraftFilter] = useState<"all" | "draft" | "approved" | "discarded">("draft");
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [draftingJobId, setDraftingJobId] = useState<string | null>(null);
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [isRechecking, setIsRechecking] = useState(false);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [editingDrafts, setEditingDrafts] = useState<
    Record<string, { subject?: string; body: string; recipient?: string }>
  >({});

  // Pipeline tab state (Step 5)
  const [pipelineJobs, setPipelineJobs] = useState<PipelineJob[]>([]);
  const [isLoadingPipeline, setIsLoadingPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);
  const [replyCheckToast, setReplyCheckToast] = useState<string | null>(null);

  // Sending approved email drafts from Gmail (owner clicks, two steps)
  const [sendToast, setSendToast] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState<EmailMode>("plain");
  const [trackVisits, setTrackVisits] = useState(true);
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const [confirmSendAll, setConfirmSendAll] = useState(false);
  const [isSendingAll, setIsSendingAll] = useState(false);

  // Visits tab state (Step 2)
  const [visitsList, setVisitsList] = useState<
    Array<{ code: string; visited_at: string; is_bot: boolean; country: string | null; job_title?: string; job_company?: string }>
  >([]);
  const [isLoadingVisits, setIsLoadingVisits] = useState(false);
  const [draftVisitsByJob, setDraftVisitsByJob] = useState<Record<string, { count: number; lastVisitAt: string | null }>>({});

  // Application answers state (Step 3)
  const [answeringJobId, setAnsweringJobId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [pastedDescription, setPastedDescription] = useState("");
  const [showPastedDesc, setShowPastedDesc] = useState(false);
  const [maxWords, setMaxWords] = useState<number>(100);
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [answersToday, setAnswersToday] = useState(0);

  const fetchJobs = useCallback(async () => {
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set("view", viewFilter);
      params.set("maxAgeDays", String(maxAgeDays));
      if (sourceFilter) params.set("source", sourceFilter);
      if (searchQuery) params.set("q", searchQuery);
      if (viewFilter === "hidden" && reasonFilter) params.set("reason", reasonFilter);

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
        if (data.lastRun.stats) {
          setLastRunStats({
            llmCalls: data.lastRun.stats.llmCalls || 0,
            llmErrors: data.lastRun.stats.llmErrors ?? 0,
            llmLastError: data.lastRun.stats.llmLastError,
            llmErrorReasons: data.lastRun.stats.llmErrorReasons,
            sources: data.lastRun.stats.sources,
          });
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
  }, [viewFilter, sourceFilter, searchQuery, maxAgeDays, reasonFilter]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        params.set("view", viewFilter);
        params.set("maxAgeDays", String(maxAgeDays));
        if (sourceFilter) params.set("source", sourceFilter);
        if (searchQuery) params.set("q", searchQuery);
        if (viewFilter === "hidden" && reasonFilter) params.set("reason", reasonFilter);

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
            if (data.lastRun.stats) {
              setLastRunStats({
                llmCalls: data.lastRun.stats.llmCalls || 0,
                llmErrors: data.lastRun.stats.llmErrors ?? 0,
                llmLastError: data.lastRun.stats.llmLastError,
                llmErrorReasons: data.lastRun.stats.llmErrorReasons,
                sources: data.lastRun.stats.sources,
              });
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
  }, [viewFilter, sourceFilter, searchQuery, maxAgeDays, reasonFilter]);

  // The AI reads saved jobs that are still visible and hides the ones that need experience
  const handleRecheckExperience = async () => {
    setIsRechecking(true);
    try {
      const res = await fetch("/api/admin/jobs/recheck-experience", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI check failed");
      setCopyToast(
        data.error && data.checked === 0
          ? `AI check problem: ${data.error}`
          : `AI read ${data.checked} jobs and hid ${data.hidden} that need experience. ${
              data.remaining > 0 ? `${data.remaining} left, click again.` : "All done."
            }`
      );
      await fetchJobs();
    } catch (err: unknown) {
      setCopyToast(err instanceof Error ? err.message : "AI check failed");
    } finally {
      setIsRechecking(false);
      setTimeout(() => setCopyToast(null), 8000);
    }
  };

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
      const { runId, pendingTriage, totalFetched, remainingBoards } = await startRes.json();

      if (remainingBoards > 0) {
        setSearchProgress(`Fetched ${totalFetched} listings. Boards: ${remainingBoards} left. Triaging: ${pendingTriage} pending...`);
      } else {
        setSearchProgress(`Fetched ${totalFetched} listings. Triaging ${pendingTriage} opportunities...`);
      }

      // 2. Loop step batches
      let done = false;

      while (!done) {
        const stepRes = await fetch("/api/admin/search/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId, batchSize: 15 }),
        });
        if (!stepRes.ok) throw new Error("Error during triage step");
        const stepData = await stepRes.json();
        done = stepData.done;
        const boardsLeft = stepData.remainingBoards ?? 0;
        const triageLeft = stepData.pendingTriage ?? stepData.remaining ?? 0;

        if (boardsLeft > 0) {
          setSearchProgress(`Boards: ${boardsLeft} left. Triaging: ${triageLeft} pending...`);
        } else {
          setSearchProgress(`Triaging: ${triageLeft} opportunities remaining...`);
        }
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

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    setIsSubmittingPaste(true);
    setInboundFeedback(null);
    try {
      const res = await fetch("/api/admin/inbound/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process text");
      }
      setInboundFeedback(`Added ${data.added}, skipped ${data.duplicates} duplicates, ${data.filtered} filtered.`);
      setPasteText("");
      await fetchJobs();
    } catch (err: unknown) {
      setInboundFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingPaste(false);
    }
  };

  const handleUrlSubmit = async () => {
    if (!pasteUrl.trim()) return;
    setIsSubmittingUrl(true);
    setInboundFeedback(null);
    try {
      const res = await fetch("/api/admin/inbound/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pasteUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch URL");
      }
      setInboundFeedback(`Added ${data.added}, skipped ${data.duplicates} duplicates, ${data.filtered} filtered.`);
      setPasteUrl("");
      await fetchJobs();
    } catch (err: unknown) {
      setInboundFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingUrl(false);
    }
  };

  const handleWhatsAppUpload = async () => {
    if (!waFile) return;
    setIsUploadingWa(true);
    setInboundFeedback(null);
    try {
      const formData = new FormData();
      formData.append("file", waFile);
      const res = await fetch("/api/admin/inbound/whatsapp", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import WhatsApp export");
      }
      setInboundFeedback(
        `Imported: Added ${data.added}, skipped ${data.duplicates} duplicates, ${data.filtered} filtered (parsed ${data.parsedJobs} jobs from ${data.totalMessages} messages).`
      );
      setWaFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchJobs();
    } catch (err: unknown) {
      setInboundFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploadingWa(false);
    }
  };

  const fetchCustomBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/boards");
      if (res.ok) {
        const data = await res.json();
        setCustomBoards(data.boards || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (activeTab === "settings") {
      let ignore = false;
      const load = async () => {
        try {
          const res = await fetch("/api/admin/boards");
          if (res.ok) {
            const data = await res.json();
            if (!ignore) {
              setCustomBoards(data.boards || []);
            }
          }
        } catch {
          // Ignore
        }
      };
      load();
      return () => {
        ignore = true;
      };
    }
  }, [activeTab]);

  const handleAddBoard = async () => {
    if (!newBoardSlug.trim()) return;
    setIsAddingBoard(true);
    setBoardFeedback(null);
    try {
      const res = await fetch("/api/admin/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: newBoardKind,
          slug: newBoardSlug.trim(),
          label: newBoardLabel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add custom board");
      }
      setBoardFeedback(`Board '${newBoardSlug}' added successfully.`);
      setNewBoardSlug("");
      setNewBoardLabel("");
      await fetchCustomBoards();
    } catch (err: unknown) {
      setBoardFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAddingBoard(false);
    }
  };

  const handleDeleteBoard = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/boards?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchCustomBoards();
      }
    } catch {
      // Ignore
    }
  };

  const fetchDrafts = useCallback(async (status?: string, jobId?: string) => {
    setIsLoadingDrafts(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (jobId) params.set("jobId", jobId);
      const res = await fetch(`/api/admin/drafts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load drafts");
      const data = await res.json();
      setDrafts(data.drafts || []);
      if (data.counts) setDraftCounts(data.counts);
      if (typeof data.answersToday === "number") setAnswersToday(data.answersToday);
      if (data.visitsByJob) setDraftVisitsByJob(data.visitsByJob);
    } catch {
      // Ignore
    } finally {
      setIsLoadingDrafts(false);
    }
  }, []);

  const fetchPipeline = useCallback(async () => {
    setIsLoadingPipeline(true);
    setPipelineError(null);
    try {
      const res = await fetch("/api/admin/pipeline");
      if (!res.ok) throw new Error("Failed to load pipeline");
      const data = await res.json();
      setPipelineJobs(data.pipeline || []);
    } catch (err: unknown) {
      setPipelineError(err instanceof Error ? err.message : "Failed to load pipeline");
    } finally {
      setIsLoadingPipeline(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "pipeline") {
      let ignore = false;
      const load = async () => {
        setIsLoadingPipeline(true);
        setPipelineError(null);
        try {
          const res = await fetch("/api/admin/pipeline");
          if (!res.ok) throw new Error("Failed to load pipeline");
          const data = await res.json();
          if (!ignore) {
            setPipelineJobs(data.pipeline || []);
          }
        } catch (err: unknown) {
          if (!ignore) {
            setPipelineError(err instanceof Error ? err.message : "Failed to load pipeline");
          }
        } finally {
          if (!ignore) {
            setIsLoadingPipeline(false);
          }
        }
      };
      load();
      return () => {
        ignore = true;
      };
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "visits") {
      let ignore = false;
      const load = async () => {
        setIsLoadingVisits(true);
        try {
          const res = await fetch("/api/admin/visits");
          if (res.ok) {
            const data = await res.json();
            if (!ignore) {
              setVisitsList(data.visits || []);
            }
          }
        } catch {
          // Ignore
        } finally {
          if (!ignore) setIsLoadingVisits(false);
        }
      };
      load();
      return () => {
        ignore = true;
      };
    }
  }, [activeTab]);
  useEffect(() => {
    if (activeTab === "messages") {
      let ignore = false;
      const load = async () => {
        try {
          const params = new URLSearchParams();
          if (draftFilter && draftFilter !== "all") params.set("status", draftFilter);
          if (focusedJobId) params.set("jobId", focusedJobId);
          const res = await fetch(`/api/admin/drafts?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (!ignore) {
              setDrafts(data.drafts || []);
              if (data.counts) setDraftCounts(data.counts);
              if (typeof data.answersToday === "number") setAnswersToday(data.answersToday);
              if (data.visitsByJob) setDraftVisitsByJob(data.visitsByJob);
            }
          }
        } catch {
          // Ignore
        }
      };
      load();
      return () => {
        ignore = true;
      };
    }
  }, [activeTab, draftFilter, focusedJobId]);

  const handleTestGroqModels = async () => {
    setIsTestingGroq(true);
    try {
      const res = await fetch("/api/admin/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setGroqTestResults({
          triage: { model: "triage", status: "error", error: data?.error || `http ${res.status}` },
          outreach: { model: "outreach", status: "error", error: data?.error || `http ${res.status}` },
        });
        return;
      }
      setGroqTestResults(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "network error";
      setGroqTestResults({
        triage: { model: "triage", status: "error", error: msg },
        outreach: { model: "outreach", status: "error", error: msg },
      });
    } finally {
      setIsTestingGroq(false);
    }
  };

  const handleDraftOutreach = async (jobId: string) => {
    const existingGroup = drafts.filter((d) => d.job_id === jobId);
    if (existingGroup.some((d) => Boolean(d.sent_at))) {
      if (!window.confirm("Some drafts for this role have been marked as sent. Regenerate anyway?")) {
        return;
      }
    }
    setDraftingJobId(jobId);
    setOutreachError(null);
    try {
      const res = await fetch("/api/admin/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate outreach drafts");
      }
      if (data.failures && data.failures.length > 0) {
        const failureDetails = data.failures
          .map((f: { kind: string; reason: string }) => {
            const kindLabel =
              f.kind === "linkedin_dm"
                ? "LinkedIn DM"
                : f.kind === "linkedin_note"
                ? "LinkedIn note"
                : "Cold email";
            return `${kindLabel} failed: ${f.reason}`;
          })
          .join("; ");
        setOutreachError(`Saved ${data.drafts.length} of 3 (${failureDetails})`);
      } else {
        setOutreachError(null);
      }
      if (typeof data.answersToday === "number") setAnswersToday(data.answersToday);
      setFocusedJobId(jobId);
      setActiveTab("messages");
      setDraftFilter("all");
      await fetchDrafts("all", jobId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setOutreachError(errMsg);
    } finally {
      setDraftingJobId(null);
    }
  };

  // Puts a checked contact email on this job's open email draft. With no draft yet, copies it so it can be pasted later.
  const handleUseContact = async (
    jobId: string,
    contact: { email: string; name: string | null; linkedinUrl: string | null }
  ): Promise<string> => {
    const { email, name } = contact;
    // Remember the person on the job so every new draft greets them and fills the recipient.
    try {
      const saved = await fetch(`/api/admin/jobs/${jobId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, linkedinUrl: contact.linkedinUrl }),
      });
      if (!saved.ok) {
        const err = await saved.json().catch(() => ({}));
        return err.error || "Could not save the contact";
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                contact_email: email,
                contact_url: contact.linkedinUrl || j.contact_url,
                raw: { ...((j.raw as Record<string, unknown> | null) || {}), contactName: name },
              }
            : j
        )
      );
    } catch {
      return "Could not save the contact";
    }
    const who = name ? `${name} (${email})` : email;
    const draft = drafts.find(
      (d) => d.job_id === jobId && d.kind === "email" && !d.sent_at && d.status !== "discarded"
    );
    if (!draft) {
      try {
        await navigator.clipboard.writeText(email);
      } catch {
        // clipboard may be blocked; the message below still names the address
      }
      return `Saved ${who}. Click Draft outreach: the email will greet ${name ? name.split(" ")[0] : "them"} and use this address.`;
    }
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the recipient");
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? data.draft : d)));
      setEditingDrafts((prev) => {
        const next = { ...prev };
        delete next[draft.id];
        return next;
      });
      return `Saved ${who} and set it as the recipient. Click Draft outreach again to greet ${name ? name.split(" ")[0] : "them"} by name.`;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : "Could not save the recipient";
    }
  };

  const handleUpdateDraft = async (
    draftId: string,
    updates: { subject?: string; body?: string; status?: "draft" | "approved" | "discarded"; recipient?: string }
  ) => {
    if (updates.status === "discarded") {
      const draft = drafts.find((d) => d.id === draftId);
      if (draft?.sent_at) {
        if (!window.confirm("This draft was marked as sent. Are you sure you want to discard it?")) {
          return;
        }
      }
    }
    setSavingDraftId(draftId);
    try {
      const res = await fetch(`/api/admin/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update draft");
      }
      setDrafts((prev) => prev.map((d) => (d.id === draftId ? data.draft : d)));
      if (data.counts) setDraftCounts(data.counts);
      setEditingDrafts((prev) => {
        const next = { ...prev };
        delete next[draftId];
        return next;
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDraftId(null);
    }
  };

  const handleGenerateAnswer = async (jobId: string) => {
    if (!questionText.trim()) return;
    setIsGeneratingAnswer(true);
    setAnswerError(null);
    try {
      const res = await fetch("/api/admin/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          question: questionText.trim(),
          pastedDescription: pastedDescription.trim() || undefined,
          maxWords,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate application answer");
      }
      setAnsweringJobId(null);
      setQuestionText("");
      setPastedDescription("");
      setShowPastedDesc(false);
      if (data.counts) setDraftCounts(data.counts);
      if (typeof data.answersToday === "number") setAnswersToday(data.answersToday);
      setFocusedJobId(jobId);
      setActiveTab("messages");
      setDraftFilter("all");
      await fetchDrafts("all", jobId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setAnswerError(errMsg);
    } finally {
      setIsGeneratingAnswer(false);
    }
  };

  const handleRegenerateAnswer = async (draft: OutreachDraft) => {
    if (draft.sent_at) {
      if (!window.confirm("This answer was already marked as sent. Regenerate anyway?")) {
        return;
      }
    }
    setIsGeneratingAnswer(true);
    try {
      const res = await fetch("/api/admin/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: draft.job_id,
          question: draft.question || "Tell us about a project you are proud of",
          maxWords: 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to regenerate answer");
      }
      if (data.counts) setDraftCounts(data.counts);
      if (typeof data.answersToday === "number") setAnswersToday(data.answersToday);
      await fetchDrafts(draftFilter, focusedJobId || undefined);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingAnswer(false);
    }
  };

  const handleMarkSent = async (draft: OutreachDraft) => {
    try {
      const res = await fetch(`/api/admin/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_sent",
          channel: draft.kind,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to mark draft as sent");
      }
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? data.draft : d)));
      if (data.counts) setDraftCounts(data.counts);
      fetchJobs();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const showSendToast = (message: string) => {
    setSendToast(message);
    setTimeout(() => setSendToast(null), 7000);
  };

  const handleSendDraft = async (
    draft: OutreachDraft,
    pending?: { subject: string; body: string; recipient: string }
  ) => {
    setConfirmSendId(null);
    setSendingDraftId(draft.id);
    try {
      if (pending) {
        // Save edits and approve first. If this fails, nothing is sent.
        const saveRes = await fetch(`/api/admin/drafts/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "approved",
            subject: pending.subject,
            body: pending.body,
            recipient: pending.recipient,
          }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          showSendToast(saveData.error || "Could not save the draft, nothing was sent");
          return;
        }
        setEditingDrafts((prev) => {
          const next = { ...prev };
          delete next[draft.id];
          return next;
        });
      }
      const res = await fetch(`/api/admin/drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: emailMode, track: trackVisits }),
      });
      const data = await res.json();
      if (!res.ok) {
        showSendToast(data.error || "Sending failed");
        // The draft may have changed on the server (already sent, or marked sent after an unknown result)
        await fetchDrafts(draftFilter, focusedJobId || undefined);
        return;
      }
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? { ...d, ...data.draft } : d)));
      if (data.counts) setDraftCounts(data.counts);
      showSendToast(`Sent to ${data.draft.recipient || "the recipient"}`);
      fetchJobs();
    } catch {
      showSendToast("Sending failed. Check the draft before trying again.");
      await fetchDrafts(draftFilter, focusedJobId || undefined);
    } finally {
      setSendingDraftId(null);
    }
  };

  const handleSendAll = async () => {
    setConfirmSendAll(false);
    setIsSendingAll(true);
    try {
      const res = await fetch("/api/admin/drafts/send-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: emailMode, track: trackVisits }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Send all failed");
      }
      const parts = [`Sent ${data.sent}`];
      if (data.failed) parts.push(`${data.failed} failed`);
      if (data.eligibleLeft) parts.push(`${data.eligibleLeft} still waiting`);
      if (data.stoppedBecause === "daily_cap") parts.push("daily limit reached");
      else if (data.stoppedBecause === "not_configured") parts.push("email sending is not configured");
      else if (data.stoppedBecause) parts.push("stopped early, check the drafts");
      showSendToast(parts.join(", "));
    } catch (err: unknown) {
      showSendToast(err instanceof Error ? err.message : "Send all failed");
    } finally {
      await fetchDrafts(draftFilter, focusedJobId || undefined);
      fetchJobs();
      setIsSendingAll(false);
    }
  };

  const handlePipelineStatus = async (
    jobId: string,
    newStatus: "replied" | "interview" | "offer" | "rejected"
  ) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setPipelineJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
        );
        fetchPipeline();
        fetchJobs();
      }
    } catch {
      // Ignore
    }
  };

  const handleCheckRepliesNow = async () => {
    setIsCheckingReplies(true);
    setReplyCheckToast(null);
    try {
      const res = await fetch("/api/admin/replies/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Reply check failed");
      }
      setReplyCheckToast(
        data.error
          ? `Reply check problem: ${data.error}`
          : `Checked ${data.checked || 0} messages (${data.exactMatches || 0} exact, ${data.possibleMatches || 0} possible)${
              data.sentMarked ? `. Found ${data.sentMarked} sent from Gmail` : ""
            }${data.bounces ? `. ${data.bounces} email${data.bounces === 1 ? "" : "s"} bounced (address not found)` : ""}${data.sentError ? `. Sent folder problem: ${data.sentError}` : ""}`
      );
      setTimeout(() => setReplyCheckToast(null), data.error ? 10000 : 5000);
      await fetchPipeline();
      await fetchJobs();
    } catch (err: unknown) {
      setReplyCheckToast(err instanceof Error ? err.message : "Reply check failed");
      setTimeout(() => setReplyCheckToast(null), 4000);
    } finally {
      setIsCheckingReplies(false);
    }
  };

  const handleDismissPossibleReply = (jobId: string) => {
    setPipelineJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, possibleReply: null } : j))
    );
  };

  const handleCopyDraft = async (draft: OutreachDraft) => {
    const currentSubject =
      editingDrafts[draft.id]?.subject !== undefined
        ? editingDrafts[draft.id]?.subject
        : draft.subject;
    const currentBody =
      editingDrafts[draft.id]?.body !== undefined
        ? editingDrafts[draft.id]?.body
        : draft.body;

    const textToCopy =
      draft.kind === "email" && currentSubject
        ? `Subject: ${currentSubject}\n\n${currentBody}`
        : currentBody;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyToast("Copied to clipboard!");
      setTimeout(() => setCopyToast(null), 2500);
    } catch {
      // Fallback
    }
  };

  // Copies the email the way it will look in the chosen mode, so it can be pasted into Gmail compose.
  const handleCopyFormatted = async (draft: OutreachDraft) => {
    const body = editingDrafts[draft.id]?.body !== undefined ? editingDrafts[draft.id].body : draft.body;
    const parts = buildEmailParts(body, emailMode, { track: trackVisits });
    try {
      if (parts.html && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([parts.html], { type: "text/html" }),
            "text/plain": new Blob([parts.text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(parts.text);
      }
      setCopyToast("Email copied. Paste it into Gmail.");
      setTimeout(() => setCopyToast(null), 2500);
    } catch {
      setCopyToast("Could not copy. Allow clipboard access and try again.");
      setTimeout(() => setCopyToast(null), 3500);
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
    "linkedin",
    "email",
    "telegram",
    "whatsapp",
    "paste",
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
          <Link className="admin-view-site" href="/">
            View site
          </Link>
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
            {TABS.map((tab) => {
              const unreadRepliesCount =
                tab.key === "pipeline"
                  ? pipelineJobs.filter((p) => hasOpenPossibleReply(p)).length
                  : 0;

              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`admin-tab-btn${activeTab === tab.key ? " active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                  aria-selected={activeTab === tab.key}
                  role="tab"
                >
                  {tab.label}
                  {unreadRepliesCount > 0 && (
                    <span className="badge-unread-count" aria-label={`${unreadRepliesCount} unread replies`}>
                      {unreadRepliesCount}
                    </span>
                  )}
                </button>
              );
            })}
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
                    className="btn ghost"
                    onClick={() => setShowAddJobs(!showAddJobs)}
                    aria-expanded={showAddJobs}
                  >
                    {showAddJobs ? "Close Add Jobs" : "+ Add jobs"}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleRunSearch}
                    disabled={isSearching}
                  >
                    {isSearching ? "Searching..." : "Run search now"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={handleRecheckExperience}
                    disabled={isRechecking}
                  >
                    {isRechecking ? "AI is reading..." : "Re-check experience with AI"}
                  </button>
                </div>
              )}
            </div>

            {activeTab === "jobs" && (
              <div className="admin-jobs-view">
                {showAddJobs && (
                  <div className="admin-add-jobs-panel" aria-label="Add jobs manually">
                    <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem" }}>Add Jobs</h3>
                    <div className="admin-add-jobs-grid">
                      <div className="admin-input-group">
                        <label htmlFor="paste-job-text">Paste text / email forward / chat</label>
                        <textarea
                          id="paste-job-text"
                          className="admin-textarea"
                          placeholder="Paste job posting, forward, or chat message..."
                          rows={4}
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn primary btn-sm"
                          onClick={handlePasteSubmit}
                          disabled={isSubmittingPaste || !pasteText.trim()}
                        >
                          {isSubmittingPaste ? "Parsing..." : "Add from text"}
                        </button>
                      </div>

                      <div className="admin-input-group">
                        <label htmlFor="paste-job-url">Job or board URL</label>
                        <input
                          id="paste-job-url"
                          type="url"
                          className="admin-input"
                          placeholder="https://..."
                          value={pasteUrl}
                          onChange={(e) => setPasteUrl(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn ghost btn-sm"
                          onClick={handleUrlSubmit}
                          disabled={isSubmittingUrl || !pasteUrl.trim()}
                        >
                          {isSubmittingUrl ? "Fetching..." : "Fetch & parse"}
                        </button>

                        <label htmlFor="wa-file-upload" style={{ marginTop: "12px" }}>
                          WhatsApp Export (.txt / .zip)
                        </label>
                        <div className="admin-file-upload">
                          <input
                            id="wa-file-upload"
                            ref={fileInputRef}
                            type="file"
                            accept=".txt,.zip"
                            className="admin-file-input"
                            onChange={(e) => setWaFile(e.target.files?.[0] || null)}
                          />
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            onClick={handleWhatsAppUpload}
                            disabled={isUploadingWa || !waFile}
                          >
                            {isUploadingWa ? "Uploading..." : "Upload & import"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {inboundFeedback && (
                      <div className="admin-feedback-box" role="status">
                        <p style={{ margin: 0 }}>{inboundFeedback}</p>
                      </div>
                    )}
                  </div>
                )}
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
                        {formatLlmStatsSummary(
                          lastRunStats.llmCalls,
                          lastRunStats.llmErrors ?? 0,
                          lastRunStats.llmErrorReasons,
                          lastRunStats.llmLastError
                        )}
                      </span>
                    )}
                    {lastSourceCounts && (
                      <span className="admin-sources-summary">
                        Sources: {Object.entries(lastSourceCounts).map(([k, v]) => `${k} (${v})`).join(", ")}
                      </span>
                    )}
                    {(() => {
                      if (!lastRunStats?.sources) return null;
                      const issues: string[] = [];
                      for (const [src, info] of Object.entries(lastRunStats.sources)) {
                        if (info.status === "error" || info.error) {
                          issues.push(`${src}: ${info.error || "error"}`);
                        } else if (info.status === "pending" || info.note) {
                          issues.push(`${src}: ${info.note || info.status}`);
                        }
                      }
                      if (issues.length === 0) return null;
                      return (
                        <span className="admin-source-issues" style={{ color: "var(--amber, #f59e0b)" }}>
                          Source issues: {issues.join("; ")}
                        </span>
                      );
                    })()}
                  </div>
                )}

                {/* Filters */}
                <div className="admin-filter-bar">
                  <div className="admin-view-filters" role="group" aria-label="Filter job views">
                    <button
                      type="button"
                      className={`btn filter-btn${viewFilter === "shortlist" ? " active" : ""}`}
                      onClick={() => {
                        setViewFilter("shortlist");
                        setReasonFilter("");
                      }}
                    >
                      Shortlist ({viewCounts.shortlist})
                    </button>
                    <button
                      type="button"
                      className={`btn filter-btn${viewFilter === "maybe" ? " active" : ""}`}
                      onClick={() => {
                        setViewFilter("maybe");
                        setReasonFilter("");
                      }}
                    >
                      Maybe ({viewCounts.maybe})
                    </button>
                    <button
                      type="button"
                      className={`btn filter-btn${viewFilter === "inbox" ? " active" : ""}`}
                      onClick={() => {
                        setViewFilter("inbox");
                        setReasonFilter("");
                      }}
                    >
                      Inbox ({viewCounts.inbox})
                    </button>
                    <button
                      type="button"
                      className={`btn filter-btn${viewFilter === "hidden" ? " active" : ""}`}
                      onClick={() => {
                        setViewFilter("hidden");
                        setReasonFilter("");
                      }}
                    >
                      Hidden ({viewCounts.hidden})
                    </button>
                    <button
                      type="button"
                      className={`btn filter-btn${viewFilter === "all" ? " active" : ""}`}
                      onClick={() => {
                        setViewFilter("all");
                        setReasonFilter("");
                      }}
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

                {viewFilter === "hidden" && (
                  <div className="admin-reason-chips" role="group" aria-label="Filter by hidden reason">
                    {HIDDEN_REASON_CHIPS.map((chip) => {
                      const count = viewCounts.reasons?.[chip.key] ?? 0;
                      const isActive = reasonFilter === chip.key;
                      return (
                        <button
                          key={chip.key}
                          type="button"
                          className={`reason-chip${isActive ? " active" : ""}`}
                          onClick={() => setReasonFilter(isActive ? "" : chip.key)}
                          aria-pressed={isActive}
                        >
                          <span className="reason-chip-label">{chip.label}</span>
                          <span className="reason-chip-count">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Error state */}
                {fetchError && (
                  <div className="admin-error-box" role="alert">
                    <p>{fetchError}</p>
                  </div>
                )}

                {outreachError && (
                  <div className="admin-error-box" role="alert">
                    <p><strong>Outreach error:</strong> {outreachError}</p>
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
                    {jobs.map((job) => {
                      const contactLink =
                        (job.raw as { contact_url?: string; contactUrl?: string } | null)?.contact_url ||
                        (job.raw as { contact_url?: string; contactUrl?: string } | null)?.contactUrl ||
                        job.contact_url ||
                        job.description?.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:linkedin\.com|example\.com)\/in\/[^\s\),]+/i)?.[0];

                      return (
                        <article key={job.id} className="admin-job-card" data-job-id={job.id}>
                          <div className="admin-job-top">
                            <div className="admin-job-main">
                              <h3 className="admin-job-title">{job.title}</h3>
                              <div className="admin-job-meta">
                                <span className="admin-job-company">{job.company}</span>
                                <span className="admin-meta-sep">•</span>
                                <span className="admin-job-source-tag">
                                  via <a href={job.url} target="_blank" rel="noopener noreferrer">{job.source}</a>
                                  {job.inbound_source && (
                                    <span className="admin-inbound-subtag"> ({job.inbound_source})</span>
                                  )}
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

                          {(viewFilter === "maybe" || (viewFilter === "all" && ((job.geo_eligibility === "unclear" && job.geo_reason?.startsWith("remote-unconfirmed:")) || (!hasRealDescription(job.description, job.title, job.company) && job.exp_class === "unclear" && ["worldwide", "india_ok"].includes(job.geo_eligibility))))) && (
                            <p className="admin-job-maybe-note">
                              {!hasRealDescription(job.description, job.title, job.company) && job.exp_class === "unclear"
                                ? getMissingDescriptionNote(job.source)
                                : "Remote, but India eligibility not stated - check before applying"}
                            </p>
                          )}

                          {viewFilter === "hidden" && job.filter_reason && (
                            <p className="admin-job-filter-reason">
                              <strong>Reason:</strong> {job.filter_reason}
                            </p>
                          )}

                          <details className="admin-job-details">
                            <summary>Read full description</summary>
                            <div className="admin-job-details-body">
                              <p className="admin-job-details-link">
                                Apply link:{" "}
                                <a href={job.apply_url || job.url} target="_blank" rel="noopener noreferrer">
                                  {shortLinkLabel(job.apply_url || job.url)}
                                </a>
                              </p>
                              <div className="admin-job-description">
                                {readableDescription(job.description) || "No description was saved for this job."}
                              </div>
                              {job.inbound_raw &&
                                readableDescription(job.inbound_raw).length > 0 &&
                                readableDescription(job.inbound_raw) !== readableDescription(job.description) && (
                                  <details className="admin-job-details-raw">
                                    <summary>Original message</summary>
                                    <div className="admin-job-description">{readableDescription(job.inbound_raw)}</div>
                                  </details>
                                )}
                            </div>
                          </details>

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
                              Apply ↗
                            </a>
                            {contactLink && (
                              <a
                                href={contactLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn ghost btn-sm admin-contact-btn"
                              >
                                Contact ↗
                              </a>
                            )}
                            <ContactFinder
                              jobId={job.id}
                              company={job.company}
                              postingEmail={job.contact_email}
                              onUse={handleUseContact}
                            />
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
                            {(viewFilter === "shortlist" || viewFilter === "maybe" || viewFilter === "inbox") && (
                              <>
                                <button
                                  type="button"
                                  className="btn ghost btn-sm admin-draft-outreach-btn"
                                  onClick={() => handleDraftOutreach(job.id)}
                                  disabled={draftingJobId === job.id}
                                >
                                  {draftingJobId === job.id ? "Drafting..." : "Draft outreach"}
                                </button>
                                <button
                                  type="button"
                                  className="btn ghost btn-sm admin-answer-question-btn"
                                  onClick={() => {
                                    if (answeringJobId === job.id) {
                                      setAnsweringJobId(null);
                                    } else {
                                      setAnsweringJobId(job.id);
                                      setQuestionText("");
                                      setPastedDescription("");
                                      setShowPastedDesc(false);
                                      setAnswerError(null);
                                    }
                                  }}
                                  aria-expanded={answeringJobId === job.id}
                                >
                                  {answeringJobId === job.id ? "Close answer panel" : "Answer a question"}
                                </button>
                              </>
                            )}
                          </div>

                          {answeringJobId === job.id && (
                            <div className="admin-answer-panel" aria-label="Generate application answer">
                              <div className="admin-answer-presets" role="group" aria-label="Question presets">
                                <span className="admin-answer-presets-label">Presets:</span>
                                {PRESET_QUESTIONS.map((q) => (
                                  <button
                                    key={q}
                                    type="button"
                                    className="btn ghost btn-sm preset-chip"
                                    onClick={() => setQuestionText(q)}
                                  >
                                    {q}
                                  </button>
                                ))}
                              </div>

                              <div className="admin-input-group" style={{ marginTop: "8px" }}>
                                <label htmlFor={`question-${job.id}`}>Application question (1 to 500 characters)</label>
                                <textarea
                                  id={`question-${job.id}`}
                                  className="admin-textarea"
                                  rows={3}
                                  maxLength={500}
                                  placeholder="e.g. What interests you about working for this company?"
                                  value={questionText}
                                  onChange={(e) => setQuestionText(e.target.value)}
                                />
                                <div className="admin-counter">{questionText.length} / 500 characters</div>
                              </div>

                              <div style={{ marginTop: "4px" }}>
                                <button
                                  type="button"
                                  className="btn ghost btn-sm"
                                  onClick={() => setShowPastedDesc(!showPastedDesc)}
                                  aria-expanded={showPastedDesc}
                                >
                                  {showPastedDesc
                                    ? "Hide full description"
                                    : "+ Paste the full job description (optional, improves the answer)"}
                                </button>
                                {showPastedDesc && (
                                  <div className="admin-input-group" style={{ marginTop: "6px" }}>
                                    <textarea
                                      id={`desc-${job.id}`}
                                      className="admin-textarea"
                                      rows={5}
                                      maxLength={6000}
                                      placeholder="Paste full job posting text here..."
                                      value={pastedDescription}
                                      onChange={(e) => setPastedDescription(e.target.value)}
                                    />
                                    <div className="admin-counter">{pastedDescription.length} / 6000 characters</div>
                                  </div>
                                )}
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                                <label htmlFor={`words-${job.id}`} style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                                  Word limit:
                                </label>
                                <select
                                  id={`words-${job.id}`}
                                  className="admin-select"
                                  value={maxWords}
                                  onChange={(e) => setMaxWords(Number(e.target.value))}
                                >
                                  <option value={60}>60 words</option>
                                  <option value={100}>100 words (default)</option>
                                  <option value={150}>150 words</option>
                                  <option value={200}>200 words</option>
                                </select>

                                <button
                                  type="button"
                                  className="btn primary btn-sm admin-generate-answer-btn"
                                  onClick={() => handleGenerateAnswer(job.id)}
                                  disabled={isGeneratingAnswer || !questionText.trim()}
                                >
                                  {isGeneratingAnswer ? "Generating answer..." : "Generate answer"}
                                </button>

                                <button
                                  type="button"
                                  className="btn ghost btn-sm"
                                  onClick={() => setAnsweringJobId(null)}
                                >
                                  Cancel
                                </button>
                              </div>

                              {answerError && (
                                <div className="admin-error-box" role="alert" style={{ marginTop: "8px" }}>
                                  <p style={{ margin: 0 }}>{answerError}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "settings" && (
              <div className="admin-connections-section" aria-label="Connections settings">
                <div className="admin-connections-grid">
                  {/* LinkedIn */}
                  <div className="admin-connection-card">
                    <div className="admin-connection-header">
                      <h3 className="admin-connection-title">LinkedIn (Apify)</h3>
                      <span className="admin-connection-badge ready">Ready</span>
                    </div>
                    <p className="admin-connection-desc">
                      Automated search for early-career software engineer posts & listings via Apify actor.
                    </p>
                    <div className="admin-connection-hint">
                      Requires APIFY_API_TOKEN in server environment.
                    </div>
                  </div>

                  {/* Groq LLM */}
                  <div className="admin-connection-card">
                    <div className="admin-connection-header">
                      <h3 className="admin-connection-title">Groq LLM</h3>
                      <span className="admin-connection-badge ready">Active</span>
                    </div>
                    <p className="admin-connection-desc">
                      Powers job triage classification and candidate outreach drafts.
                    </p>
                    <div className="admin-connection-hint" style={{ marginBottom: "12px" }}>
                      Requires GROQ_API_KEY in server environment.
                    </div>
                    <div>
                      <button
                        type="button"
                        className="btn primary btn-sm"
                        onClick={handleTestGroqModels}
                        disabled={isTestingGroq}
                      >
                        {isTestingGroq ? "Testing models..." : "Test Groq models"}
                      </button>
                    </div>
                    {groqTestResults && (
                      <div className="admin-feedback-box" role="status" style={{ marginTop: "12px" }}>
                        <p style={{ margin: "0 0 6px 0" }}>
                          <strong>Triage ({groqTestResults.triage.model}):</strong>{" "}
                          {groqTestResults.triage.status === "ok" ? "OK" : groqTestResults.triage.error}
                        </p>
                        <p style={{ margin: 0 }}>
                          <strong>Outreach ({groqTestResults.outreach.model}):</strong>{" "}
                          {groqTestResults.outreach.status === "ok" ? "OK" : groqTestResults.outreach.error}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Gmail IMAP */}
                  <div className="admin-connection-card">
                    <div className="admin-connection-header">
                      <h3 className="admin-connection-title">Gmail Alert Ingestion</h3>
                      <span className="admin-connection-badge ready">Ready</span>
                    </div>
                    <p className="admin-connection-desc">
                      Read-only IMAP scanner for job alert emails from LinkedIn, Indeed, Glassdoor, Instahyre, and Wellfound.
                    </p>
                    <div className="admin-connection-hint">
                      Requires GMAIL_IMAP_USER & GMAIL_IMAP_APP_PASSWORD (Google App Password).
                    </div>
                  </div>

                  {/* Telegram */}
                  <div className="admin-connection-card">
                    <div className="admin-connection-header">
                      <h3 className="admin-connection-title">Telegram Bot Webhook</h3>
                      <span className="admin-connection-badge ready">Ready</span>
                    </div>
                    <p className="admin-connection-desc">
                      Forward job links or messages to your personal Telegram bot with webhook verification.
                    </p>
                    <div className="admin-connection-hint">
                      Register via <code>node scripts/telegram-webhook.mjs set &lt;url&gt;</code>. Send <code>/whoami</code> to get chat ID.
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <div className="admin-connection-card">
                    <div className="admin-connection-header">
                      <h3 className="admin-connection-title">WhatsApp Import</h3>
                      <span className="admin-connection-badge ready">Active</span>
                    </div>
                    <p className="admin-connection-desc">
                      Upload chat export archives (.txt or .zip). Automatically strips PII and phone numbers.
                    </p>
                    <div className="admin-connection-hint">
                      Use the &quot;Add jobs&quot; panel on the Jobs tab to import anytime.
                    </div>
                  </div>

                  {/* Custom Boards Manager */}
                  <div className="admin-custom-boards-card">
                    <div className="admin-connection-header">
                      <h3 className="admin-connection-title">Custom Company Boards</h3>
                      <span className="admin-connection-badge">
                        {customBoards.length} custom board{customBoards.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="admin-connection-desc">
                      Monitor Greenhouse, Lever, and Ashby job boards of specific target companies alongside verified boards.
                    </p>

                    <div className="admin-board-form">
                      <label htmlFor="board-kind-select" className="sr-only">Platform</label>
                      <select
                        id="board-kind-select"
                        className="admin-select"
                        value={newBoardKind}
                        onChange={(e) => setNewBoardKind(e.target.value as "greenhouse" | "lever" | "ashby")}
                      >
                        <option value="greenhouse">Greenhouse</option>
                        <option value="lever">Lever</option>
                        <option value="ashby">Ashby</option>
                      </select>

                      <label htmlFor="board-slug-input" className="sr-only">Board Slug</label>
                      <input
                        id="board-slug-input"
                        type="text"
                        className="admin-input"
                        placeholder="board slug (e.g. figma)"
                        value={newBoardSlug}
                        onChange={(e) => setNewBoardSlug(e.target.value)}
                      />

                      <label htmlFor="board-label-input" className="sr-only">Label</label>
                      <input
                        id="board-label-input"
                        type="text"
                        className="admin-input"
                        placeholder="label (e.g. Figma)"
                        value={newBoardLabel}
                        onChange={(e) => setNewBoardLabel(e.target.value)}
                      />

                      <button
                        type="button"
                        className="btn primary btn-sm"
                        onClick={handleAddBoard}
                        disabled={isAddingBoard || !newBoardSlug.trim()}
                      >
                        {isAddingBoard ? "Verifying..." : "Add board"}
                      </button>
                    </div>

                    {boardFeedback && (
                      <div className="admin-feedback-box" role="status">
                        <p style={{ margin: 0 }}>{boardFeedback}</p>
                      </div>
                    )}

                    {customBoards.length > 0 ? (
                      <div className="admin-board-list" aria-label="Active custom boards">
                        {customBoards.map((b) => (
                          <div key={b.id} className="admin-board-item">
                            <div className="admin-board-info">
                              <span className="admin-board-kind">{b.kind}</span>
                              <span className="admin-board-slug">{b.slug}</span>
                              {b.label && <span className="admin-board-label">({b.label})</span>}
                            </div>
                            <button
                              type="button"
                              className="btn ghost btn-sm btn-danger"
                              onClick={() => handleDeleteBoard(b.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="admin-connection-hint" style={{ margin: 0 }}>No custom boards added yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "messages" && (
              <div className="admin-drafts-section" aria-label="Messages review queue">
                <div className="admin-notice-banner" role="note">
                  Approve a draft, then use Send email to send it from Gmail. Copy and Open in Gmail are there if you prefer to send it yourself.
                </div>

                <div className="admin-mode-bar">
                  <label htmlFor="email-mode-select" className="admin-mode-label">Email look</label>
                  <select
                    id="email-mode-select"
                    className="admin-select"
                    value={emailMode}
                    onChange={(e) => setEmailMode(e.target.value as EmailMode)}
                  >
                    <option value="plain">Plain text (best for first contact)</option>
                    <option value="light">Light: text with a neat signature</option>
                    <option value="full">Full: card with Experience and Projects</option>
                  </select>
                  <span className="admin-mode-hint">
                    {emailMode === "plain" && "Plain text, no styling. Least likely to reach spam."}
                    {emailMode === "light" && "Plain text style, plus a signature with icon links."}
                    {emailMode === "full" && "The complete card. Better after someone has replied."}
                  </span>
                  <label className="admin-mode-check">
                    <input type="checkbox" checked={trackVisits} onChange={(e) => setTrackVisits(e.target.checked)} />
                    Track portfolio visits
                  </label>
                </div>

                <div className="admin-drafts-header-bar">
                  <div className="admin-view-filters" role="group" aria-label="Filter drafts by status">
                    <button
                      type="button"
                      className={`admin-filter-btn${draftFilter === "all" ? " active" : ""}`}
                      onClick={() => setDraftFilter("all")}
                    >
                      All ({draftCounts.all})
                    </button>
                    <button
                      type="button"
                      className={`admin-filter-btn${draftFilter === "draft" ? " active" : ""}`}
                      onClick={() => setDraftFilter("draft")}
                    >
                      Draft ({draftCounts.draft})
                    </button>
                    <button
                      type="button"
                      className={`admin-filter-btn${draftFilter === "approved" ? " active" : ""}`}
                      onClick={() => setDraftFilter("approved")}
                    >
                      Approved ({draftCounts.approved})
                    </button>
                    <button
                      type="button"
                      className={`admin-filter-btn${draftFilter === "discarded" ? " active" : ""}`}
                      onClick={() => setDraftFilter("discarded")}
                    >
                      Discarded ({draftCounts.discarded})
                    </button>
                  </div>
                  <div className="admin-budget-pill">
                    Drafts: {draftCounts.draft} &middot; Answers today: {answersToday}/20
                  </div>
                  {draftCounts.approved > 0 &&
                    (confirmSendAll ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.85rem" }}>Send up to 10 approved emails now? The daily limit applies.</span>
                        <button type="button" className="btn primary btn-sm admin-send-all-confirm-btn" onClick={handleSendAll}>
                          Confirm
                        </button>
                        <button type="button" className="btn ghost btn-sm" onClick={() => setConfirmSendAll(false)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost btn-sm admin-send-all-btn"
                        onClick={() => setConfirmSendAll(true)}
                        disabled={isSendingAll}
                      >
                        {isSendingAll ? "Sending..." : "Send all approved"}
                      </button>
                    ))}
                </div>

                {focusedJobId && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "12px 0" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Filtered to single job</span>
                    <button
                      type="button"
                      className="btn ghost btn-sm"
                      onClick={() => setFocusedJobId(null)}
                    >
                      Show all jobs
                    </button>
                  </div>
                )}

                {sendToast && (
                  <div className="admin-toast" role="status" style={{ marginBottom: "16px" }}>
                    {sendToast}
                  </div>
                )}

                {outreachError && (
                  <div className="admin-error-box" role="alert" style={{ marginBottom: "16px" }}>
                    <p style={{ margin: 0 }}><strong>Outreach error:</strong> {outreachError}</p>
                  </div>
                )}

                {isLoadingDrafts && (
                  <div className="admin-loading-indicator">
                    <p>Loading outreach drafts...</p>
                  </div>
                )}

                {!isLoadingDrafts && drafts.length === 0 && (
                  <div className="admin-empty-card">
                    <h3>No messages to review</h3>
                    <p>Select any job card from Shortlist, Maybe, or Inbox and click &apos;Draft outreach&apos; to generate personalized messages.</p>
                  </div>
                )}

                {!isLoadingDrafts && drafts.length > 0 && (
                  <div className="admin-drafts-container">
                    {Array.from(
                      drafts.reduce((acc, draft) => {
                        let g = acc.get(draft.job_id);
                        if (!g) {
                          g = {
                            jobId: draft.job_id,
                            jobTitle: draft.job_title || "Untitled Role",
                            jobCompany: draft.job_company || "Company",
                            jobUrl: draft.job_url,
                            drafts: [],
                          };
                          acc.set(draft.job_id, g);
                        }
                        g.drafts.push(draft);
                        return acc;
                      }, new Map<string, { jobId: string; jobTitle: string; jobCompany: string; jobUrl?: string; drafts: OutreachDraft[] }>()).values()
                    ).map((group) => (
                      <div key={group.jobId} className="admin-draft-group" data-job-id={group.jobId}>
                        <div className="admin-draft-group-header">
                          <div>
                            <h3 className="admin-draft-job-title">{group.jobTitle}</h3>
                            <div className="admin-draft-job-meta">
                              <span>{group.jobCompany}</span>
                              {group.jobUrl && (
                                <>
                                  <span>•</span>
                                  <a href={group.jobUrl} target="_blank" rel="noopener noreferrer">
                                    Source listing <Ico name="external" />
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn ghost btn-sm admin-regenerate-btn"
                            onClick={() => handleDraftOutreach(group.jobId)}
                            disabled={draftingJobId === group.jobId}
                          >
                            {draftingJobId === group.jobId ? "Regenerating..." : "Regenerate"}
                          </button>
                        </div>

                        <div className="admin-drafts-grid">
                          {group.drafts.map((draft) => {
                            const kindLabel =
                              draft.kind === "email"
                                ? "Cold email"
                                : draft.kind === "linkedin_note"
                                ? "LinkedIn note"
                                : draft.kind === "linkedin_dm"
                                ? "LinkedIn DM"
                                : "Application answer";

                            const currentSubject =
                              editingDrafts[draft.id]?.subject !== undefined
                                ? editingDrafts[draft.id].subject
                                : (draft.subject || "");
                            const currentBody =
                              editingDrafts[draft.id]?.body !== undefined
                                ? editingDrafts[draft.id].body
                                : draft.body;
                            const currentRecipient =
                              editingDrafts[draft.id]?.recipient !== undefined
                                ? editingDrafts[draft.id].recipient
                                : (draft.recipient || "");

                            const isEmail = draft.kind === "email";
                            const emailWords = currentBody.trim().split(/\s+/).filter(Boolean).length;
                            const isEmailWordWarn = isEmail && (emailWords < 90 || emailWords > 150);

                            const isNote = draft.kind === "linkedin_note";
                            const isNoteCharWarn = isNote && currentBody.length > 280;

                            const isDm = draft.kind === "linkedin_dm";
                            const isDmCharWarn = isDm && currentBody.length > 500;

                            const isSubjectWarn = isEmail && (currentSubject?.length || 0) > 70;

                            const hasEdits =
                              editingDrafts[draft.id] !== undefined &&
                              (editingDrafts[draft.id].body !== draft.body ||
                                (draft.subject !== null &&
                                  editingDrafts[draft.id].subject !== draft.subject) ||
                                (draft.recipient !== null &&
                                  editingDrafts[draft.id].recipient !== draft.recipient));

                            return (
                              <article key={draft.id} className="admin-draft-card" data-draft-id={draft.id}>
                                <div className="admin-draft-card-header">
                                  <div className="admin-draft-badges">
                                    <span className="badge-kind">{kindLabel}</span>
                                    <span className={`badge-status ${draft.status}`}>{draft.status}</span>
                                    {draft.edited && <span className="badge-edited">Edited</span>}
                                    {draft.sent_at && (
                                      <span className="badge-sent">
                                        Sent {new Date(draft.sent_at).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="admin-draft-visits-meta">
                                    {draftVisitsByJob[draft.job_id]?.count ? (
                                      <span className="badge-visit-count">
                                        Visited {draftVisitsByJob[draft.job_id].count} time{draftVisitsByJob[draft.job_id].count === 1 ? "" : "s"}{draftVisitsByJob[draft.job_id].lastVisitAt ? `, last ${formatRelativeTime(draftVisitsByJob[draft.job_id].lastVisitAt!)}` : ""}
                                      </span>
                                    ) : (
                                      <span className="badge-visit-zero">0 visits yet</span>
                                    )}
                                  </div>
                                </div>

                                {draft.kind === "application_answer" && draft.question && (
                                  <div className="admin-draft-question">
                                    <span className="admin-draft-question-label">Question</span>
                                    <p className="admin-draft-question-text">{draft.question}</p>
                                  </div>
                                )}

                                {isEmail && (
                                  <div className="admin-draft-field">
                                    <label htmlFor={`recipient-${draft.id}`}>Recipient email (optional)</label>
                                    <input
                                      id={`recipient-${draft.id}`}
                                      type="email"
                                      className="admin-input"
                                      placeholder="recruiter@example.com"
                                      value={currentRecipient || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEditingDrafts((prev) => ({
                                          ...prev,
                                          [draft.id]: {
                                            ...prev[draft.id],
                                            recipient: val,
                                            body:
                                              prev[draft.id]?.body !== undefined
                                                ? prev[draft.id].body
                                                : draft.body,
                                          },
                                        }));
                                      }}
                                    />
                                  </div>
                                )}

                                {isEmail && (
                                  <div className="admin-draft-field">
                                    <label htmlFor={`subject-${draft.id}`}>Subject</label>
                                    <input
                                      id={`subject-${draft.id}`}
                                      type="text"
                                      className="admin-input"
                                      value={currentSubject || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEditingDrafts((prev) => ({
                                          ...prev,
                                          [draft.id]: {
                                            ...prev[draft.id],
                                            subject: val,
                                            body:
                                              prev[draft.id]?.body !== undefined
                                                ? prev[draft.id].body
                                                : draft.body,
                                          },
                                        }));
                                      }}
                                    />
                                    <div className={`admin-counter ${isSubjectWarn ? "warn" : ""}`}>
                                      {(currentSubject?.length || 0)} / 70 characters
                                    </div>
                                  </div>
                                )}

                                <div className="admin-draft-field">
                                  <label htmlFor={`body-${draft.id}`}>Body</label>
                                  <textarea
                                    id={`body-${draft.id}`}
                                    className="admin-textarea"
                                    rows={isEmail ? 8 : 4}
                                    value={currentBody}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditingDrafts((prev) => ({
                                        ...prev,
                                        [draft.id]: {
                                          ...prev[draft.id],
                                          subject:
                                            prev[draft.id]?.subject !== undefined
                                              ? prev[draft.id].subject
                                              : (draft.subject || undefined),
                                          body: val,
                                        },
                                      }));
                                    }}
                                  />
                                  <div
                                    className={`admin-counter ${
                                      isEmailWordWarn || isNoteCharWarn || isDmCharWarn ? "warn" : ""
                                    }`}
                                  >
                                    {isEmail && `Word count: ${emailWords} (target 90-150 words)`}
                                    {isNote && `${currentBody.length} / 280 characters`}
                                    {isDm && `${currentBody.length} / 500 characters`}
                                    {draft.kind === "application_answer" && `Word count: ${emailWords}`}
                                  </div>
                                </div>

                                <div className="admin-draft-card-actions">
                                  <button
                                    type="button"
                                    className="btn ghost btn-sm admin-copy-btn"
                                    onClick={() => handleCopyDraft(draft)}
                                  >
                                    <Ico name="copy" />
                                    Copy
                                  </button>
                                  {isEmail && (
                                    <button
                                      type="button"
                                      className="btn ghost btn-sm admin-copy-formatted-btn"
                                      onClick={() => handleCopyFormatted(draft)}
                                    >
                                      <Ico name="copy" />
                                      Copy formatted
                                    </button>
                                  )}
                                  {isEmail && (currentRecipient || "").trim() !== "" && (
                                    <a
                                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(currentRecipient || "")}&su=${encodeURIComponent(currentSubject || "")}&body=${encodeURIComponent(currentBody)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn ghost btn-sm admin-gmail-btn"
                                    >
                                      <Ico name="gmail" />
                                      Open in Gmail
                                    </a>
                                  )}
                                  {!draft.sent_at && (
                                    <button
                                      type="button"
                                      className="btn ghost btn-sm admin-mark-sent-btn"
                                      onClick={() => handleMarkSent(draft)}
                                    >
                                      <Ico name="check" />
                                      Mark sent
                                    </button>
                                  )}
                                  {isEmail &&
                                    draft.status !== "discarded" &&
                                    !draft.sent_at &&
                                    (currentRecipient || "").trim() !== "" &&
                                    (confirmSendId === draft.id ? (
                                      <>
                                        <button
                                          type="button"
                                          className="btn primary btn-sm admin-send-confirm-btn"
                                          onClick={() =>
                                            handleSendDraft(
                                              draft,
                                              draft.status !== "approved" || hasEdits
                                                ? { subject: currentSubject || "", body: currentBody, recipient: currentRecipient || "" }
                                                : undefined
                                            )
                                          }
                                        >
                                          Confirm send to {currentRecipient}
                                        </button>
                                        <button type="button" className="btn ghost btn-sm" onClick={() => setConfirmSendId(null)}>
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn primary btn-sm admin-send-btn"
                                        onClick={() => setConfirmSendId(draft.id)}
                                        disabled={sendingDraftId === draft.id}
                                      >
                                        <Ico name="send" />
                                        {sendingDraftId === draft.id
                                          ? "Sending..."
                                          : draft.status !== "approved" || hasEdits
                                            ? "Approve and send email"
                                            : "Send email"}
                                      </button>
                                    ))}
                                  <button
                                    type="button"
                                    className="btn primary btn-sm admin-approve-btn"
                                    onClick={() =>
                                      handleUpdateDraft(draft.id, {
                                        status: "approved",
                                        subject: isEmail ? currentSubject : undefined,
                                        body: currentBody,
                                        recipient: isEmail ? currentRecipient : undefined,
                                      })
                                    }
                                    disabled={savingDraftId === draft.id}
                                  >
                                    {draft.status === "approved" && !hasEdits ? "Approved" : "Approve"}
                                  </button>
                                  {hasEdits && (
                                    <button
                                      type="button"
                                      className="btn ghost btn-sm admin-save-btn"
                                      onClick={() =>
                                        handleUpdateDraft(draft.id, {
                                          subject: isEmail ? currentSubject : undefined,
                                          body: currentBody,
                                          recipient: isEmail ? currentRecipient : undefined,
                                        })
                                      }
                                      disabled={savingDraftId === draft.id}
                                    >
                                      Save edits
                                    </button>
                                  )}
                                  {draft.status !== "discarded" && (
                                    <button
                                      type="button"
                                      className="btn ghost btn-sm btn-danger admin-discard-btn"
                                      onClick={() => handleUpdateDraft(draft.id, { status: "discarded" })}
                                      disabled={savingDraftId === draft.id}
                                    >
                                      Discard
                                    </button>
                                  )}
                                  {draft.kind === "application_answer" && (
                                    <button
                                      type="button"
                                      className="btn ghost btn-sm admin-regenerate-answer-btn"
                                      onClick={() => handleRegenerateAnswer(draft)}
                                      disabled={isGeneratingAnswer}
                                    >
                                      {isGeneratingAnswer ? "Regenerating..." : "Regenerate answer"}
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "pipeline" && (
              <div className="admin-pipeline-section" aria-label="Pipeline stages">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                  <div className="admin-notice-banner" role="note" style={{ flex: 1, margin: 0 }}>
                    Track applications and replies here. Use Check replies now after you send outreach.
                  </div>
                  <button
                    type="button"
                    className="btn ghost btn-sm admin-check-replies-btn"
                    onClick={handleCheckRepliesNow}
                    disabled={isCheckingReplies}
                  >
                    {isCheckingReplies ? "Checking replies..." : "Check replies now"}
                  </button>
                </div>

                {replyCheckToast && (
                  <div className="admin-toast" role="status" style={{ marginBottom: "16px" }}>
                    {replyCheckToast}
                  </div>
                )}

                {isLoadingPipeline && (
                  <div className="admin-loading-indicator">
                    <p>Loading pipeline...</p>
                  </div>
                )}

                {pipelineError && (
                  <div className="admin-error-box" role="alert">
                    <p>{pipelineError}</p>
                  </div>
                )}

                {!isLoadingPipeline && !pipelineError && pipelineJobs.length === 0 && (
                  <div className="admin-empty-card">
                    <h3>Pipeline is clear</h3>
                    <p>Roles you mark applied or outreach drafts you mark sent will appear here.</p>
                  </div>
                )}

                {!isLoadingPipeline && !pipelineError && pipelineJobs.length > 0 && (
                  <div className="admin-pipeline-list" role="feed" aria-label="Pipeline job listings">
                    {pipelineJobs.map((item) => {
                      const isFollowUp =
                        item.daysSinceSent >= 5 &&
                        item.status !== "replied" &&
                        item.status !== "interview" &&
                        item.status !== "offer";

                      const formattedChannels =
                        item.channels.length > 0
                          ? item.channels
                              .map((c) =>
                                c === "email"
                                  ? "Email"
                                  : c === "linkedin_note"
                                  ? "LinkedIn note"
                                  : c === "linkedin_dm"
                                  ? "LinkedIn DM"
                                  : c === "application_answer"
                                  ? "Application answer"
                                  : c
                              )
                              .join(" + ")
                          : "Manual application";

                      return (
                        <article key={item.id} className="admin-pipeline-card" data-pipeline-id={item.id}>
                          <div className="admin-pipeline-card-top">
                            <div>
                              <h3 className="admin-draft-job-title">
                                <a href={item.url} target="_blank" rel="noopener noreferrer">
                                  {item.title} ↗
                                </a>
                              </h3>
                              {(item.recipient || item.contactName) && (
                                <p className="admin-pipeline-to">
                                  To: {item.contactName ? `${item.contactName} ` : ""}
                                  {item.recipient ? `<${item.recipient}>` : ""}
                                  {item.subject ? ` · ${item.subject}` : ""}
                                </p>
                              )}
                              {item.bouncedAt && (
                                <p className="admin-pipeline-bounce" role="status">
                                  Bounced: this address does not exist. Find another contact for this job.
                                </p>
                              )}
                              <div className="admin-pipeline-meta">
                                <span>{item.company}</span>
                                <span>•</span>
                                <span>Channels: {formattedChannels}</span>
                                <span>•</span>
                                <span>Sent: {new Date(item.sentAt).toLocaleDateString()}</span>
                                <span>•</span>
                                <span>{item.daysSinceSent}d since sent</span>
                                <span>•</span>
                                {item.visitCount ? (
                                  <span className="badge-visit-count">
                                    Visited {item.visitCount} time{item.visitCount === 1 ? "" : "s"}{item.lastVisitAt ? `, last ${formatRelativeTime(item.lastVisitAt)}` : ""}
                                  </span>
                                ) : (
                                  <span className="badge-visit-zero">0 visits yet</span>
                                )}
                              </div>
                            </div>

                            <div className="admin-pipeline-badges">
                              {hasOpenPossibleReply(item) && (
                                <div className="badge-possible-reply" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px" }}>
                                  <span>Possible reply, confirm</span>
                                  <button
                                    type="button"
                                    className="btn primary btn-sm"
                                    style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                                    onClick={() => handlePipelineStatus(item.id, "replied")}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="btn ghost btn-sm"
                                    style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                                    onClick={() => handleDismissPossibleReply(item.id)}
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              )}
                              <span className={`badge-status ${item.status}`}>{item.status}</span>
                              {isFollowUp && <span className="badge-followup">Follow up</span>}
                            </div>
                          </div>

                          <div className="admin-pipeline-actions">
                            <span style={{ fontSize: "0.8rem", color: "var(--muted)", marginRight: "4px" }}>
                              Status:
                            </span>
                            <button
                              type="button"
                              className={`btn ${item.status === "replied" ? "primary" : "ghost"} btn-sm`}
                              onClick={() => handlePipelineStatus(item.id, "replied")}
                            >
                              Mark replied
                            </button>
                            <button
                              type="button"
                              className={`btn ${item.status === "interview" ? "primary" : "ghost"} btn-sm`}
                              onClick={() => handlePipelineStatus(item.id, "interview")}
                            >
                              Interview
                            </button>
                            <button
                              type="button"
                              className={`btn ${item.status === "offer" ? "primary" : "ghost"} btn-sm`}
                              onClick={() => handlePipelineStatus(item.id, "offer")}
                            >
                              Offer
                            </button>
                            <button
                              type="button"
                              className={`btn ${item.status === "rejected" ? "primary" : "ghost"} btn-sm btn-danger`}
                              onClick={() => handlePipelineStatus(item.id, "rejected")}
                            >
                              Rejected
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "answers" && <AnswerStudio />}

            {activeTab === "visits" && (
              <div className="admin-visits-section" aria-label="Privacy-preserving visits">
                {isLoadingVisits && (
                  <div className="admin-loading-indicator">
                    <p>Loading visits...</p>
                  </div>
                )}

                {!isLoadingVisits && visitsList.length === 0 && (
                  <div className="admin-empty-card">
                    <h3>No visits recorded</h3>
                    <p>Visits with referral tags and device types will show here with zero cookies or tracking.</p>
                  </div>
                )}

                {!isLoadingVisits && visitsList.length > 0 && (
                  <div className="admin-visits-table-wrapper" style={{ overflowX: "auto" }}>
                    <table className="admin-visits-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                          <th style={{ padding: "8px 12px" }}>Code</th>
                          <th style={{ padding: "8px 12px" }}>Job / Company</th>
                          <th style={{ padding: "8px 12px" }}>Time</th>
                          <th style={{ padding: "8px 12px" }}>Type</th>
                          <th style={{ padding: "8px 12px" }}>Country</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitsList.map((v, idx) => (
                          <tr key={`${v.code}-${v.visited_at}-${idx}`} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>/r/{v.code}</td>
                            <td style={{ padding: "8px 12px" }}>{v.job_title ? `${v.job_title} (${v.job_company || "Unknown"})` : "Unknown draft"}</td>
                            <td style={{ padding: "8px 12px" }}>{new Date(v.visited_at).toLocaleString()}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <span className={`badge-visit-type ${v.is_bot ? "bot" : "human"}`}>
                                {v.is_bot ? "Crawler / Bot" : "Human"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px" }}>{v.country || "n/a"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab !== "jobs" && activeTab !== "settings" && activeTab !== "messages" && activeTab !== "pipeline" && activeTab !== "visits" && (
              <div className="admin-empty-card">
                <h3>{currentTab.emptyHeading}</h3>
                <p>{currentTab.emptyText}</p>
              </div>
            )}

            {copyToast && (
              <div className="admin-toast" role="status">
                {copyToast}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
