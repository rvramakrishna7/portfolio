import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../../lib/admin/require-admin";
import { verifyAdminOrigin } from "../../../../../lib/admin/origin";
import { getTriageModel, getOutreachModel } from "../../../../../lib/llm/types";
import { GroqProvider } from "../../../../../lib/llm/groq";
import { z } from "zod";

const TestOutputSchema = z.object({
  ok: z.boolean(),
});

export interface ModelTestResult {
  model: string;
  status: "ok" | "error";
  error: string | null;
}

export interface GroqTestResponse {
  triage: ModelTestResult;
  outreach: ModelTestResult;
}

export async function POST(req: Request) {
  if (!verifyAdminOrigin(req)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const { errorResponse } = requireAdminApi(req);
  if (errorResponse) {
    return errorResponse;
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const parseBody = z.object({}).passthrough().safeParse(body);
  if (!parseBody.success) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400, headers: { "X-Robots-Tag": "noindex, nofollow" } }
    );
  }

  const apiKey = process.env.GROQ_API_KEY || "";
  const triageModel = getTriageModel();
  const outreachModel = getOutreachModel();

  const provider = new GroqProvider(apiKey);

  const triageResult = await provider.completeJson(
    {
      model: triageModel,
      messages: [{ role: "user", content: "Respond with JSON: {\"ok\": true}" }],
      temperature: 0,
      maxTokens: 20,
    },
    TestOutputSchema
  );
  const triageError = triageResult ? null : (provider.lastError || "test failed");

  const outreachResult = await provider.completeJson(
    {
      model: outreachModel,
      messages: [{ role: "user", content: "Respond with JSON: {\"ok\": true}" }],
      temperature: 0,
      maxTokens: 20,
    },
    TestOutputSchema
  );
  const outreachError = outreachResult ? null : (provider.lastError || "test failed");

  const responsePayload: GroqTestResponse = {
    triage: {
      model: triageModel,
      status: triageResult ? "ok" : "error",
      error: triageError,
    },
    outreach: {
      model: outreachModel,
      status: outreachResult ? "ok" : "error",
      error: outreachError,
    },
  };

  return NextResponse.json(responsePayload, {
    status: 200,
    headers: { "X-Robots-Tag": "noindex, nofollow" },
  });
}
