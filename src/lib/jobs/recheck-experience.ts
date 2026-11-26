import type { JobsRepository } from "./repository";
import type { LlmProvider } from "../llm/types";
import { judgeExperience, experienceFilterReason } from "../llm/experience-judge";

export interface RecheckResult {
  checked: number;
  hidden: number;
  remaining: number;
  error?: string;
}

/**
 * Reads saved jobs that are still visible and lets the LLM decide if a fresher can apply.
 * Jobs that need experience are hidden with the reason. Every checked job is marked so it is not read twice.
 */
export async function recheckExperience(opts: {
  repo: JobsRepository;
  provider: LlmProvider;
  limit?: number;
  deadlineMs?: number;
  now?: () => number;
}): Promise<RecheckResult> {
  const { repo, provider } = opts;
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.deadlineMs ?? 40000);
  if (!repo.listJobsToJudge || !repo.applyExperienceVerdict || !repo.countJobsToJudge) {
    return { checked: 0, hidden: 0, remaining: 0, error: "not supported by this repository" };
  }

  const jobs = await repo.listJobsToJudge(opts.limit ?? 25);
  let checked = 0;
  let hidden = 0;
  let failures = 0;
  let error: string | undefined;

  for (const job of jobs) {
    if (now() >= deadline) break;
    const verdict = await judgeExperience(
      { title: job.title, company: job.company, description: job.description || "" },
      provider
    );
    if (!verdict) {
      failures++;
      error = provider.lastError || "The AI did not answer";
      if (failures >= 3) break;
      continue;
    }
    failures = 0;
    const hide = verdict.forFresher === "no";
    await repo.applyExperienceVerdict(job.id, {
      forFresher: verdict.forFresher,
      minYears: verdict.minYears,
      filterReason: hide ? experienceFilterReason(verdict) : null,
    });
    checked++;
    if (hide) hidden++;
  }

  return { checked, hidden, remaining: await repo.countJobsToJudge(), error };
}
