import { describe, it, expect } from "vitest";
import { InMemoryJobsRepository, NeonJobsRepository } from "./repository";

describe("setJobContact parity (InMemory and Neon)", () => {
  it("InMemory stores email, link and name; unknown id returns false", async () => {
    const repo = new InMemoryJobsRepository();
    await repo.upsertJob(
      {
        source: "t", sourceId: "s1", url: "https://e.test/1", title: "Dev", company: "Acme", location: "Remote",
        remoteScope: "", description: "d", postedAt: new Date().toISOString(), tags: [],
      },
      {} as never
    );
    expect(await repo.setJobContact("nope", { email: "a@b.co" })).toBe(false);
    expect(await repo.setJobContact("s1", { email: "a@b.co", name: "Jane Doe", linkedinUrl: "https://www.linkedin.com/in/j" })).toBe(true);
    const job = await repo.getJob("t", "s1");
    expect(job?.contact_email).toBe("a@b.co");
    expect(job?.contact_url).toBe("https://www.linkedin.com/in/j");
    expect((job?.raw as { contactName: string }).contactName).toBe("Jane Doe");
  });

  it("Neon runs one UPDATE that sets email, link and contactName, and reports whether a row matched", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    let rows: unknown[] = [{ id: "x" }];
    const mockSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("$p"), values });
      return rows;
    }) as unknown as ConstructorParameters<typeof NeonJobsRepository>[0];
    const repo = new NeonJobsRepository(mockSql);
    expect(await repo.setJobContact("00000000-0000-0000-0000-000000000001", { email: "a@b.co", name: "Jane Doe" })).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/UPDATE jobs/);
    expect(calls[0].text).toMatch(/contact_email/);
    expect(calls[0].text).toMatch(/raw/);
    expect(calls[0].values[0]).toBe("a@b.co");
    expect(String(calls[0].values[2])).toContain("Jane Doe");
    rows = [];
    expect(await repo.setJobContact("00000000-0000-0000-0000-000000000002", { email: "a@b.co" })).toBe(false);
  });
});
