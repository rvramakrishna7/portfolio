// Hunter.io client (server side only). The API key stays in HUNTER_API_KEY and is never sent to the browser.
// Credit use: Domain Search 1 per email found (we cap results), Email Finder 1, Email Verifier 0.5.
// Docs: https://hunter.io/api-documentation

const BASE = "https://api.hunter.io/v2";
const TIMEOUT_MS = 12000;

export interface HunterContact {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  department: string | null;
  confidence: number | null;
  linkedin: string | null;
  // What Hunter already knows: its own check of the address, and how many public web pages show it.
  // sources 0 means the address is a pattern guess, not something seen on the web.
  verification: VerifyStatus | null;
  sources: number;
}

export type VerifyStatus = "valid" | "invalid" | "accept_all" | "webmail" | "disposable" | "unknown";

export interface HunterResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  creditsLeft?: number | null;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function hasHunterKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.HUNTER_API_KEY && env.HUNTER_API_KEY.trim());
}

// Job company names are messy ("Acme Inc."). A domain is best; this cleans one if the owner typed a URL.
export function normalizeDomain(input: string): string | null {
  const raw = (input || "").trim().toLowerCase();
  if (!raw) return null;
  let host = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
  host = host.split(/[/?#]/)[0] ?? "";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
  return host;
}

const RECRUITING_WORDS = /(recruit|talent|hiring|people|hr\b|human resources|acquisition|founder|ceo|cto|head of|engineering manager|vp )/i;

function rankContact(c: HunterContact): number {
  let score = c.confidence ?? 0;
  const role = `${c.position ?? ""} ${c.department ?? ""}`;
  if (/recruit|talent|hiring|acquisition/i.test(role)) score += 100;
  else if (/\bhr\b|human resources|people/i.test(role)) score += 60;
  else if (/founder|ceo|cto|head of|engineering manager|vp /i.test(role)) score += 40;
  else if (RECRUITING_WORDS.test(role)) score += 20;
  return score;
}

async function call<T>(
  path: string,
  params: Record<string, string>,
  fetchImpl: FetchLike,
  env: NodeJS.ProcessEnv,
  parse: (json: unknown) => T
): Promise<HunterResult<T>> {
  const key = env.HUNTER_API_KEY?.trim();
  if (!key) return { ok: false, error: "HUNTER_API_KEY is not set" };
  const url = `${BASE}${path}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetchImpl(url, {
      headers: { "X-API-KEY": key, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const creditsHeader = res.headers.get("x-credits-left");
    const creditsLeft = creditsHeader !== null && creditsHeader !== "" && !Number.isNaN(Number(creditsHeader)) ? Number(creditsHeader) : null;
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Hunter rejected the API key", creditsLeft };
    if (res.status === 429) return { ok: false, error: "Hunter rate limit or monthly credits used up", creditsLeft };
    if (res.status === 404) return { ok: true, data: parse({}), creditsLeft };
    if (!res.ok) return { ok: false, error: `Hunter error (${res.status})`, creditsLeft };
    const json: unknown = await res.json();
    return { ok: true, data: parse(json), creditsLeft };
  } catch {
    return { ok: false, error: "Could not reach Hunter" };
  }
}

const KNOWN_STATUSES: VerifyStatus[] = ["valid", "invalid", "accept_all", "webmail", "disposable", "unknown"];

function toVerifyStatus(value: unknown): VerifyStatus | null {
  return KNOWN_STATUSES.includes(value as VerifyStatus) ? (value as VerifyStatus) : null;
}

function toContact(e: Record<string, unknown>): HunterContact | null {
  const email = typeof e.value === "string" ? e.value : typeof e.email === "string" ? e.email : null;
  if (!email) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    email: email.toLowerCase(),
    firstName: str(e.first_name),
    lastName: str(e.last_name),
    position: str(e.position),
    department: str(e.department),
    confidence: typeof e.confidence === "number" ? e.confidence : typeof e.score === "number" ? e.score : null,
    linkedin: str(e.linkedin),
    verification: toVerifyStatus((e.verification as { status?: unknown } | null | undefined)?.status),
    sources: Array.isArray(e.sources) ? e.sources.length : 0,
  };
}

// Domain Search: people at a company with a personal address. limit keeps credit use small.
export async function domainSearch(
  domain: string,
  opts: { limit?: number; fetchImpl?: FetchLike; env?: NodeJS.ProcessEnv } = {}
): Promise<HunterResult<HunterContact[]>> {
  const clean = normalizeDomain(domain);
  if (!clean) return { ok: false, error: "Enter the company website domain, like acme.com" };
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10);
  const r = await call<HunterContact[]>(
    "/domain-search",
    { domain: clean, type: "personal", limit: String(limit), department: "hr,executive,management" },
    opts.fetchImpl ?? fetch,
    opts.env ?? process.env,
    (json) => {
      const emails = ((json as { data?: { emails?: unknown[] } })?.data?.emails ?? []) as Record<string, unknown>[];
      return emails
        .map(toContact)
        .filter((c): c is HunterContact => c !== null)
        .sort((a, b) => rankContact(b) - rankContact(a))
        .slice(0, limit);
    }
  );
  return r;
}

// Email Finder: one person. Needs a domain plus a full name, or a LinkedIn handle.
export async function findEmail(
  input: { domain: string; fullName?: string; linkedinHandle?: string },
  opts: { fetchImpl?: FetchLike; env?: NodeJS.ProcessEnv } = {}
): Promise<HunterResult<HunterContact | null>> {
  const clean = normalizeDomain(input.domain);
  if (!clean) return { ok: false, error: "Enter the company website domain, like acme.com" };
  const params: Record<string, string> = { domain: clean };
  const handle = input.linkedinHandle?.trim();
  const name = (input.fullName || "").trim().replace(/\s+/g, " ");
  if (handle) {
    params.linkedin_handle = handle;
  } else if (name.includes(" ")) {
    params.full_name = name;
  } else {
    return { ok: false, error: "Enter the person's full name (first and last) or their LinkedIn profile link" };
  }
  return call<HunterContact | null>("/email-finder", params, opts.fetchImpl ?? fetch, opts.env ?? process.env, (json) => {
    const d = (json as { data?: Record<string, unknown> })?.data;
    if (!d || typeof d.email !== "string") return null;
    return toContact(d);
  });
}

// Pull the handle out of a LinkedIn profile link: https://www.linkedin.com/in/jane-doe-123/ -> jane-doe-123
export function linkedinHandleFromUrl(input: string): string | null {
  const m = (input || "").trim().match(/linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

// Email Verifier: protects the Gmail sender reputation. Anything not "valid" needs a human decision.
export async function verifyEmail(
  email: string,
  opts: { fetchImpl?: FetchLike; env?: NodeJS.ProcessEnv } = {}
): Promise<HunterResult<{ status: VerifyStatus; score: number | null }>> {
  const addr = (email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return { ok: false, error: "Invalid email format" };
  return call("/email-verifier", { email: addr }, opts.fetchImpl ?? fetch, opts.env ?? process.env, (json) => {
    const d = (json as { data?: { status?: string; score?: number } })?.data;
    const status = toVerifyStatus(d?.status) ?? "unknown";
    return { status, score: typeof d?.score === "number" ? d.score : null };
  });
}

// LinkedIn people search opened in the OWNER'S browser. We never fetch or scrape LinkedIn.
export function linkedinSearchUrl(company: string, role = "recruiter"): string {
  const q = `${role} ${company}`.trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}&origin=GLOBAL_SEARCH_HEADER`;
}
