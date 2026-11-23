import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "../../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../../lib/admin/origin";
import { safeFetch } from "../../../../../lib/inbound/safe-fetch";
import { parseInboundCandidates, processAndIngestInboundCandidates } from "../../../../../lib/inbound/parse";
import { getJobsRepository } from "../../../../../lib/jobs/repository";

export const dynamic = "force-dynamic";

const NOINDEX_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Type": "application/json",
};

const PasteSchema = z.object({
  text: z.string().max(50000).optional(),
  url: z.string().url().max(2000).optional(),
}).refine((data) => data.text?.trim() || data.url?.trim(), {
  message: "Either 'text' or 'url' must be provided",
});

export async function POST(req: NextRequest) {
  // 1. Authenticate admin
  const auth = requireAdminApi(req);
  if (auth.errorResponse) return auth.errorResponse;

  // 2. Verify origin
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden: invalid origin" },
      { status: 403, headers: NOINDEX_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NOINDEX_HEADERS }
    );
  }

  const parsed = PasteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400, headers: NOINDEX_HEADERS }
    );
  }

  const { text, url } = parsed.data;
  let contentToParse = "";

  if (url) {
    const fetchRes = await safeFetch(url);
    if (!fetchRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${fetchRes.error || "Unknown error"}` },
        { status: 400, headers: NOINDEX_HEADERS }
      );
    }
    contentToParse = fetchRes.body;
  } else if (text) {
    contentToParse = text;
  }

  const repo = getJobsRepository();
  const candidates = parseInboundCandidates(contentToParse, { source: "pasted" });

  if (candidates.length === 0) {
    return NextResponse.json(
      { jobs: [], added: 0, duplicates: 0, filtered: 0 },
      { headers: NOINDEX_HEADERS }
    );
  }

  const ingestRes = await processAndIngestInboundCandidates(candidates, repo);

  return NextResponse.json(
    {
      jobs: ingestRes.jobs,
      added: ingestRes.added,
      duplicates: ingestRes.duplicates,
      filtered: ingestRes.filtered,
    },
    { headers: NOINDEX_HEADERS }
  );
}
