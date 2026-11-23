import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "./route";
import { createSessionToken } from "../../../../lib/admin/session";
import { getSessionCookieName } from "../../../../lib/admin/cookie";
import * as validateBoardModule from "../../../../lib/jobs/validate-board";
import { getAllCompanyBoardsQueue } from "../../../../lib/jobs/pipeline";
import { CustomBoard } from "../../../../lib/jobs/repository";

vi.mock("../../../../lib/jobs/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/jobs/repository")>();
  const testRepo = new actual.InMemoryJobsRepository();
  return {
    ...actual,
    getJobsRepository: () => testRepo,
  };
});

describe("Custom Boards (/api/admin/boards & queue merge)", () => {
  const originalEnv = process.env;
  const SECRET = "secret_must_be_at_least_32_characters_long_123456";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ADMIN_SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function getValidCookie(): string {
    const token = createSessionToken(SECRET);
    return `${getSessionCookieName()}=${token}`;
  }

  function makeRequest(
    method: "GET" | "POST" | "DELETE",
    url = "http://localhost:3000/api/admin/boards",
    body?: unknown,
    headers: Record<string, string> = {}
  ) {
    return new NextRequest(url, {
      method,
      headers: {
        "content-type": "application/json",
        Cookie: getValidCookie(),
        Origin: "http://localhost:3000",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe("API Endpoints", () => {
    it("rejects unauthorized requests with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/boards", {
        method: "GET",
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("rejects invalid origin with 403 on POST and DELETE", async () => {
      const req = makeRequest("POST", undefined, { kind: "lever", slug: "test" }, { Origin: "http://bad.com" });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("rejects non-existent board when validation returns 404", async () => {
      vi.spyOn(validateBoardModule, "validateBoardSlug").mockResolvedValue({
        valid: false,
        error: "Board not found on greenhouse",
      });

      const req = makeRequest("POST", undefined, {
        kind: "greenhouse",
        slug: "non_existent_slug_xyz",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Board not found on greenhouse");
    });

    it("adds a valid custom board, lists it via GET, and deletes it via DELETE", async () => {
      vi.spyOn(validateBoardModule, "validateBoardSlug").mockResolvedValue({ valid: true });

      // 1. Add board
      const postReq = makeRequest("POST", undefined, {
        kind: "ashby",
        slug: "supercompany",
        label: "Super Company",
      });
      const postRes = await POST(postReq);
      expect(postRes.status).toBe(201);
      const postData = await postRes.json();
      expect(postData.board.kind).toBe("ashby");
      expect(postData.board.slug).toBe("supercompany");
      expect(postData.board.label).toBe("Super Company");

      const boardId = postData.board.id;

      // 2. List boards
      const getReq = makeRequest("GET");
      const getRes = await GET(getReq);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.boards.some((b: CustomBoard) => b.id === boardId)).toBe(true);

      // 3. Delete board
      const deleteReq = makeRequest("DELETE", `http://localhost:3000/api/admin/boards?id=${boardId}`);
      const deleteRes = await DELETE(deleteReq);
      expect(deleteRes.status).toBe(200);
      const deleteData = await deleteRes.json();
      expect(deleteData.ok).toBe(true);

      // 4. Verify board is gone
      const getRes2 = await GET(getReq);
      const getData2 = await getRes2.json();
      expect(getData2.boards.some((b: CustomBoard) => b.id === boardId)).toBe(false);
    });
  });

  describe("getAllCompanyBoardsQueue Merge", () => {
    it("merges custom boards with verified company boards avoiding duplicates", () => {
      const customBoards = [
        { id: "1", kind: "greenhouse" as const, slug: "figma" }, // duplicate of existing verified board
        { id: "2", kind: "lever" as const, slug: "brand-new-startup" }, // new custom board
      ];

      const queue = getAllCompanyBoardsQueue(customBoards);

      // Should contain the new board
      const foundNew = queue.find(
        (b) => b.platform === "lever" && b.name === "brand-new-startup"
      );
      expect(foundNew).toBeDefined();

      // Should not contain duplicate figma
      const figmaMatches = queue.filter(
        (b) => b.platform === "greenhouse" && b.name.toLowerCase() === "figma"
      );
      expect(figmaMatches).toHaveLength(1);
    });
  });
});
