import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../lib/admin/origin";
import { getJobsRepository } from "../../../../lib/jobs/repository";
import { validateBoardSlug } from "../../../../lib/jobs/validate-board";

export const dynamic = "force-dynamic";

const NOINDEX_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Type": "application/json",
};

const AddBoardSchema = z.object({
  kind: z.enum(["greenhouse", "lever", "ashby"]),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "Slug must only contain alphanumeric characters, underscores, or hyphens"),
  label: z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth.errorResponse) return auth.errorResponse;

  const repo = getJobsRepository();
  const boards = typeof repo.getCustomBoards === "function" ? await repo.getCustomBoards() : [];

  return NextResponse.json({ boards }, { headers: NOINDEX_HEADERS });
}

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth.errorResponse) return auth.errorResponse;

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

  const parsed = AddBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400, headers: NOINDEX_HEADERS }
    );
  }

  const { kind, slug, label } = parsed.data;

  // Validate slug against the actual ATS endpoint
  const check = await validateBoardSlug(kind, slug);
  if (!check.valid) {
    return NextResponse.json(
      { error: check.error || `Board not found on ${kind}` },
      { status: 400, headers: NOINDEX_HEADERS }
    );
  }

  const repo = getJobsRepository();
  if (typeof repo.addCustomBoard !== "function") {
    return NextResponse.json(
      { error: "Custom board storage not supported by repository" },
      { status: 500, headers: NOINDEX_HEADERS }
    );
  }

  const board = await repo.addCustomBoard({ kind, slug, label });

  return NextResponse.json({ board }, { status: 201, headers: NOINDEX_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth.errorResponse) return auth.errorResponse;

  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden: invalid origin" },
      { status: 403, headers: NOINDEX_HEADERS }
    );
  }

  let id = req.nextUrl.searchParams.get("id");

  if (!id) {
    try {
      const body = await req.json();
      if (body && typeof body.id === "string") {
        id = body.id;
      }
    } catch {
      // Ignore if body is not JSON or empty
    }
  }

  if (!id) {
    return NextResponse.json(
      { error: "Board ID is required" },
      { status: 400, headers: NOINDEX_HEADERS }
    );
  }

  const repo = getJobsRepository();
  const deleted =
    typeof repo.deleteCustomBoard === "function" ? await repo.deleteCustomBoard(id) : false;

  return NextResponse.json({ ok: deleted }, { headers: NOINDEX_HEADERS });
}
