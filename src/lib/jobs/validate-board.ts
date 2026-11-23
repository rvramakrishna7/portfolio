import { USER_AGENT } from "./types";

export interface ValidateBoardResult {
  valid: boolean;
  error?: string;
}

export async function validateBoardSlug(
  kind: "greenhouse" | "lever" | "ashby",
  slug: string,
  fetchFn: typeof fetch = fetch
): Promise<ValidateBoardResult> {
  const cleanSlug = slug.trim().toLowerCase();
  let checkUrl = "";

  if (kind === "greenhouse") {
    checkUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(cleanSlug)}/jobs`;
  } else if (kind === "lever") {
    checkUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(cleanSlug)}?mode=json`;
  } else if (kind === "ashby") {
    checkUrl = `https://jobs.ashbyhq.com/api/posting-api/job-board/${encodeURIComponent(cleanSlug)}`;
  } else {
    return { valid: false, error: `Unsupported board platform: ${kind}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetchFn(checkUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.status === 404) {
      return { valid: false, error: `Board not found on ${kind}` };
    }

    // 200, or some auth/rate limited responses are considered valid board instances
    return { valid: true };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return {
      valid: false,
      error: `Failed to verify board: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
