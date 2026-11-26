import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "../../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../../lib/admin/origin";
import {
  domainSearch,
  findEmail,
  verifyEmail,
  hasHunterKey,
  linkedinHandleFromUrl,
  linkedinSearchUrl,
} from "../../../../../lib/outreach/hunter";

const HEADERS = { "X-Robots-Tag": "noindex, nofollow" };

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("company"), domain: z.string().min(3).max(200) }),
  z.object({
    action: z.literal("person"),
    domain: z.string().min(3).max(200),
    fullName: z.string().max(120).optional(),
    linkedinUrl: z.string().max(300).optional(),
  }),
  z.object({ action: z.literal("verify"), email: z.string().max(200) }),
]);

// Which lookups are available. Never returns the key itself.
export async function GET(req: Request) {
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) return errorResponse;
  const { searchParams } = new URL(req.url);
  const company = (searchParams.get("company") || "").slice(0, 120);
  return NextResponse.json(
    {
      hunterConfigured: hasHunterKey(),
      linkedinSearchUrl: company ? linkedinSearchUrl(company) : null,
    },
    { headers: HEADERS }
  );
}

export async function POST(req: Request) {
  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) return errorResponse;

  if (!verifyAdminOrigin(req)) {
    return NextResponse.json({ error: "Forbidden: origin validation failed" }, { status: 403, headers: HEADERS });
  }

  if (!hasHunterKey()) {
    return NextResponse.json(
      { error: "Hunter is not set up. Add HUNTER_API_KEY to the environment." },
      { status: 503, headers: HEADERS }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: HEADERS });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: HEADERS });
  }
  const input = parsed.data;

  if (input.action === "company") {
    const r = await domainSearch(input.domain, { limit: 5 });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502, headers: HEADERS });
    return NextResponse.json({ contacts: r.data ?? [], creditsLeft: r.creditsLeft ?? null }, { headers: HEADERS });
  }

  if (input.action === "person") {
    const handle = input.linkedinUrl ? linkedinHandleFromUrl(input.linkedinUrl) : null;
    if (input.linkedinUrl && !handle) {
      return NextResponse.json({ error: "That does not look like a LinkedIn profile link (linkedin.com/in/...)" }, { status: 400, headers: HEADERS });
    }
    const r = await findEmail(
      { domain: input.domain, fullName: input.fullName, linkedinHandle: handle ?? undefined }
    );
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502, headers: HEADERS });
    return NextResponse.json({ contacts: r.data ? [r.data] : [], creditsLeft: r.creditsLeft ?? null }, { headers: HEADERS });
  }

  const v = await verifyEmail(input.email);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 502, headers: HEADERS });
  return NextResponse.json({ verification: v.data, creditsLeft: v.creditsLeft ?? null }, { headers: HEADERS });
}
