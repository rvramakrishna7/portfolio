import { describe, it, expect } from "vitest";
import { classifyExperience, classifyGeo } from "./classify";
import { inferRemote, parseApifyLinkedInItems } from "./sources/linkedin-apify";

describe("Experience ranges written as 2+ - 5 years or with an en dash", () => {
  it("treats '2+ - 5 years of recent hands-on experience in Java' as experienced", () => {
    const r = classifyExperience(
      "Software Engineer - Core Java, AI",
      "Have you got what it takes? B.Tech in Computer Science. 2+ - 5 years of recent hands-on experience in Java technologies. Strong Java fundamentals."
    );
    expect(r.expClass).toBe("senior");
    expect(r.minYears).toBe(2);
  });

  it("reads en dash and em dash ranges", () => {
    expect(classifyExperience("Backend Engineer", "You bring 3–5 years of experience building APIs.").minYears).toBe(3);
    expect(classifyExperience("Backend Engineer", "You bring 4\u20146 years of experience building APIs.").minYears).toBe(4);
  });

  it("still accepts a 0-1 year range and a 1-4 year range starting at 1", () => {
    expect(classifyExperience("Software Engineer", "0–1 years of experience is fine.").expClass).not.toBe("senior");
    expect(classifyExperience("Full Stack Engineer", "Experience: 1–4 years in frontend or full-stack development.").minYears).toBe(1);
  });
});

describe("LinkedIn items: remote only with positive evidence", () => {
  it("says false for hybrid and on-site markers and true for remote markers", () => {
    expect(inferRemote({ workplaceType: "hybrid" }, "Dev", "Pune", "")).toBe(false);
    expect(inferRemote({}, "Dev", "Pune City, Maharashtra, India (Hybrid)", "")).toBe(false);
    expect(inferRemote({ workplaceType: "remote" }, "Dev", "Pune", "")).toBe(true);
    expect(inferRemote({}, "Dev", "Bengaluru, India (Remote)", "")).toBe(true);
    expect(inferRemote({}, "Dev", "India", "This is a fully remote role.")).toBe(true);
    expect(inferRemote({}, "Dev", "Pune", "Work from office three days a week.")).toBe(false);
  });

  it("leaves it unconfirmed when nothing says either way", () => {
    expect(inferRemote({}, "Dev", "Bengaluru, Karnataka, India", "")).toBeUndefined();
  });

  it("a hybrid LinkedIn item is not India-ok remote any more", () => {
    const [job] = parseApifyLinkedInItems([
      {
        jobId: "9",
        title: "Software Engineer - Core Java, AI",
        company: "NiCE",
        location: "Pune City, Maharashtra, India (Hybrid)",
        jobUrl: "https://www.linkedin.com/jobs/view/9",
        description: "Java role. Hybrid.",
      },
    ]);
    expect(job.isRemote).toBe(false);
    const geo = classifyGeo(job.title, job.location, job.remoteScope, job.description, { isRemote: job.isRemote, workplaceType: job.workplaceType });
    expect(geo.geo).toBe("restricted");
  });
});
