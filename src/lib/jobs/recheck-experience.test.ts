import { describe, expect, it } from "vitest";
import { InMemoryJobsRepository } from "./repository";
import { recheckExperience } from "./recheck-experience";

const LONG = "We build backend services in Java. ".repeat(10);

async function seed(repo: InMemoryJobsRepository, sourceId: string, title: string) {
  await repo.upsertJob(
    {
      source: "test",
      sourceId,
      title,
      company: "Acme",
      url: `https://x.com/${sourceId}`,
      location: "Remote",
      remoteScope: "Worldwide",
      tags: [],
      description: LONG,
      postedAt: new Date().toISOString(),
    },
    {
      expClass: "junior",
      expMinYears: null,
      geoEligibility: "worldwide",
      geoReason: "ok",
      skills: [],
      summaryLine: title,
      matchScore: 80,
    } as never
  );
}

function provider(verdicts: Record<string, unknown>) {
  return {
    lastError: null,
    async completeJson(opts: { messages: Array<{ content: string }> }, schema: { parse: (v: unknown) => unknown }) {
      const text = opts.messages[1].content;
      const key = Object.keys(verdicts).find((k) => text.includes(k));
      return key ? schema.parse(verdicts[key]) : null;
    },
  } as never;
}

describe("recheckExperience", () => {
  it("hides jobs the AI says need experience, keeps the rest, and never reads a job twice", async () => {
    const repo = new InMemoryJobsRepository();
    await seed(repo, "a", "Java Developer NiCE");
    await seed(repo, "b", "Intern Fresher Role");
    const p = provider({
      "Java Developer NiCE": { forFresher: "no", minYears: 2, reason: "Needs 2+ years" },
      "Intern Fresher Role": { forFresher: "yes", minYears: 0, reason: "Fresher welcome" },
    });

    const first = await recheckExperience({ repo, provider: p });
    expect(first).toMatchObject({ checked: 2, hidden: 1, remaining: 0 });

    const hidden = await repo.getJob("test", "a");
    expect(hidden?.filter_reason).toBe("Experience too high (AI): Needs 2+ years");
    expect(hidden?.exp_class).toBe("senior");
    expect((await repo.getJob("test", "b"))?.filter_reason ?? null).toBeNull();

    const second = await recheckExperience({ repo, provider: p });
    expect(second.checked).toBe(0);
  });

  it("stops after repeated AI failures and leaves the jobs unmarked", async () => {
    const repo = new InMemoryJobsRepository();
    for (const id of ["a", "b", "c", "d"]) await seed(repo, id, `Role ${id}`);
    const res = await recheckExperience({ repo, provider: provider({}) });
    expect(res.checked).toBe(0);
    expect(res.remaining).toBe(4);
    expect(res.error).toBeTruthy();
  });
});
