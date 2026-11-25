import { NextRequest, NextResponse } from "next/server";
import { getJobsRepository } from "../../../lib/jobs/repository";
import { isBotUserAgent } from "../../../lib/tracking/bot-detect";

export const dynamic = "force-dynamic";

const VALID_TRACK_CODE = /^[a-z2-9]{8}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cleanCode = (code || "").trim();

  // Redirect target is site home page
  const redirectUrl = new URL("/", req.url);

  // Unknown or invalid code format: still redirect to / and record nothing
  if (!VALID_TRACK_CODE.test(cleanCode)) {
    const res = NextResponse.redirect(redirectUrl, { status: 302 });
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const repo = getJobsRepository();
  const draft = repo.getDraftByTrackCode
    ? await repo.getDraftByTrackCode(cleanCode)
    : null;

  if (draft) {
    const userAgent = req.headers.get("user-agent");
    const isBot = isBotUserAgent(userAgent);
    const country = req.headers.get("x-vercel-ip-country");

    await repo.recordVisit(cleanCode, isBot, country);
  }

  const res = NextResponse.redirect(redirectUrl, { status: 302 });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  // Never set cookies
  return res;
}
