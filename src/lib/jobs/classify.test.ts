import { describe, it, expect } from "vitest";
import { NormalizedJob } from "./types";
import { StoredJob, OutreachDraft } from "./repository";
import { TriagedJobResult } from "../llm/triage";
import {
  classifyExperience,
  classifyGeo,
  scoreMatch,
  ExpClass,
  GeoEligibility,
  hasRealDescription,
  getMissingDescriptionNote,
} from "./classify";

interface TestCaseExperience {
  title: string;
  description: string;
  expectedClass: ExpClass;
  expectedMinYears?: number | null;
}

interface TestCaseGeo {
  title?: string;
  location: string;
  remoteScope: string;
  description: string;
  options?: { isRemote?: boolean; workplaceType?: string };
  expectedGeo: GeoEligibility;
}

const EXP_TEST_CASES: TestCaseExperience[] = [
  // 1-5: Clear fresher / new grad cases
  {
    title: "Junior Backend Engineer (0-1 yrs)",
    description: "Looking for an energetic developer with 0-1 years experience in Node.js.",
    expectedClass: "fresher",
  },
  {
    title: "New Grad SWE",
    description: "Calling all recent computer science graduates. Fresh graduates welcome.",
    expectedClass: "fresher",
  },
  {
    title: "Software Engineer - Entry Level",
    description: "No experience required, comprehensive training provided.",
    expectedClass: "fresher",
  },
  {
    title: "AI Automation Intern",
    description: "Summer internship building LLM tools and integrations.",
    expectedClass: "fresher",
  },
  {
    title: "Graduate Software Developer",
    description: "Entry-level opportunity for BS Computer Science holders.",
    expectedClass: "fresher",
  },

  // 6-10: Clear Junior / Associate cases
  {
    title: "Associate Engineer",
    description: "Work on web microservices with senior engineers.",
    expectedClass: "junior",
  },
  {
    title: "Junior Full Stack Developer",
    description: "Requires 1 year of experience building React applications.",
    expectedClass: "junior",
  },
  {
    title: "Junior Python Engineer",
    description: "Must have at least one year of hands-on experience with FastAPI.",
    expectedClass: "junior",
  },
  {
    title: "Associate Software Developer",
    description: "Assist with CI/CD and automated Playwright testing.",
    expectedClass: "junior",
  },
  {
    title: "Junior Web Developer",
    description: "General development tasks across frontend and backend.",
    expectedClass: "junior",
  },

  // 11-20: Senior / Mid cases (years >= 2 or senior title words)
  {
    title: "Software Engineer, 3+ years",
    description: "We require 3+ years of professional backend software engineering experience.",
    expectedClass: "senior",
  },
  {
    title: "Senior Full Stack Engineer",
    description: "Lead our product development team.",
    expectedClass: "senior",
  },
  {
    title: "Staff Platform Engineer",
    description: "Manage large scale Kubernetes clusters.",
    expectedClass: "senior",
  },
  {
    title: "Principal AI Architect",
    description: "Architect agentic workflows and neural architectures.",
    expectedClass: "senior",
  },
  {
    title: "Lead Developer",
    description: "Guide a squad of 6 engineers.",
    expectedClass: "senior",
  },
  {
    title: "Backend Engineer",
    description: "Requires 2-4 years of experience with distributed systems.",
    expectedClass: "senior",
  },
  {
    title: "Fullstack Developer",
    description: "Candidate should have five years of experience with Next.js and SQL.",
    expectedClass: "senior",
  },
  {
    title: "Engineering Manager",
    description: "Manage sprint velocity and engineering hiring.",
    expectedClass: "senior",
  },
  {
    title: "Director of Engineering",
    description: "Oversee all technical roadmaps.",
    expectedClass: "senior",
  },
  {
    title: "VP of Technology",
    description: "Executive role setting technology strategy.",
    expectedClass: "senior",
  },

  // 21-25: False positives handling (years of history, funding, 401k)
  {
    title: "Junior Software Engineer",
    description: "Our company has 20+ years of company history and a 401k match. 0 to 1 years experience wanted.",
    expectedClass: "fresher",
  },
  {
    title: "Frontend Developer",
    description: "Backed by 2 years of funding and tier-1 VCs. We offer 401k and generous health insurance.",
    expectedClass: "unclear",
  },
  {
    title: "Software Engineer (New Grad)",
    description: "Our mission spans 10 years of history. Freshers and recent grads encouraged to apply.",
    expectedClass: "fresher",
  },
  {
    title: "Full Stack Engineer",
    description: "We are an established startup celebrating ten years of success.",
    expectedClass: "unclear",
  },
  {
    title: "Software Developer",
    description: "Company history over 15 years in financial services.",
    expectedClass: "unclear",
  },

  // 26-30: Conflict handling (fresher words + 5+ years => years win)
  {
    title: "Senior Full Stack (Graduate Mentor)",
    description: "Mentoring new grads. Requires at least 5 years of industry experience.",
    expectedClass: "senior",
  },
  {
    title: "Backend Engineer",
    description: "Work with interns. Must have 6+ years of software engineering experience.",
    expectedClass: "senior",
  },
  {
    title: "Lead AI Engineer",
    description: "Graduate degree preferred but must have 7+ years hands-on experience.",
    expectedClass: "senior",
  },
  {
    title: "Head of AI",
    description: "Entry-level enthusiasm required, but 8+ years leading ML projects is a must.",
    expectedClass: "senior",
  },
  {
    title: "Staff Engineer (Apprentice Program)",
    description: "Oversee the apprentice program. Demands minimum 5 years of production experience.",
    expectedClass: "senior",
  },
];

const GEO_TEST_CASES: TestCaseGeo[] = [
  // 31-35: Worldwide / Anywhere
  {
    location: "Worldwide",
    remoteScope: "Global",
    description: "This role is 100% remote. Work from anywhere in the world.",
    expectedGeo: "worldwide",
  },
  {
    location: "Remote",
    remoteScope: "Anywhere",
    description: "We hire globally across all continents.",
    expectedGeo: "worldwide",
  },
  {
    location: "Remote",
    remoteScope: "Worldwide",
    description: "Work from anywhere in your timezone.",
    expectedGeo: "worldwide",
  },
  {
    location: "Global Remote",
    remoteScope: "Worldwide",
    description: "Any timezone welcome.",
    expectedGeo: "worldwide",
  },
  {
    location: "Remote",
    remoteScope: "Work from anywhere",
    description: "Distributed team across 20 countries.",
    expectedGeo: "worldwide",
  },

  // 36-40: India OK / APAC
  {
    location: "Remote - India",
    remoteScope: "India",
    description: "Role based remotely in India with IST working hours.",
    expectedGeo: "india_ok",
  },
  {
    location: "Remote",
    remoteScope: "APAC",
    description: "Engineers in Asia / APAC regions preferred.",
    expectedGeo: "india_ok",
  },
  {
    location: "Bengaluru (Remote)",
    remoteScope: "India",
    description: "Work remotely from Mumbai, Delhi, or Pune.",
    expectedGeo: "india_ok",
  },
  {
    location: "Remote",
    remoteScope: "Asia",
    description: "We are expanding our presence in Asia and India.",
    expectedGeo: "india_ok",
  },
  {
    location: "Remote",
    remoteScope: "IST Timezone",
    description: "Must be available during IST timezone hours.",
    expectedGeo: "india_ok",
  },

  // 41-45: Restricted (US only, Europe only, etc.)
  {
    location: "US Only",
    remoteScope: "United States",
    description: "Must be located in the US and authorized to work in the US.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote",
    remoteScope: "USA Only",
    description: "No C2C. United States citizenship required.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote",
    remoteScope: "Europe Only",
    description: "Must reside in the EU or UK.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote (Canada Only)",
    remoteScope: "Canada",
    description: "Canadian residents only.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote",
    remoteScope: "US Timezone Only",
    description: "PST timezone only. Must be located in the United States.",
    expectedGeo: "restricted",
  },

  // 15 NEW labelled geo tests (Step 2/6)
  {
    location: "Remote",
    remoteScope: "WeWorkRemotely",
    description: "Software Engineer (Remote Eligible in Bulgaria). Smartsheet is hiring.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote - Germany",
    remoteScope: "Germany Only",
    description: "Must reside in Germany. Working hours CET.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote (Poland)",
    remoteScope: "Europe",
    description: "Software developer role based in Poland.",
    expectedGeo: "restricted",
  },
  {
    location: "Indiana, USA",
    remoteScope: "United States",
    description: "Position located in Indiana, USA. Not open internationally.",
    expectedGeo: "restricted",
  },
  {
    location: "Malaysia",
    remoteScope: "Malaysia",
    description: "Based in Malaysia. Malaysian work permit required.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote",
    remoteScope: "Anywhere in the world",
    description: "We are an all-remote team anywhere in the world.",
    expectedGeo: "worldwide",
  },
  {
    location: "Remote",
    remoteScope: "APAC",
    description: "APAC timezones welcome. Competitive salary.",
    expectedGeo: "india_ok",
  },
  {
    location: "Remote, India",
    remoteScope: "India",
    description: "Remote, India. Build cloud applications with TypeScript.",
    expectedGeo: "india_ok",
  },
  {
    location: "Remote",
    remoteScope: "Remote",
    description: "General software engineering role with no location specified.",
    expectedGeo: "unclear",
  },
  {
    location: "Remote",
    remoteScope: "Remote",
    description: "Must reside in France. French speaking required.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote (Brazil)",
    remoteScope: "LATAM",
    description: "Engineering team hiring remote in Brazil.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote",
    remoteScope: "Worldwide",
    description: "Headquartered in London UK but position is open worldwide.",
    expectedGeo: "worldwide",
  },
  {
    location: "Remote",
    remoteScope: "APAC",
    description: "Offices in Singapore and Tokyo, but engineering hiring is open to India and APAC.",
    expectedGeo: "india_ok",
  },
  {
    location: "Remote - UK",
    remoteScope: "UK",
    description: "UK residents only. No sponsorship available.",
    expectedGeo: "restricted",
  },
  {
    location: "Remote",
    remoteScope: "Canada",
    description: "Work from Canada only. Remote eligible in Canada.",
    expectedGeo: "restricted",
  },

  // 12 Labelled Geo Hardening Tests (Step 1/4)
  {
    title: "Software Engineer (Remote Eligible in Bulgaria)",
    location: "Remote",
    remoteScope: "WeWorkRemotely",
    description: "We are a global company with offices worldwide. We operate in costa rica, japan, bulgaria, india, and singapore.",
    expectedGeo: "restricted",
  },
  {
    title: "Senior Full Stack Engineer",
    location: "Remote",
    remoteScope: "US Only",
    description: "Global leader in payments. Remote, US only. We are expanding rapidly.",
    expectedGeo: "restricted",
  },
  {
    title: "Backend Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Offices in London, Mumbai and Austin. Modern tech stack.",
    expectedGeo: "unclear",
  },
  {
    title: "Full Stack Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Work from anywhere in the world. Flexible hours and competitive package.",
    expectedGeo: "worldwide",
  },
  {
    title: "Software Developer",
    location: "Remote (Worldwide)",
    remoteScope: "Worldwide",
    description: "Join our core team building high performance systems.",
    expectedGeo: "worldwide",
  },
  {
    title: "Full Stack Engineer",
    location: "Remote, India or APAC",
    remoteScope: "APAC",
    description: "Building developer platforms. Competitive salary.",
    expectedGeo: "india_ok",
  },
  {
    title: "DevOps Engineer",
    location: "Remote - EMEA",
    remoteScope: "EMEA",
    description: "Managing infrastructure across European timezones.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "We are hiring in India for our platform team.",
    expectedGeo: "india_ok",
  },
  {
    title: "Frontend Developer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Open to candidates in India with strong React skills.",
    expectedGeo: "india_ok",
  },
  {
    title: "AI Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Candidates from any country welcome to apply.",
    expectedGeo: "worldwide",
  },
  {
    title: "Cloud Architect",
    location: "Remote",
    remoteScope: "Remote",
    description: "We have team members across Germany, France, Poland, India, and Brazil.",
    expectedGeo: "unclear",
  },
  {
    title: "Software Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Role requires India timezone overlap for daily standups.",
    expectedGeo: "india_ok",
  },

  // 12+ J2.1c Worldwide Leak and Territory Tests
  {
    title: "Virtual IOP Clinician - Florida & Texas",
    location: "Remote",
    remoteScope: "Remote",
    description: "Providing teletherapy services across clinical networks.",
    expectedGeo: "restricted",
  },
  {
    title: "Field Service Engineer - UK Remote",
    location: "Remote",
    remoteScope: "Remote",
    description: "Maintenance and customer support for 3D printing equipment.",
    expectedGeo: "restricted",
  },
  {
    title: "Customer Success Producer (China)",
    location: "Remote",
    remoteScope: "Remote",
    description: "Working with gaming clients across Chinese market.",
    expectedGeo: "restricted",
  },
  {
    title: "Director, Sales (Middle East)",
    location: "Remote",
    remoteScope: "Remote",
    description: "Driving enterprise identity access software sales.",
    expectedGeo: "restricted",
  },
  {
    title: "Sales Director",
    location: "Remote",
    remoteScope: "Remote",
    description: "Overseeing sales teams and driving quota in APAC territory.",
    expectedGeo: "unclear",
  },
  {
    title: "Full Stack Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "We serve customers worldwide with modern cloud software.",
    expectedGeo: "unclear",
  },
  {
    title: "Senior Backend Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Remote worldwide role. Join our globally distributed engineering squad.",
    expectedGeo: "worldwide",
  },
  {
    title: "Platform Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Our company is a worldwide leader in observability tools.",
    expectedGeo: "unclear",
  },
  {
    title: "Staff Software Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Open worldwide to engineers looking for high ownership.",
    expectedGeo: "worldwide",
  },
  {
    title: "Frontend Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "We have offices worldwide. Looking for great UI developers.",
    expectedGeo: "unclear",
  },
  {
    title: "Security Analyst",
    location: "Remote",
    remoteScope: "Remote",
    description: "Hiring worldwide for our 24/7 security operations center.",
    expectedGeo: "worldwide",
  },
  {
    title: "Machine Learning Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "Candidates worldwide are invited to apply for our AI research team.",
    expectedGeo: "worldwide",
  },

  // 32 Board Location & Workplace Type Test Cases (Step 3/4)
  {
    title: "Software Engineer",
    location: "San Francisco, CA",
    remoteScope: "San Francisco, CA",
    options: { workplaceType: "OnSite" },
    description: "Build distributed databases at our SF headquarters.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Engineer",
    location: "San Francisco, California",
    remoteScope: "San Francisco, California",
    description: "Onsite role developing high throughput storage systems.",
    expectedGeo: "restricted",
  },
  {
    title: "Frontend Developer",
    location: "London, UK",
    remoteScope: "London, UK",
    options: { workplaceType: "Hybrid" },
    description: "Hybrid role working 3 days a week in our London office.",
    expectedGeo: "restricted",
  },
  {
    title: "Junior Backend Developer",
    location: "London, United Kingdom",
    remoteScope: "London, United Kingdom",
    description: "Develop REST and GraphQL endpoints in our UK tech hub.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Engineer, High Availability",
    location: "Seattle, WA",
    remoteScope: "Seattle, WA",
    description: "Work with engineering teams in our Seattle engineering center.",
    expectedGeo: "restricted",
  },
  {
    title: "Systems Software Engineer",
    location: "Mountain View, California; San Francisco, California",
    remoteScope: "Mountain View, California; San Francisco, California",
    description: "Systems programming in C++ and Go across Bay Area offices.",
    expectedGeo: "restricted",
  },
  {
    title: "AI Engineer",
    location: "New York, NY",
    remoteScope: "New York, NY",
    options: { isRemote: false },
    description: "Work with our machine learning team in Manhattan.",
    expectedGeo: "restricted",
  },
  {
    title: "Full Stack Developer",
    location: "Barcelona",
    remoteScope: "Barcelona",
    description: "Join our European product squad in Barcelona.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Engineer",
    location: "Toronto",
    remoteScope: "Toronto",
    description: "Build financial services infrastructure in our Toronto office.",
    expectedGeo: "restricted",
  },
  {
    title: "Technical Services Engineer",
    location: "Sydney",
    remoteScope: "Sydney",
    description: "Support APAC enterprise clients from our Sydney headquarters.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Engineer",
    location: "Dublin, Ireland",
    remoteScope: "Dublin, Ireland",
    description: "Data pipeline infrastructure in our Dublin office.",
    expectedGeo: "restricted",
  },
  {
    title: "Platform Engineer",
    location: "Amsterdam, Netherlands",
    remoteScope: "Amsterdam, Netherlands",
    description: "Cloud reliability engineering in Amsterdam.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Engineering Intern",
    location: "Berlin, Germany",
    remoteScope: "Berlin, Germany",
    description: "Summer intern position in our Berlin office.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Engineer",
    location: "Remote - US",
    remoteScope: "Remote - US",
    description: "Remote software engineer located anywhere in the United States.",
    expectedGeo: "restricted",
  },
  {
    title: "Backend Engineer",
    location: "US Remote",
    remoteScope: "US Remote",
    description: "Must reside within the continental United States.",
    expectedGeo: "restricted",
  },
  {
    title: "Full Stack Engineer",
    location: "US - Remote",
    remoteScope: "US - Remote",
    description: "Remote role for candidates authorized to work in the US.",
    expectedGeo: "restricted",
  },
  {
    title: "Full Stack Engineer",
    location: "Remote (US)",
    remoteScope: "Remote (US)",
    description: "Build next-generation customer portals across US timezones.",
    expectedGeo: "restricted",
  },
  {
    title: "Full Stack Engineer (Open Banking)",
    location: "Remote UK",
    remoteScope: "Remote UK",
    description: "UK-based remote role designing payments APIs.",
    expectedGeo: "restricted",
  },
  {
    title: "Developer",
    location: "Remote - Canada",
    remoteScope: "Canada",
    description: "Canadian remote developer role with benefits.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Developer",
    location: "Remote - Germany",
    remoteScope: "Germany",
    description: "Work remotely within Germany for our cloud services team.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Developer in Observability",
    location: "Home based - EMEA",
    remoteScope: "Home based - EMEA",
    description: "Remote engineering role across EMEA timezones.",
    expectedGeo: "restricted",
  },
  {
    title: "Backend Engineer",
    location: "Remote - LATAM",
    remoteScope: "LATAM",
    description: "Remote engineer located in Latin America.",
    expectedGeo: "restricted",
  },
  {
    title: "Software Engineer",
    location: "Remote",
    remoteScope: "Remote",
    description: "General software development position with no location details.",
    expectedGeo: "unclear",
  },
  {
    title: "Software Engineer",
    location: "Remote - India",
    remoteScope: "India",
    description: "Work remotely from anywhere in India on our global backend.",
    expectedGeo: "india_ok",
  },
  {
    title: "Junior Python Developer",
    location: "Remote, India",
    remoteScope: "India",
    description: "FastAPI and Python developer based in India.",
    expectedGeo: "india_ok",
  },
  {
    title: "Full Stack Engineer",
    location: "Remote, Worldwide",
    remoteScope: "Worldwide",
    description: "Join our globally distributed team from any country.",
    expectedGeo: "worldwide",
  },
  {
    title: "AI Automation Engineer",
    location: "Remote - Worldwide",
    remoteScope: "Worldwide",
    description: "We are an all-remote, work from anywhere worldwide company.",
    expectedGeo: "worldwide",
  },
  {
    title: "Software Engineer",
    location: "Bengaluru",
    remoteScope: "Bengaluru",
    description: "Build high performance microservices in our Bengaluru office.",
    expectedGeo: "india_ok",
  },
  {
    title: "Junior Backend Engineer",
    location: "Bengaluru, India",
    remoteScope: "India",
    description: "Work on backend systems with our Indian engineering team.",
    expectedGeo: "india_ok",
  },
  {
    title: "Junior Full Stack Engineer",
    location: "Hyderabad",
    remoteScope: "Hyderabad",
    description: "React and Node.js developer in Hyderabad.",
    expectedGeo: "india_ok",
  },
  {
    title: "Software Engineer, Public Sector - New Grad",
    location: "Remote",
    remoteScope: "Remote",
    description: "Work with US federal and public sector customers.",
    expectedGeo: "restricted",
  },
  {
    title: "AI Engineer – Forward Deployed Engineering, U.S. Public Sector (Federal Focus)",
    location: "Remote",
    remoteScope: "Remote",
    description: "Deploying AI models for government missions and federal programs.",
    expectedGeo: "restricted",
  },
  {
    title: "Solutions Engineer (Clearance Required)",
    location: "Remote",
    remoteScope: "Remote",
    description: "Requires active security clearance and US citizenship.",
    expectedGeo: "restricted",
  },
];

describe("Rule Engine - 45 Labelled Table-Driven Tests", () => {
  it(`passes all ${EXP_TEST_CASES.length} experience classification test cases`, () => {
    let passedCount = 0;
    for (const tc of EXP_TEST_CASES) {
      const res = classifyExperience(tc.title, tc.description);
      expect(res.expClass).toBe(tc.expectedClass);
      passedCount++;
    }
    expect(passedCount).toBe(EXP_TEST_CASES.length);
  });

  it(`passes all ${GEO_TEST_CASES.length} geographic classification test cases`, () => {
    let passedCount = 0;
    for (let i = 0; i < GEO_TEST_CASES.length; i++) {
      const tc = GEO_TEST_CASES[i];
      const res = classifyGeo(tc.title || "Software Engineer", tc.location, tc.remoteScope, tc.description, tc.options);
      if (res.geo !== tc.expectedGeo) {
        console.error(`Failed at index ${i}:`, tc, "got:", res);
      }
      expect(res.geo).toBe(tc.expectedGeo);
      passedCount++;
    }
    expect(passedCount).toBe(GEO_TEST_CASES.length);
  });

  it("calculates explainable match scores cleanly", () => {
    // High match: target title, multiple strong skills, fresher, worldwide
    const highMatch = scoreMatch({
      title: "Junior Full-Stack Engineer",
      description: "Building reactive apps with TypeScript, React, Next.js, and Python FastAPI.",
      tags: ["typescript", "react", "python"],
      expClass: "fresher",
      geoEligibility: "worldwide",
    });

    expect(highMatch.score).toBeGreaterThanOrEqual(70);
    expect(highMatch.matchedSkills).toContain("TypeScript");
    expect(highMatch.matchedSkills).toContain("React");
    expect(highMatch.matchedSkills).toContain("Python");

    // Zero match: US only restricted
    const restrictedMatch = scoreMatch({
      title: "Full Stack Engineer",
      description: "TypeScript and React.",
      tags: ["react"],
      expClass: "fresher",
      geoEligibility: "restricted",
    });
    expect(restrictedMatch.score).toBe(0);

    // Capped match: Senior position
    const seniorMatch = scoreMatch({
      title: "Senior Backend Engineer",
      description: "Python, PostgreSQL, Docker.",
      tags: ["python"],
      expClass: "senior",
      geoEligibility: "worldwide",
    });
    expect(seniorMatch.score).toBeLessThanOrEqual(15);
  });

  it("correctly routes jobs into shortlist, maybe, and hidden buckets", () => {
    // 1. Onsite "San Francisco" job -> hidden (geo: restricted, reason starts with onsite:)
    const sfOnsite = classifyGeo("Junior Engineer", "San Francisco, CA", "San Francisco", "On-site office role in SF.", {
      isRemote: false,
    });
    expect(sfOnsite.geo).toBe("restricted");
    expect(sfOnsite.reason.startsWith("onsite:")).toBe(true);

    // 2. "Remote" with no country -> maybe (geo: unclear, reason starts with remote-unconfirmed:)
    const remoteNoCountry = classifyGeo("Junior Developer", "Remote", "Remote", "100% remote developer opening.", {
      isRemote: true,
    });
    expect(remoteNoCountry.geo).toBe("unclear");
    expect(remoteNoCountry.reason.startsWith("remote-unconfirmed:")).toBe(true);

    // 3. "Remote - US" -> restricted/hidden
    const remoteUs = classifyGeo("Software Engineer", "Remote - US", "US", "Must reside in US.");
    expect(remoteUs.geo).toBe("restricted");

    // 4. "Hybrid - London" -> hidden (geo: restricted, reason starts with onsite:)
    const hybridLondon = classifyGeo("Frontend Developer", "Hybrid - London", "London", "Hybrid 2 days in office.");
    expect(hybridLondon.geo).toBe("restricted");
    expect(hybridLondon.reason.startsWith("onsite:")).toBe(true);

    // 5. "Remote - Worldwide" -> shortlist (geo: worldwide)
    const remoteWorldwide = classifyGeo("Full Stack Developer", "Remote - Worldwide", "Worldwide", "Work from anywhere in the world.");
    expect(remoteWorldwide.geo).toBe("worldwide");
  });

  it("InMemoryJobsRepository buckets shortlist, maybe, and hidden correctly", async () => {
    const { InMemoryJobsRepository } = await import("./repository");
    const repo = new InMemoryJobsRepository();
    const nowIso = new Date().toISOString();

    // 1. Onsite San Francisco -> hidden
    await repo.upsertJob(
      {
        source: "greenhouse",
        sourceId: "case-sf",
        url: "https://example.com/sf",
        title: "Junior Engineer",
        company: "SF Tech",
        location: "San Francisco, CA",
        remoteScope: "San Francisco",
        description: "Onsite in SF.",
        postedAt: nowIso,
        tags: [],
        isRemote: false,
      },
      {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "restricted",
        geoReason: "onsite: Non-remote location (San Francisco, CA)",
        filterReason: "onsite: Non-remote location (San Francisco, CA)",
        summaryLine: "SF onsite role",
        skills: ["TypeScript"],
        matchScore: 60,
      }
    );

    // 2. Remote with no country -> maybe
    await repo.upsertJob(
      {
        source: "ashby",
        sourceId: "case-remote",
        url: "https://example.com/remote",
        title: "Junior Developer",
        company: "Remote Org",
        location: "Remote",
        remoteScope: "Remote",
        description: "Remote developer role.",
        postedAt: nowIso,
        tags: [],
        isRemote: true,
      },
      {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "unclear",
        geoReason: "remote-unconfirmed: Remote role, India eligibility not stated",
        filterReason: undefined,
        summaryLine: "Remote role with no country named",
        skills: ["TypeScript"],
        matchScore: 80,
      }
    );

    // 3. Remote - US -> hidden
    await repo.upsertJob(
      {
        source: "lever",
        sourceId: "case-us",
        url: "https://example.com/us",
        title: "Software Engineer",
        company: "US Corp",
        location: "Remote - US",
        remoteScope: "US",
        description: "Must reside in US.",
        postedAt: nowIso,
        tags: [],
      },
      {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "restricted",
        geoReason: "Restricted to united states",
        filterReason: "Restricted to united states",
        summaryLine: "US only",
        skills: ["React"],
        matchScore: 0,
      }
    );

    // 4. Hybrid - London -> hidden
    await repo.upsertJob(
      {
        source: "greenhouse",
        sourceId: "case-london",
        url: "https://example.com/london",
        title: "Frontend Developer",
        company: "London Co",
        location: "Hybrid - London",
        remoteScope: "London",
        description: "Hybrid London office.",
        postedAt: nowIso,
        tags: [],
      },
      {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "restricted",
        geoReason: "onsite: On-site or hybrid role, not remote (Hybrid - London)",
        filterReason: "onsite: On-site or hybrid role, not remote (Hybrid - London)",
        summaryLine: "London hybrid role",
        skills: ["CSS"],
        matchScore: 50,
      }
    );

    // 5. Remote - Worldwide -> shortlist
    await repo.upsertJob(
      {
        source: "remoteok",
        sourceId: "case-worldwide",
        url: "https://example.com/worldwide",
        title: "Full Stack Developer",
        company: "Global Co",
        location: "Remote - Worldwide",
        remoteScope: "Worldwide",
        description: "Work from anywhere in the world.",
        postedAt: nowIso,
        tags: [],
      },
      {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "worldwide",
        geoReason: "Open worldwide / work from anywhere",
        filterReason: undefined,
        summaryLine: "Worldwide opening",
        skills: ["TypeScript", "Next.js"],
        matchScore: 90,
      }
    );

    const counts = await repo.getViewCounts();
    expect(counts.shortlist).toBe(1);
    expect(counts.maybe).toBe(1);
    expect(counts.hidden).toBe(3);
    expect(counts.all).toBe(5);

    const shortlistJobs = await repo.getJobs({ view: "shortlist" });
    expect(shortlistJobs.jobs.map((j) => j.source_id)).toEqual(["case-worldwide"]);

    const maybeJobs = await repo.getJobs({ view: "maybe" });
    expect(maybeJobs.jobs.map((j) => j.source_id)).toEqual(["case-remote"]);

    const hiddenJobs = await repo.getJobs({ view: "hidden" });
    const hiddenIds = hiddenJobs.jobs.map((j) => j.source_id);
    expect(hiddenIds).toContain("case-sf");
    expect(hiddenIds).toContain("case-us");
    expect(hiddenIds).toContain("case-london");
  });

  describe("reclassifyUnclearJobs cost and budget controls", () => {
    it("second call updates 0 rows because rows are already classified", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const repo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      await repo.upsertJob(
        {
          source: "greenhouse",
          sourceId: "reclass-1",
          url: "https://example.com/1",
          title: "Frontend Developer",
          company: "Co A",
          location: "Remote",
          remoteScope: "Remote",
          description: "Remote developer opening.",
          postedAt: nowIso,
          tags: [],
          isRemote: true,
        },
        {
          expClass: "junior",
          expMinYears: 1,
          geoEligibility: "unclear",
          geoReason: "legacy unclassified reason",
          filterReason: undefined,
          summaryLine: "Legacy unclear job",
          skills: ["React"],
          matchScore: 70,
        }
      );

      // First run: updates the 1 unclassified row
      const firstRun = await repo.reclassifyUnclearJobs();
      expect(firstRun.updated).toBe(1);
      expect(firstRun.remaining).toBe(0);

      // Second run: 0 rows selected because geo_reason now starts with remote-unconfirmed:
      const secondRun = await repo.reclassifyUnclearJobs();
      expect(secondRun.updated).toBe(0);
      expect(secondRun.remaining).toBe(0);
    });

    it("skips updating unchanged rows when fields would not change", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const repo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      await repo.upsertJob(
        {
          source: "ashby",
          sourceId: "reclass-unchanged",
          url: "https://example.com/unchanged",
          title: "Platform Engineer",
          company: "Co B",
          location: "Unknown",
          remoteScope: "Unknown",
          description: "Platform role.",
          postedAt: nowIso,
          tags: [],
        },
        {
          expClass: "junior",
          expMinYears: 1,
          geoEligibility: "unclear",
          geoReason: "legacy-match-reason",
          filterReason: undefined,
          summaryLine: "Role with matching mock",
          skills: ["Docker"],
          matchScore: 60,
        }
      );

      // Pass classifyFn returning the exact same values already on the job
      const res = await repo.reclassifyUnclearJobs({
        classifyFn: () => ({
          geo: "unclear",
          reason: "legacy-match-reason",
        }),
      });
      expect(res.updated).toBe(0);
      expect(res.remaining).toBe(0);
    });

    it("stops after time budget is exceeded and returns remaining > 0", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const repo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      for (let i = 1; i <= 3; i++) {
        await repo.upsertJob(
          {
            source: "lever",
            sourceId: `budget-job-${i}`,
            url: `https://example.com/${i}`,
            title: `Developer ${i}`,
            company: `Budget Co ${i}`,
            location: "Remote",
            remoteScope: "Remote",
            description: "Remote role.",
            postedAt: nowIso,
            tags: [],
            isRemote: true,
          },
          {
            expClass: "junior",
            expMinYears: 1,
            geoEligibility: "unclear",
            geoReason: `unclassified legacy ${i}`,
            filterReason: undefined,
            summaryLine: `Job ${i}`,
            skills: ["Node.js"],
            matchScore: 75,
          }
        );
      }

      // Simulated clock: advances past budget after 1 job is processed
      let callCount = 0;
      const clock = () => {
        callCount++;
        return callCount <= 2 ? 1000 : 7000;
      };

      const res = await repo.reclassifyUnclearJobs({
        timeBudgetMs: 5000,
        clock,
      });

      expect(res.updated).toBe(1);
      expect(res.remaining).toBe(2);
      expect(res.remaining).toBeGreaterThan(0);
    });
  });

  describe("reclassifyInboxJobs fix-up", () => {
    it("re-buckets existing inbox jobs that had geo/onsite or matchScore filter reasons", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const repo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      await repo.upsertJob(
        {
          source: "whatsapp",
          sourceId: "inbox-fix-1",
          url: "https://example.com/wa-1",
          title: "Associate Software Engineer (0-2 Yrs)",
          company: "Delta Airlines",
          location: "Onsite Atlanta",
          remoteScope: "Onsite",
          description: "Onsite Delta role in Atlanta, US.",
          postedAt: nowIso,
          tags: [],
          inboundSource: "whatsapp",
        },
        {
          expClass: "junior",
          expMinYears: 1,
          geoEligibility: "restricted",
          geoReason: "onsite: Atlanta",
          filterReason: "location not remote / not confirmed for India",
          summaryLine: "Associate Software Engineer at Delta Airlines",
          skills: ["Java"],
          matchScore: 60,
        }
      );

      // First run: clears the invalid geo filterReason from the inbox job
      const res1 = await repo.reclassifyInboxJobs();
      expect(res1.updated).toBe(1);
      expect(res1.remaining).toBe(0);

      // Verify the job now has filter_reason = null and appears in Inbox view
      const inboxList = await repo.getJobs({ view: "inbox" });
      expect(inboxList.jobs).toHaveLength(1);
      expect(inboxList.jobs[0].filter_reason).toBeNull();

      // Second run: 0 updates because filter_reason is already null (idempotent)
      const res2 = await repo.reclassifyInboxJobs();
      expect(res2.updated).toBe(0);
      expect(res2.remaining).toBe(0);
    });

    it("preserves non-English and senior title filter reasons on inbox jobs", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const repo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      await repo.upsertJob(
        {
          source: "telegram",
          sourceId: "inbox-senior-1",
          url: "https://example.com/tg-1",
          title: "Director of Engineering",
          company: "Acme",
          location: "Remote",
          remoteScope: "Remote",
          description: "Lead 5 teams.",
          postedAt: nowIso,
          tags: [],
          inboundSource: "telegram",
        },
        {
          expClass: "senior",
          expMinYears: 10,
          geoEligibility: "worldwide",
          geoReason: "Open globally",
          filterReason: "Excluded title (senior/management or non-engineering)",
          summaryLine: "Director of Engineering at Acme",
          skills: [],
          matchScore: 10,
        }
      );

      const res = await repo.reclassifyInboxJobs();
      expect(res.updated).toBe(0); // Already Excluded title, unchanged
      const job = await repo.getJob("telegram", "inbox-senior-1");
      expect(job?.filter_reason).toBe("Excluded title (senior/management or non-engineering)");
    });
  });

  describe("NULL-safe inbound_source regression tests", () => {
    it("asserts counts for shortlist, maybe, and hidden are > 0 when inbound_source is undefined/null", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const repo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      // 1. Shortlist candidate with inbound_source = undefined
      await repo.upsertJob(
        {
          source: "adzuna",
          sourceId: "shortlist-1",
          url: "https://example.com/job-1",
          title: "Junior Backend Developer",
          company: "Acme",
          location: "Remote",
          remoteScope: "Worldwide",
          description: "Junior dev role.",
          postedAt: nowIso,
          tags: [],
          inboundSource: undefined,
        },
        {
          expClass: "junior",
          expMinYears: 1,
          geoEligibility: "worldwide",
          geoReason: "Open globally",
          summaryLine: "Junior Backend Developer at Acme",
          skills: ["Node.js"],
          matchScore: 80,
        }
      );

      // 2. Maybe candidate with inbound_source = null
      await repo.upsertJob(
        {
          source: "remoteok",
          sourceId: "maybe-1",
          url: "https://example.com/job-2",
          title: "Frontend Developer",
          company: "Beta Corp",
          location: "Remote",
          remoteScope: "Remote",
          description: "Frontend role.",
          postedAt: nowIso,
          tags: [],
        },
        {
          expClass: "fresher",
          expMinYears: 0,
          geoEligibility: "unclear",
          geoReason: "remote-unconfirmed:no geo mentions",
          summaryLine: "Frontend Developer at Beta Corp",
          skills: ["React"],
          matchScore: 70,
        }
      );

      // 3. Hidden candidate with inbound_source = undefined
      await repo.upsertJob(
        {
          source: "adzuna",
          sourceId: "hidden-1",
          url: "https://example.com/job-3",
          title: "Senior Principal Architect",
          company: "Gamma Corp",
          location: "New York",
          remoteScope: "Onsite",
          description: "10+ years exp.",
          postedAt: nowIso,
          tags: [],
        },
        {
          expClass: "senior",
          expMinYears: 10,
          geoEligibility: "restricted",
          geoReason: "US only",
          filterReason: "Senior experience level (10+ yrs)",
          summaryLine: "Senior Principal Architect at Gamma Corp",
          skills: ["Java"],
          matchScore: 20,
        }
      );

      // 4. Inbox candidate
      await repo.upsertJob(
        {
          source: "whatsapp",
          sourceId: "inbox-1",
          url: "https://example.com/job-4",
          title: "Junior QA Tester",
          company: "Delta Corp",
          location: "Remote",
          remoteScope: "Remote",
          description: "Manual and automated QA.",
          postedAt: nowIso,
          tags: [],
          inboundSource: "whatsapp",
        },
        {
          expClass: "junior",
          expMinYears: 1,
          geoEligibility: "india_ok",
          geoReason: "India allowed",
          summaryLine: "Junior QA Tester at Delta Corp",
          skills: ["Testing"],
          matchScore: 65,
        }
      );

      const counts = await repo.getViewCounts(30);
      expect(counts.shortlist).toBeGreaterThan(0);
      expect(counts.maybe).toBeGreaterThan(0);
      expect(counts.hidden).toBeGreaterThan(0);
      expect(counts.inbox).toBeGreaterThan(0);

      const shortlistJobs = await repo.getJobs({ view: "shortlist" });
      expect(shortlistJobs.jobs.length).toBeGreaterThan(0);

      const maybeJobs = await repo.getJobs({ view: "maybe" });
      expect(maybeJobs.jobs.length).toBeGreaterThan(0);

      const hiddenJobs = await repo.getJobs({ view: "hidden" });
      expect(hiddenJobs.jobs.length).toBeGreaterThan(0);
    });

    it("ensures src/lib/jobs/repository.ts never has NOT (inbound_source IN without COALESCE", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const repoPath = path.resolve(process.cwd(), "src/lib/jobs/repository.ts");
      const content = fs.readFileSync(repoPath, "utf-8");

      // Check if any occurrence of NOT (inbound_source IN exists without COALESCE
      const bareNotPattern = /NOT\s*\(\s*inbound_source\s+IN/i;
      expect(content).not.toMatch(bareNotPattern);

      // Also ensure that whenever inbound_source is queried with IN in SQL WHERE/FILTER clauses, COALESCE is present
      const matches = content.match(/WHERE[^\n]*inbound_source[^\n]*IN/gi) || [];
      for (const m of matches) {
        expect(m).toContain("COALESCE(inbound_source, '')");
      }
    });
  });

  describe("STEP 1: Title Seniority and Level Markers (at least 30 labelled tests)", () => {
    const TITLE_TEST_CASES: Array<{
      label: string;
      title: string;
      expectedSenior: boolean;
      expectedReasonPrefix?: string;
    }> = [
      // Required exact title cases from prompt
      { label: "1. Software Engineer III", title: "Software Engineer III", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "2. Software Engineer III with suffix", title: "Software Engineer III - Python Full Stack Developer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "3. Fullstack Java With React-Software Engineer III", title: "Fullstack Java With React-Software Engineer III", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "4. Software Engineer II", title: "Software Engineer II", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "5. Senior Full Stack Developer", title: "Senior Full Stack Developer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "6. SDE 3", title: "SDE 3", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "7. SDE 2", title: "SDE 2", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "8. SDE 4", title: "SDE 4", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "9. SDE-II", title: "SDE-II", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "10. SWE 2", title: "SWE 2", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "11. SWE 3", title: "SWE 3", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "12. Software Engineer IV", title: "Software Engineer IV", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "13. Software Engineer V", title: "Software Engineer V", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "14. Engineer II", title: "Engineer II", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "15. Backend Engineer III", title: "Backend Engineer III", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "16. Level 2 Software Engineer", title: "Level 2 Software Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "17. Level 3 Developer", title: "Level 3 Developer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "18. Level 4 Platform Engineer", title: "Level 4 Platform Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "19. Level 5 Systems Architect", title: "Level 5 Systems Architect", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "20. L3 Software Engineer", title: "L3 Software Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "21. L4 Software Engineer", title: "L4 Software Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "22. L5 Platform Engineer", title: "L5 Platform Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "23. L6 Staff Engineer", title: "L6 Staff Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "24. L7 Principal Engineer", title: "L7 Principal Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "25. Grade 3+ Software Engineer", title: "Grade 3+ Software Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "26. Grade 4 Developer", title: "Grade 4 Developer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "27. Staff Platform Engineer", title: "Staff Platform Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "28. Principal Cloud Architect", title: "Principal Cloud Architect", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "29. Lead Backend Engineer", title: "Lead Backend Engineer", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "30. Solutions Architect", title: "Solutions Architect", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "31. Engineering Manager", title: "Engineering Manager", expectedSenior: true, expectedReasonPrefix: "title level:" },
      { label: "32. Head of Technology", title: "Head of Technology", expectedSenior: true, expectedReasonPrefix: "title level:" },
      // Negative cases (must NOT be marked as senior)
      { label: "33. Software Engineer I (must NOT be senior)", title: "Software Engineer I", expectedSenior: false },
      { label: "34. SDE 1 (must NOT be senior)", title: "SDE 1", expectedSenior: false },
      { label: "35. Level 1 Developer (must NOT be senior)", title: "Level 1 Developer", expectedSenior: false },
      { label: "36. L1 Software Engineer (must NOT be senior)", title: "L1 Software Engineer", expectedSenior: false },
      { label: "37. L2 Software Engineer (must NOT be senior)", title: "L2 Software Engineer", expectedSenior: false },
      { label: "38. Associate Full Stack Engineer (must NOT be senior)", title: "Associate Full Stack Engineer", expectedSenior: false },
      { label: "39. Graduate Software Engineer (must NOT be senior)", title: "Graduate Software Engineer", expectedSenior: false },
      { label: "40. Python Developer (must NOT be senior)", title: "Python Developer", expectedSenior: false },
      { label: "41. VN3010 - Software Engineer (must NOT be senior)", title: "VN3010 - Software Engineer", expectedSenior: false },
      { label: "42. Civil Engineer (must NOT be senior)", title: "Civil Engineer", expectedSenior: false },
      { label: "43. Vivid Graphics Developer (must NOT be senior)", title: "Vivid Graphics Developer", expectedSenior: false },
      { label: "44. Software Engineering Trainee (must NOT be senior)", title: "Software Engineering Trainee", expectedSenior: false },
      { label: "45. AI Automation Intern (must NOT be senior)", title: "AI Automation Intern", expectedSenior: false },
      { label: "46. Entry Level Developer (must NOT be senior)", title: "Entry Level Developer", expectedSenior: false },
      { label: "47. New Grad SWE (must NOT be senior)", title: "New Grad SWE", expectedSenior: false },
      { label: "48. Software Engineering Apprentice (must NOT be senior)", title: "Software Engineering Apprentice", expectedSenior: false },
    ];

    it(`evaluates all ${TITLE_TEST_CASES.length} labelled title test cases`, () => {
      for (const tc of TITLE_TEST_CASES) {
        const res = classifyExperience(tc.title, "");
        if (tc.expectedSenior) {
          expect(res.expClass, `Failed on: ${tc.label} (${tc.title})`).toBe("senior");
          expect(res.minYears, `Expected minYears >= 2 on: ${tc.label}`).toBeGreaterThanOrEqual(2);
          if (tc.expectedReasonPrefix) {
            expect(res.reason.startsWith(tc.expectedReasonPrefix), `Reason prefix failed on: ${tc.label} (got: ${res.reason})`).toBe(true);
          }
        } else {
          expect(res.expClass, `Expected not senior on: ${tc.label} (${tc.title})`).not.toBe("senior");
        }
      }
    });
  });

  describe("STEP 2: Description Experience Phrases (Labelled Tests)", () => {
    const PHRASE_TEST_CASES: Array<{
      label: string;
      desc: string;
      expectedClass: ExpClass;
      expectedMinYears: number | null;
    }> = [
      {
        label: "Typically 3+ years of professional software engineering experience",
        desc: "Typically 3+ years of professional software engineering experience required.",
        expectedClass: "senior",
        expectedMinYears: 3,
      },
      {
        label: "minimum 3 years",
        desc: "Must have minimum 3 years working with cloud infrastructure.",
        expectedClass: "senior",
        expectedMinYears: 3,
      },
      {
        label: "at least 2 years of experience",
        desc: "Requires at least 2 years of experience in backend development.",
        expectedClass: "senior",
        expectedMinYears: 2,
      },
      {
        label: "3-5 years",
        desc: "Looking for an engineer with 3-5 years of industry experience.",
        expectedClass: "senior",
        expectedMinYears: 3,
      },
      {
        label: "5+ yrs",
        desc: "Ideal candidate has 5+ yrs in distributed systems.",
        expectedClass: "senior",
        expectedMinYears: 5,
      },
      {
        label: "2 to 4 years",
        desc: "We require 2 to 4 years of hands-on experience with Node.js.",
        expectedClass: "senior",
        expectedMinYears: 2,
      },
      {
        label: "3 years' experience",
        desc: "Applicant must possess 3 years' experience in React Native.",
        expectedClass: "senior",
        expectedMinYears: 3,
      },
      {
        label: "experience: 3+ years",
        desc: "Qualifications: experience: 3+ years with relational databases.",
        expectedClass: "senior",
        expectedMinYears: 3,
      },
      {
        label: "0-1 years (stays fresher)",
        desc: "Welcoming developers with 0-1 years of experience in software development.",
        expectedClass: "fresher",
        expectedMinYears: 0,
      },
      {
        label: "0-2 years (stays fresher)",
        desc: "Seeking junior talent with 0-2 years of experience.",
        expectedClass: "fresher",
        expectedMinYears: 0,
      },
      {
        label: "0 to 2 years of experience (stays fresher)",
        desc: "Open to 0 to 2 years of experience in modern web stacks.",
        expectedClass: "fresher",
        expectedMinYears: 0,
      },
      {
        label: "freshers welcome (stays fresher)",
        desc: "Freshers welcome! We provide full mentorship and onboarding.",
        expectedClass: "fresher",
        expectedMinYears: 0,
      },
      {
        label: "no experience required (stays fresher)",
        desc: "No experience required, comprehensive curriculum provided.",
        expectedClass: "fresher",
        expectedMinYears: 0,
      },
      {
        label: "1 year of experience (junior)",
        desc: "Requires 1 year of experience building APIs.",
        expectedClass: "junior",
        expectedMinYears: 1,
      },
    ];

    it(`evaluates all ${PHRASE_TEST_CASES.length} labelled experience phrase test cases`, () => {
      for (const tc of PHRASE_TEST_CASES) {
        const res = classifyExperience("Software Engineer", tc.desc);
        expect(res.expClass, `Failed class on: ${tc.label}`).toBe(tc.expectedClass);
        expect(res.minYears, `Failed minYears on: ${tc.label}`).toBe(tc.expectedMinYears);
      }
    });
  });

  describe("STEP 3: reclassifyLinkedInJobs & Shortlist/Maybe Routing", () => {
    it("reclassifies stored LinkedIn 'Software Engineer III' rows to senior and moves them out of shortlist", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const repo = new InMemoryJobsRepository();

      // Seed 1: Stored LinkedIn job with senior title that was previously stored as unclear
      await repo.upsertJob(
        {
          source: "linkedin",
          sourceId: "li-se-3",
          title: "Software Engineer III",
          company: "JPMorganChase",
          location: "India",
          remoteScope: "India",
          description: "",
          url: "https://www.linkedin.com/jobs/view/1001",
          postedAt: new Date().toISOString(),
          isRemote: true,
          tags: ["java"],
        },
        {
          expClass: "unclear",
          expMinYears: null,
          geoEligibility: "india_ok",
          geoReason: "India allowed",
          summaryLine: "Software Engineer III at JPMorganChase",
          skills: ["Java"],
          matchScore: 80,
        }
      );

      // Seed 2: Stored LinkedIn job with NO description and unclear exp
      await repo.upsertJob(
        {
          source: "linkedin",
          sourceId: "li-no-desc",
          title: "Software Engineer",
          company: "Google",
          location: "India",
          remoteScope: "India",
          description: "",
          url: "https://www.linkedin.com/jobs/view/1002",
          postedAt: new Date().toISOString(),
          isRemote: true,
          tags: ["python"],
        },
        {
          expClass: "unclear",
          expMinYears: null,
          geoEligibility: "india_ok",
          geoReason: "India allowed",
          summaryLine: "Software Engineer at Google",
          skills: ["Python"],
          matchScore: 75,
        }
      );

      // Seed 3: Stored LinkedIn job WITH description and fresher exp
      await repo.upsertJob(
        {
          source: "linkedin",
          sourceId: "li-fresher",
          title: "Software Engineer",
          company: "Microsoft",
          location: "India",
          remoteScope: "India",
          description: "Freshers welcome! 0-1 years experience.",
          url: "https://www.linkedin.com/jobs/view/1003",
          postedAt: new Date().toISOString(),
          isRemote: true,
          tags: ["c#"],
        },
        {
          expClass: "fresher",
          expMinYears: 0,
          geoEligibility: "india_ok",
          geoReason: "India allowed",
          summaryLine: "Software Engineer at Microsoft",
          skills: ["C#"],
          matchScore: 85,
        }
      );

      // Run reclassifyLinkedInJobs
      const res1 = await repo.reclassifyLinkedInJobs();
      expect(res1.updated).toBeGreaterThanOrEqual(1);

      // Verify second run is idempotent (0 updates)
      const res2 = await repo.reclassifyLinkedInJobs();
      expect(res2.updated).toBe(0);

      // Verify views:
      // 1. li-se-3 is now senior -> in hidden, NOT in shortlist
      const jobSe3 = await repo.getJob("linkedin", "li-se-3");
      expect(jobSe3?.exp_class).toBe("senior");
      expect(jobSe3?.filter_reason).toMatch(/^title level:/);

      const shortlist = await repo.getJobs({ view: "shortlist" });
      const shortlistIds = shortlist.jobs.map((j) => j.source_id);
      expect(shortlistIds).not.toContain("li-se-3");
      expect(shortlistIds).not.toContain("li-no-desc"); // Missing description with unclear exp routed out of shortlist
      expect(shortlistIds).toContain("li-fresher");

      // 2. li-no-desc is in Maybe with note
      const maybe = await repo.getJobs({ view: "maybe" });
      const maybeIds = maybe.jobs.map((j) => j.source_id);
      expect(maybeIds).toContain("li-no-desc");
      const jobNoDesc = await repo.getJob("linkedin", "li-no-desc");
      expect(jobNoDesc?.summary_line).toBe("LinkedIn description missing, check experience");

      // 3. li-se-3 is in Hidden
      const hidden = await repo.getJobs({ view: "hidden" });
      const hiddenIds = hidden.jobs.map((j) => j.source_id);
      expect(hiddenIds).toContain("li-se-3");
    });
  });

  describe("hasRealDescription & Non-LinkedIn Maybe Routing + Enrichment", () => {
    it("evaluates labelled hasRealDescription test cases (empty, <80 chars, equals title/company)", () => {
      const REAL_DESC_CASES: Array<{
        label: string;
        description: string | null | undefined;
        title?: string;
        company?: string;
        expected: boolean;
      }> = [
        { label: "null description", description: null, title: "Software Engineer", company: "Acme", expected: false },
        { label: "empty string", description: "", title: "Software Engineer", company: "Acme", expected: false },
        { label: "whitespace only", description: "   \n\t  ", title: "Software Engineer", company: "Acme", expected: false },
        { label: "short description (<80 chars)", description: "Building cloud backend APIs with Node.js and PostgreSQL.", title: "Software Engineer", company: "Acme", expected: false },
        { label: "79-char description", description: "A".repeat(79), title: "Software Engineer", company: "Acme", expected: false },
        { label: "exact 80-char real description", description: "We are looking for a full-stack software engineer to build web products in React", title: "Software Engineer", company: "Acme", expected: true },
        { label: "description equal to title (even when >= 80 chars)", description: "Full Stack Software Engineer - Distributed Cloud Systems and AI Automation Platform Team", title: "Full Stack Software Engineer - Distributed Cloud Systems and AI Automation Platform Team", company: "Acme", expected: false },
        { label: "description equal to company", description: "Acme Global Software Engineering & Cloud Infrastructure Solutions Private Limited India", title: "Software Engineer", company: "Acme Global Software Engineering & Cloud Infrastructure Solutions Private Limited India", expected: false },
        { label: "description equal to 'title at company'", description: "Full Stack Software Engineer for Cloud Infrastructure at Acme Global Technologies Private Limited", title: "Full Stack Software Engineer for Cloud Infrastructure", company: "Acme Global Technologies Private Limited", expected: false },
        { label: "description equal to 'title - company'", description: "Full Stack Software Engineer for Cloud Infrastructure - Acme Global Technologies Private Limited", title: "Full Stack Software Engineer for Cloud Infrastructure", company: "Acme Global Technologies Private Limited", expected: false },
        { label: "valid detailed job description (>80 chars)", description: "Join our engineering team to design and build scalable web applications using TypeScript, Next.js, and PostgreSQL.", title: "Software Engineer", company: "Acme", expected: true },
      ];

      for (const tc of REAL_DESC_CASES) {
        expect(
          hasRealDescription(tc.description, tc.title, tc.company),
          `Failed on: ${tc.label}`
        ).toBe(tc.expected);
      }

      expect(getMissingDescriptionNote("linkedin")).toBe("LinkedIn description missing, check experience");
      expect(getMissingDescriptionNote("email")).toBe("description missing, check experience");
      expect(getMissingDescriptionNote("greenhouse")).toBe("description missing, check experience");
    });

    it("routes non-LinkedIn jobs with unclear exp and missing description to Maybe (NOT Hidden or Shortlist)", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const repo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      // 1. Non-LinkedIn job (source: email) with unclear exp and short/missing description + india_ok geo -> Maybe
      await repo.upsertJob(
        {
          source: "email",
          sourceId: "email-missing-desc",
          title: "Software Engineer",
          company: "CloudScale",
          location: "India (Remote)",
          remoteScope: "India",
          description: "Software Engineer at CloudScale",
          url: "https://wellfound.com/jobs/888778-software-engineer",
          postedAt: nowIso,
          isRemote: true,
          tags: [],
        },
        {
          expClass: "unclear",
          expMinYears: null,
          geoEligibility: "india_ok",
          geoReason: "India allowed",
          summaryLine: getMissingDescriptionNote("email"),
          skills: [],
          matchScore: 65,
        }
      );

      // 2. Non-LinkedIn job (source: greenhouse) with unclear exp and real description (>= 80 chars) + worldwide geo -> Shortlist
      await repo.upsertJob(
        {
          source: "greenhouse",
          sourceId: "gh-real-desc",
          title: "Software Engineer",
          company: "GlobalTech",
          location: "Remote - Worldwide",
          remoteScope: "Worldwide",
          description: "We are hiring a Software Engineer to build distributed microservices using TypeScript, Node.js, and PostgreSQL across our global engineering team.",
          url: "https://boards.greenhouse.io/globaltech/jobs/101",
          postedAt: nowIso,
          isRemote: true,
          tags: ["typescript", "node"],
        },
        {
          expClass: "unclear",
          expMinYears: null,
          geoEligibility: "worldwide",
          geoReason: "Worldwide",
          summaryLine: "Software Engineer at GlobalTech",
          skills: ["TypeScript", "Node.js"],
          matchScore: 80,
        }
      );

      const shortlist = await repo.getJobs({ view: "shortlist" });
      const maybe = await repo.getJobs({ view: "maybe" });
      const hidden = await repo.getJobs({ view: "hidden" });
      const counts = await repo.getViewCounts();

      expect(shortlist.jobs.map((j) => j.source_id)).toEqual(["gh-real-desc"]);
      expect(maybe.jobs.map((j) => j.source_id)).toEqual(["email-missing-desc"]);
      expect(hidden.jobs.map((j) => j.source_id)).not.toContain("email-missing-desc");
      expect(counts.shortlist).toBe(1);
      expect(counts.maybe).toBe(1);
      expect(counts.hidden).toBe(0);
    });

    it("enriches missing descriptions via mocked fetcher: '3+ years' -> senior (hidden), 'freshers welcome' -> fresher (shortlist), failure -> stays Maybe", async () => {
      const { InMemoryJobsRepository } = await import("./repository");
      const { enrichMissingDescriptions } = await import("./pipeline");
      const repo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      // Candidate 1: Will fetch "3+ years" -> senior -> moves to Hidden
      await repo.upsertJob(
        {
          source: "email",
          sourceId: "enrich-senior",
          title: "Backend Engineer",
          company: "AlphaCorp",
          location: "Remote - India",
          remoteScope: "India",
          description: "",
          url: "https://careers.alphacorp.com/jobs/backend-1",
          postedAt: nowIso,
          isRemote: true,
          tags: [],
        },
        {
          expClass: "unclear",
          expMinYears: null,
          geoEligibility: "india_ok",
          geoReason: "India allowed",
          summaryLine: "description missing, check experience",
          skills: [],
          matchScore: 70,
        }
      );

      // Candidate 2: Will fetch "freshers welcome" -> fresher -> moves to Shortlist
      await repo.upsertJob(
        {
          source: "email",
          sourceId: "enrich-fresher",
          title: "Full Stack Developer",
          company: "BetaStart",
          location: "Worldwide",
          remoteScope: "Worldwide",
          description: "Full Stack Developer at BetaStart",
          url: "https://jobs.betastart.io/openings/fullstack-2",
          postedAt: nowIso,
          isRemote: true,
          tags: [],
        },
        {
          expClass: "unclear",
          expMinYears: null,
          geoEligibility: "worldwide",
          geoReason: "Open worldwide",
          summaryLine: "description missing, check experience",
          skills: [],
          matchScore: 78,
        }
      );

      // Candidate 3: Fetch fails -> stays in Maybe, stops retrying after 3 attempts
      await repo.upsertJob(
        {
          source: "email",
          sourceId: "enrich-fail",
          title: "Software Engineer",
          company: "GammaLabs",
          location: "Remote - India",
          remoteScope: "India",
          description: "",
          url: "https://careers.gammalabs.dev/jobs/swe-3",
          postedAt: nowIso,
          isRemote: true,
          tags: [],
        },
        {
          expClass: "unclear",
          expMinYears: null,
          geoEligibility: "india_ok",
          geoReason: "India allowed",
          summaryLine: "description missing, check experience",
          skills: [],
          matchScore: 72,
        }
      );

      // Candidate 4: LinkedIn URL -> must be skipped (login wall)
      await repo.upsertJob(
        {
          source: "linkedin",
          sourceId: "enrich-skip-li",
          title: "Software Engineer",
          company: "DeltaInc",
          location: "India",
          remoteScope: "India",
          description: "",
          url: "https://www.linkedin.com/jobs/view/999888",
          postedAt: nowIso,
          isRemote: true,
          tags: [],
        },
        {
          expClass: "unclear",
          expMinYears: null,
          geoEligibility: "india_ok",
          geoReason: "India allowed",
          summaryLine: "LinkedIn description missing, check experience",
          skills: [],
          matchScore: 74,
        }
      );

      const fetchedUrls: string[] = [];
      const mockFetcher = async (url: string) => {
        fetchedUrls.push(url);
        if (url.includes("alphacorp.com")) {
          return {
            ok: true,
            status: 200,
            finalUrl: url,
            body: `<html><head><script>console.log("ignore")</script></head><body><h1>Backend Engineer</h1><p>We are seeking a Backend Engineer with 3+ years of professional software engineering experience building scalable APIs in Node.js and PostgreSQL.</p></body></html>`,
          };
        }
        if (url.includes("betastart.io")) {
          return {
            ok: true,
            status: 200,
            finalUrl: url,
            body: `<html><body><h1>Full Stack Developer</h1><p>Join our product engineering squad! Freshers welcome. You will build end-to-end features with TypeScript, React, Next.js, and FastAPI in a collaborative remote team.</p></body></html>`,
          };
        }
        return {
          ok: false,
          status: 503,
          finalUrl: url,
          body: "",
          error: "HTTP 503",
        };
      };

      const res = await enrichMissingDescriptions(repo, { fetcherFn: mockFetcher });
      expect(res.attempted).toBe(3); // LinkedIn URL skipped
      expect(res.enriched).toBe(2);
      expect(res.movedToSenior).toBe(1);
      expect(res.movedToShortlist).toBe(1);
      expect(res.failed).toBe(1);
      expect(fetchedUrls).not.toContain("https://www.linkedin.com/jobs/view/999888");

      // Check routing after enrichment:
      const shortlist = await repo.getJobs({ view: "shortlist" });
      const maybe = await repo.getJobs({ view: "maybe" });
      const hidden = await repo.getJobs({ view: "hidden" });

      expect(shortlist.jobs.map((j) => j.source_id)).toEqual(["enrich-fresher"]);
      expect(hidden.jobs.map((j) => j.source_id)).toContain("enrich-senior");
      expect(maybe.jobs.map((j) => j.source_id).sort()).toEqual(["enrich-fail", "enrich-skip-li"]);

      const seniorJob = await repo.getJob("email", "enrich-senior");
      expect(seniorJob?.exp_class).toBe("senior");
      expect(seniorJob?.exp_min_years).toBe(3);
      expect((seniorJob?.raw as Record<string, unknown>)?.expReason).toContain("3+ years");

      const fresherJob = await repo.getJob("email", "enrich-fresher");
      expect(fresherJob?.exp_class).toBe("fresher");
      expect(fresherJob?.exp_min_years).toBe(0);

      // Verify retry limit (max 3 attempts for enrich-fail):
      await enrichMissingDescriptions(repo, { fetcherFn: mockFetcher }); // attempt 2
      await enrichMissingDescriptions(repo, { fetcherFn: mockFetcher }); // attempt 3
      const res4 = await enrichMissingDescriptions(repo, { fetcherFn: mockFetcher }); // should not retry on 4th call
      expect(res4.attempted).toBe(0);
    });
  });

  describe("InMemoryJobsRepository and NeonJobsRepository source & q filter parity", () => {
    it("runs identical filter cases (source, q, view, total) against both InMemoryJobsRepository and NeonJobsRepository", async () => {
      const { InMemoryJobsRepository, NeonJobsRepository, matchesHiddenReason } = await import("./repository");
      const { calculateJobAgeDays } = await import("./freshness");

      const inMemRepo = new InMemoryJobsRepository();
      const nowIso = new Date().toISOString();

      const seedData = [
        // 1. Shortlist: greenhouse, Python/FastAPI
        {
          job: {
            source: "greenhouse",
            sourceId: "gh-1",
            url: "https://boards.greenhouse.io/alpha/jobs/1",
            title: "Junior Backend Engineer",
            company: "Alpha Systems",
            location: "Remote - India",
            remoteScope: "India",
            description: "Build scalable APIs using Python, FastAPI, and PostgreSQL for our distributed platform team.",
            postedAt: nowIso,
            tags: ["python", "fastapi"],
          },
          triaged: {
            expClass: "junior" as const,
            expMinYears: 1,
            geoEligibility: "india_ok" as const,
            geoReason: "India allowed",
            summaryLine: "Junior Backend Engineer at Alpha Systems",
            skills: ["Python", "FastAPI", "PostgreSQL"],
            matchScore: 88,
          },
        },
        // 2. Shortlist: remoteok, TypeScript/Next.js
        {
          job: {
            source: "remoteok",
            sourceId: "rok-1",
            url: "https://remoteok.com/remote-jobs/1",
            title: "Full Stack Developer (Fresher)",
            company: "Beta Cloud",
            location: "Worldwide",
            remoteScope: "Worldwide",
            description: "Fresh graduates welcome to build web applications with TypeScript, React, and Next.js.",
            postedAt: nowIso,
            tags: ["typescript", "nextjs"],
          },
          triaged: {
            expClass: "fresher" as const,
            expMinYears: 0,
            geoEligibility: "worldwide" as const,
            geoReason: "Worldwide",
            summaryLine: "Full Stack Developer at Beta Cloud",
            skills: ["TypeScript", "React", "Next.js"],
            matchScore: 92,
          },
        },
        // 3. Maybe: email, missing description
        {
          job: {
            source: "email",
            sourceId: "em-maybe-1",
            url: "https://wellfound.com/jobs/101",
            title: "Software Engineer",
            company: "Gamma Startup",
            location: "India (Remote)",
            remoteScope: "India",
            description: "Software Engineer at Gamma Startup",
            postedAt: nowIso,
            tags: ["golang"],
          },
          triaged: {
            expClass: "unclear" as const,
            expMinYears: null,
            geoEligibility: "india_ok" as const,
            geoReason: "India allowed",
            summaryLine: "description missing, check experience",
            skills: ["Go", "Docker"],
            matchScore: 70,
          },
        },
        // 4. Hidden: email, senior
        {
          job: {
            source: "email",
            sourceId: "em-hidden-1",
            url: "https://www.naukri.com/job-listings-senior-1",
            title: "Senior Java Architect",
            company: "Delta Enterprise",
            location: "Bengaluru",
            remoteScope: "India",
            description: "Requires 6+ years of Java, Spring Boot, and Kubernetes architecture experience.",
            postedAt: nowIso,
            tags: ["java", "kubernetes"],
          },
          triaged: {
            expClass: "senior" as const,
            expMinYears: 6,
            geoEligibility: "india_ok" as const,
            geoReason: "India allowed",
            filterReason: "title level: senior",
            summaryLine: "Senior Java Architect at Delta Enterprise",
            skills: ["Java", "Spring Boot", "Kubernetes"],
            matchScore: 25,
          },
        },
        // 5. Hidden: linkedin, senior
        {
          job: {
            source: "linkedin",
            sourceId: "li-hidden-1",
            url: "https://www.linkedin.com/jobs/view/555",
            title: "Software Engineer III",
            company: "Epsilon Bank",
            location: "Mumbai",
            remoteScope: "India",
            description: "Requires 4+ years of backend engineering experience in financial services.",
            postedAt: nowIso,
            tags: ["java"],
          },
          triaged: {
            expClass: "senior" as const,
            expMinYears: 4,
            geoEligibility: "india_ok" as const,
            geoReason: "India allowed",
            filterReason: "title level: III",
            summaryLine: "Software Engineer III at Epsilon Bank",
            skills: ["Java", "AWS"],
            matchScore: 30,
          },
        },
        // 6. Inbox: inbound_source = telegram (stored with source = "inbound", inbound_source = "telegram")
        {
          job: {
            source: "telegram",
            sourceId: "tg-inbox-1",
            url: "https://careers.zeta.tech/jobs/1",
            title: "Associate Software Engineer",
            company: "Zeta FinTech",
            location: "Remote",
            remoteScope: "India",
            description: "Zeta FinTech is hiring Associate Software Engineers (0-1 yrs) for Rust and Python services.",
            postedAt: nowIso,
            tags: ["rust", "python"],
            inbound_source: "telegram",
          },
          triaged: {
            expClass: "junior" as const,
            expMinYears: 1,
            geoEligibility: "india_ok" as const,
            geoReason: "India allowed",
            summaryLine: "Associate Software Engineer at Zeta FinTech",
            skills: ["Rust", "Python"],
            matchScore: 84,
          },
        },
      ];

      for (const item of seedData) {
        await inMemRepo.upsertJob(item.job, item.triaged);
      }

      // Extract the stored rows from inMemRepo to back the tagged-template Neon SQL evaluator
      const allStored = Array.from(
        (inMemRepo as unknown as { jobs: Map<string, StoredJob> }).jobs.values()
      );

      // Tagged-template SQL mock for NeonJobsRepository that verifies the SQL template structure
      // and evaluates the parameterized predicates against allStored
      const executedQueries: Array<{ sqlText: string; values: unknown[] }> = [];
      const mockSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sqlText = strings.join("$param");
        executedQueries.push({ sqlText, values });

        const isGetViewCounts = /SELECT\s+COUNT\(\*\)\s+FILTER/i.test(sqlText);
        if (isGetViewCounts) {
          const maxAgeDays = Number(values[0] ?? 10);
          let shortlist = 0;
          let maybe = 0;
          let inbox = 0;
          let hidden = 0;
          let all = 0;
          const reasons = {
            senior_title: 0,
            senior_desc: 0,
            onsite: 0,
            restricted: 0,
            geo_unclear: 0,
            stale: 0,
            language: 0,
            skipped: 0,
            low_relevance: 0,
            missing_desc: 0,
          };
          for (const j of allStored) {
            const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
            const isInbox =
              ["telegram", "whatsapp", "pasted", "paste"].includes(j.inbound_source || "") ||
              ["telegram", "whatsapp", "pasted", "paste"].includes(j.source);

            if (isInbox) {
              if (j.status !== "skipped" && !j.filter_reason && age <= maxAgeDays) {
                inbox++;
              }
              continue;
            }

            if (age <= maxAgeDays) {
              all++;
              const isShortlist =
                (["fresher", "junior"].includes(j.exp_class) ||
                  (j.exp_class === "unclear" && hasRealDescription(j.description, j.title, j.company))) &&
                ["worldwide", "india_ok"].includes(j.geo_eligibility) &&
                j.status !== "skipped" &&
                !j.filter_reason;

              const isMaybe =
                !isShortlist &&
                j.status !== "skipped" &&
                !j.filter_reason &&
                ((["fresher", "junior", "unclear"].includes(j.exp_class) &&
                  j.geo_eligibility === "unclear" &&
                  (j.geo_reason || "").startsWith("remote-unconfirmed:")) ||
                  (j.exp_class === "unclear" &&
                    ["worldwide", "india_ok"].includes(j.geo_eligibility) &&
                    !hasRealDescription(j.description, j.title, j.company)));

              if (isShortlist) {
                shortlist++;
              } else if (isMaybe) {
                maybe++;
              } else {
                hidden++;
              }
            } else {
              hidden++;
            }

            if (matchesHiddenReason(j, "senior_title", maxAgeDays)) reasons.senior_title++;
            if (matchesHiddenReason(j, "senior_desc", maxAgeDays)) reasons.senior_desc++;
            if (matchesHiddenReason(j, "onsite", maxAgeDays)) reasons.onsite++;
            if (matchesHiddenReason(j, "restricted", maxAgeDays)) reasons.restricted++;
            if (matchesHiddenReason(j, "geo_unclear", maxAgeDays)) reasons.geo_unclear++;
            if (matchesHiddenReason(j, "stale", maxAgeDays)) reasons.stale++;
            if (matchesHiddenReason(j, "language", maxAgeDays)) reasons.language++;
            if (matchesHiddenReason(j, "skipped", maxAgeDays)) reasons.skipped++;
            if (matchesHiddenReason(j, "low_relevance", maxAgeDays)) reasons.low_relevance++;
            if (matchesHiddenReason(j, "missing_desc", maxAgeDays)) reasons.missing_desc++;
          }

          return [
            {
              shortlist,
              maybe,
              inbox,
              hidden,
              all,
              ...reasons,
            },
          ];
        }

        // Verify tagged-template SQL contains required source, status, and q clauses
        expect(sqlText).toContain("LOWER(COALESCE(source, ''))");
        expect(sqlText).toContain("LOWER(COALESCE(inbound_source, ''))");
        expect(sqlText).toContain("POSITION(");
        expect(sqlText).toContain("UNNEST(COALESCE(skills, '{}'::text[]))");

        const isCountQuery = /SELECT\s+COUNT\(\*\)::int\s+AS\s+count/i.test(sqlText);
        const isHiddenQuery = sqlText.includes("senior_title");
        const isShortlistQuery =
          !isHiddenQuery &&
          sqlText.includes("WHERE NOT (COALESCE(inbound_source, '')") &&
          sqlText.includes("AND geo_eligibility IN ('worldwide', 'india_ok')") &&
          sqlText.includes("exp_class IN ('fresher', 'junior')");
        const isMaybeQuery =
          !isHiddenQuery &&
          sqlText.includes("remote-unconfirmed:%") &&
          sqlText.includes("LENGTH(TRIM(COALESCE(description, ''))) < 80");
        const isInboxQuery =
          sqlText.includes("WHERE (COALESCE(inbound_source, '') IN ('telegram', 'whatsapp', 'pasted', 'paste')");

        const maxAgeDays = Number(values[0]);
        const sourceFilter = String(values[1] ?? "");
        const statusFilter = String(values[4] ?? "");
        const qFilter = String(values[6] ?? "");
        const reasonFilter = isHiddenQuery ? String(values[10] ?? "") : "";

        const isInboxRow = (j: (typeof allStored)[number]) =>
          ["telegram", "whatsapp", "pasted", "paste"].includes(j.inbound_source || "") ||
          ["telegram", "whatsapp", "pasted", "paste"].includes(j.source);

        const filtered = allStored.filter((j) => {
          const age = calculateJobAgeDays(j.posted_at, j.fetched_at);
          if (isShortlistQuery) {
            if (isInboxRow(j)) return false;
            const validExp =
              ["fresher", "junior"].includes(j.exp_class) ||
              (j.exp_class === "unclear" && hasRealDescription(j.description, j.title, j.company));
            if (!validExp) return false;
            if (!["worldwide", "india_ok"].includes(j.geo_eligibility)) return false;
            if (j.status === "skipped" || j.filter_reason || age > maxAgeDays) return false;
          } else if (isMaybeQuery) {
            if (isInboxRow(j)) return false;
            if (j.status === "skipped" || j.filter_reason || age > maxAgeDays) return false;
            const remoteUnc =
              ["fresher", "junior", "unclear"].includes(j.exp_class) &&
              j.geo_eligibility === "unclear" &&
              (j.geo_reason || "").startsWith("remote-unconfirmed:");
            const missingDesc =
              j.exp_class === "unclear" &&
              ["worldwide", "india_ok"].includes(j.geo_eligibility) &&
              !hasRealDescription(j.description, j.title, j.company);
            if (!remoteUnc && !missingDesc) return false;
          } else if (isInboxQuery) {
            if (!isInboxRow(j)) return false;
            if (j.status === "skipped" || j.filter_reason || age > maxAgeDays) return false;
          } else if (isHiddenQuery) {
            if (isInboxRow(j)) return false;
            if (reasonFilter !== "") {
              if (!matchesHiddenReason(j, reasonFilter, maxAgeDays)) return false;
            } else {
              const isHidden =
                j.exp_class === "senior" ||
                j.geo_eligibility === "restricted" ||
                (j.geo_eligibility === "unclear" && !(j.geo_reason || "").startsWith("remote-unconfirmed:")) ||
                j.status === "skipped" ||
                Boolean(j.filter_reason) ||
                age > maxAgeDays;
              if (!isHidden) return false;
            }
          } else {
            if (isInboxRow(j)) return false;
            if (age > maxAgeDays) return false;
          }

          if (sourceFilter !== "") {
            const matchSrc =
              (j.source || "").toLowerCase() === sourceFilter ||
              (j.inbound_source || "").toLowerCase() === sourceFilter;
            if (!matchSrc) return false;
          }

          if (statusFilter !== "") {
            if ((j.status || "") !== statusFilter) return false;
          }

          if (qFilter !== "") {
            const matchQ =
              (j.title || "").toLowerCase().includes(qFilter) ||
              (j.company || "").toLowerCase().includes(qFilter) ||
              (j.skills || []).some((s: string) => (s || "").toLowerCase().includes(qFilter));
            if (!matchQ) return false;
          }

          return true;
        });

        if (isCountQuery) {
          return [{ count: filtered.length }];
        }

        const limit = Number(values[values.length - 2] ?? 50);
        const offset = Number(values[values.length - 1] ?? 0);
        return filtered.slice(offset, offset + limit);
      }) as unknown as ConstructorParameters<typeof NeonJobsRepository>[0];

      const neonRepo = new NeonJobsRepository(mockSql);

      const PARITY_CASES: Array<{
        label: string;
        opts: Parameters<typeof inMemRepo.getJobs>[0];
        expectedIds: string[];
      }> = [
        {
          label: "source=email in hidden view",
          opts: { view: "hidden", source: "email" },
          expectedIds: ["em-hidden-1"],
        },
        {
          label: "source=linkedin in hidden view",
          opts: { view: "hidden", source: "linkedin" },
          expectedIds: ["li-hidden-1"],
        },
        {
          label: "source=email in maybe view",
          opts: { view: "maybe", source: "email" },
          expectedIds: ["em-maybe-1"],
        },
        {
          label: "source=greenhouse in shortlist view",
          opts: { view: "shortlist", source: "greenhouse" },
          expectedIds: ["gh-1"],
        },
        {
          label: "source=telegram in inbox view (matches inbound_source)",
          opts: { view: "inbox", source: "telegram" },
          expectedIds: ["tg-inbox-1"],
        },
        {
          label: "q matching title ('Architect') in hidden view",
          opts: { view: "hidden", q: "Architect" },
          expectedIds: ["em-hidden-1"],
        },
        {
          label: "q matching company ('Beta Cloud') in shortlist view",
          opts: { view: "shortlist", q: "beta cloud" },
          expectedIds: ["rok-1"],
        },
        {
          label: "q matching skill ('FastAPI') in shortlist view",
          opts: { view: "shortlist", q: "fastapi" },
          expectedIds: ["gh-1"],
        },
        {
          label: "q matching skill ('Rust') in inbox view",
          opts: { view: "inbox", q: "rust" },
          expectedIds: ["tg-inbox-1"],
        },
        {
          label: "combined source=email + q='Java' in all view",
          opts: { view: "all", source: "email", q: "Java" },
          expectedIds: ["em-hidden-1"],
        },
        {
          label: "query that matches nothing in shortlist",
          opts: { view: "shortlist", q: "nonexistent-cobol-mainframe-xyz" },
          expectedIds: [],
        },
        {
          label: "source+q that matches nothing in hidden",
          opts: { view: "hidden", source: "email", q: "Next.js" },
          expectedIds: [],
        },
        {
          label: "hidden view filtered by reason=senior_title",
          opts: { view: "hidden", reason: "senior_title" },
          expectedIds: ["em-hidden-1", "li-hidden-1"],
        },
        {
          label: "hidden view filtered by reason=senior_title + source=email",
          opts: { view: "hidden", reason: "senior_title", source: "email" },
          expectedIds: ["em-hidden-1"],
        },
        {
          label: "hidden view filtered by reason=senior_title + q='Epsilon'",
          opts: { view: "hidden", reason: "senior_title", q: "Epsilon" },
          expectedIds: ["li-hidden-1"],
        },
        {
          label: "hidden view filtered by reason=onsite (no matching jobs in fixture)",
          opts: { view: "hidden", reason: "onsite" },
          expectedIds: [],
        },
        {
          label: "hidden view filtered by reason=stale (no stale jobs in fixture)",
          opts: { view: "hidden", reason: "stale" },
          expectedIds: [],
        },
      ];

      for (const tc of PARITY_CASES) {
        const memRes = await inMemRepo.getJobs(tc.opts);
        const neonRes = await neonRepo.getJobs(tc.opts);

        expect(memRes.jobs.map((j) => j.source_id), `InMemory jobs mismatch on: ${tc.label}`).toEqual(
          tc.expectedIds
        );
        expect(neonRes.jobs.map((j) => j.source_id), `Neon jobs mismatch on: ${tc.label}`).toEqual(
          tc.expectedIds
        );
        expect(memRes.total, `InMemory total mismatch on: ${tc.label}`).toBe(tc.expectedIds.length);
        expect(neonRes.total, `Neon total mismatch on: ${tc.label}`).toBe(tc.expectedIds.length);
      }

      // Tab counts (getViewCounts) remain unfiltered by source, q, or reason
      // Invariant: Shortlist + Maybe + Hidden = All for non-inbox jobs within window, in both repos
      const memCounts = await inMemRepo.getViewCounts();
      expect(memCounts.shortlist).toBe(2);
      expect(memCounts.maybe).toBe(1);
      expect(memCounts.inbox).toBe(1);
      expect(memCounts.hidden).toBe(2);
      expect(memCounts.all).toBe(5);
      expect(memCounts.shortlist + memCounts.maybe + memCounts.hidden).toBe(memCounts.all);
      expect(memCounts.reasons).toBeDefined();
      expect(memCounts.reasons?.senior_title).toBe(2);
      expect(memCounts.reasons?.onsite).toBe(0);

      const neonCounts = await neonRepo.getViewCounts();
      expect(neonCounts.shortlist).toBe(2);
      expect(neonCounts.maybe).toBe(1);
      expect(neonCounts.inbox).toBe(1);
      expect(neonCounts.hidden).toBe(2);
      expect(neonCounts.all).toBe(5);
      expect(neonCounts.shortlist + neonCounts.maybe + neonCounts.hidden).toBe(neonCounts.all);
      expect(neonCounts.reasons).toBeDefined();
      expect(neonCounts.reasons?.senior_title).toBe(2);
      expect(neonCounts.reasons?.onsite).toBe(0);
    });

    it("NeonJobsRepository.upsertJob includes non-downgrade ON CONFLICT clauses for exp_class and geo_eligibility", async () => {
      const { NeonJobsRepository } = await import("./repository");
      let executedSql = "";
      const mockSql = (async (strings: TemplateStringsArray) => {
        executedSql = strings.join("$param");
        return [{ is_new: true }];
      }) as unknown as ConstructorParameters<typeof NeonJobsRepository>[0];

      const neonRepo = new NeonJobsRepository(mockSql);
      const sampleJob: NormalizedJob = {
        source: "remoteok",
        sourceId: "sql-test-1",
        url: "https://remoteok.com/job/test-1",
        title: "Junior Developer",
        company: "TestCorp",
        location: "Worldwide",
        remoteScope: "Worldwide",
        description: "Test description",
        postedAt: new Date().toISOString(),
        tags: ["typescript"],
      };
      const sampleTriaged: TriagedJobResult = {
        expClass: "junior",
        expMinYears: 1,
        geoEligibility: "worldwide",
        geoReason: "Open globally",
        summaryLine: "Junior Developer",
        skills: ["typescript"],
        matchScore: 80,
      };

      await neonRepo.upsertJob(sampleJob, sampleTriaged);

      expect(executedSql).toContain("ON CONFLICT (source, source_id) DO UPDATE SET");
      expect(executedSql).toContain("WHEN jobs.exp_class != 'unclear' AND EXCLUDED.exp_class = 'unclear' THEN jobs.exp_class");
      expect(executedSql).toContain("WHEN jobs.geo_eligibility != 'unclear' AND EXCLUDED.geo_eligibility = 'unclear' THEN jobs.geo_eligibility");
    });
  });
});

describe("Outreach Drafts repository operations parity", () => {
    it("creates, lists, updates, and counts outreach drafts with parity across repositories", async () => {
      const { InMemoryJobsRepository, NeonJobsRepository } = await import("./repository");
      const inMemRepo = new InMemoryJobsRepository();

      // Backing store for Neon mock SQL
      const neonDrafts = new Map<string, OutreachDraft>();
      const mockSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sqlText = strings.join("$param");

        if (sqlText.includes("DELETE FROM outreach_drafts")) {
          const jobId = String(values[0]);
          const kind = String(values[1]);
          for (const [key, d] of neonDrafts.entries()) {
            if (d.job_id === jobId && d.kind === kind && d.status !== "approved") {
              neonDrafts.delete(key);
            }
          }
          return [];
        }

        if (sqlText.includes("INSERT INTO outreach_drafts")) {
          const id = `neon-draft-${neonDrafts.size + 1}`;
          const nowIso = new Date().toISOString();
          const draft: OutreachDraft = {
            id,
            job_id: String(values[0]),
            kind: String(values[1]) as OutreachDraft["kind"],
            subject: values[2] ? String(values[2]) : null,
            body: String(values[3]),
            status: (String(values[4]) as OutreachDraft["status"]) || "draft",
            model: values[5] ? String(values[5]) : null,
            edited: false,
            created_at: nowIso,
            updated_at: nowIso,
          };
          neonDrafts.set(id, draft);
          return [draft];
        }

        if (sqlText.includes("SELECT d.*, j.title AS job_title")) {
          const statusFilter = String(values[0] ?? "");
          const jobIdFilter = String(values[1] ?? "");
          let list = Array.from(neonDrafts.values());
          if (statusFilter) list = list.filter((d) => d.status === statusFilter);
          if (jobIdFilter) list = list.filter((d) => d.job_id === jobIdFilter);
          list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          return list;
        }

        if (sqlText.includes("UPDATE outreach_drafts")) {
          const id = String(values[values.length - 1]);
          const draft = neonDrafts.get(id);
          if (!draft) return [];
          const newSubject = values[0] !== undefined ? (values[0] === null ? null : String(values[0])) : draft.subject;
          const newBody = values[1] !== undefined ? String(values[1]) : draft.body;
          const newStatus = (values[2] !== undefined ? String(values[2]) : draft.status) as OutreachDraft["status"];
          const isEdited = Boolean(values[3]);
          draft.subject = newSubject;
          draft.body = newBody;
          draft.status = newStatus;
          draft.edited = isEdited;
          draft.updated_at = new Date().toISOString();
          return [draft];
        }

        if (sqlText.includes("SELECT * FROM outreach_drafts WHERE id = $param::uuid")) {
          const id = String(values[0]);
          const draft = neonDrafts.get(id);
          return draft ? [draft] : [];
        }

        if (sqlText.includes("COUNT(*) FILTER (WHERE status = 'draft')")) {
          const jobIdFilter = String(values[0] ?? "");
          let list = Array.from(neonDrafts.values());
          if (jobIdFilter) list = list.filter((d) => d.job_id === jobIdFilter);
          const all = list.length;
          const draft = list.filter((d) => d.status === "draft").length;
          const approved = list.filter((d) => d.status === "approved").length;
          const discarded = list.filter((d) => d.status === "discarded").length;
          return [{ all, draft, approved, discarded }];
        }

        if (sqlText.includes("COUNT(DISTINCT job_id)")) {
          const today = new Date().toISOString().slice(0, 10);
          const todayJobs = new Set(
            Array.from(neonDrafts.values())
              .filter((d) => d.created_at.slice(0, 10) === today)
              .map((d) => d.job_id)
          );
          return [{ count: todayJobs.size }];
        }

        return [];
      }) as unknown as ConstructorParameters<typeof NeonJobsRepository>[0];

      const neonRepo = new NeonJobsRepository(mockSql);
      const testJobId = "e2e-job-uuid-1";

      for (const repo of [inMemRepo, neonRepo]) {
        // 1. Create initial drafts
        const created = await repo.createDrafts(testJobId, [
          { kind: "email", subject: "Initial subject", body: "Initial email body" },
          { kind: "linkedin_note", body: "Initial note body" },
          { kind: "linkedin_dm", body: "Initial dm body" },
        ]);
        expect(created).toHaveLength(3);
        expect(created[0].status).toBe("draft");
        expect(created[0].edited).toBe(false);

        // 2. Count drafts
        const counts1 = await repo.countDrafts(testJobId);
        expect(counts1.all).toBe(3);
        expect(counts1.draft).toBe(3);
        expect(counts1.approved).toBe(0);

        // 3. Update one draft body -> edited becomes true
        const emailDraft = created.find((d) => d.kind === "email")!;
        const updated = await repo.updateDraft(emailDraft.id, { body: "Edited email body" });
        expect(updated).not.toBeNull();
        expect(updated?.body).toBe("Edited email body");
        expect(updated?.edited).toBe(true);

        // 4. Approve linkedin_note
        const noteDraft = created.find((d) => d.kind === "linkedin_note")!;
        await repo.updateDraft(noteDraft.id, { status: "approved" });

        // 5. Re-generate drafts for the same job:
        // non-approved (email, dm) are replaced; approved note is PRESERVED
        const regenerated = await repo.createDrafts(testJobId, [
          { kind: "email", subject: "Fresh subject", body: "Fresh email body" },
          { kind: "linkedin_note", body: "Fresh note body" },
          { kind: "linkedin_dm", body: "Fresh dm body" },
        ]);
        expect(regenerated).toHaveLength(3);

        const allDrafts = await repo.listDrafts({ jobId: testJobId });
        // The approved note was preserved, plus the fresh drafts
        expect(allDrafts.some((d) => d.status === "approved" && d.kind === "linkedin_note")).toBe(true);

        // 6. countGenerationsToday
        const gens = await repo.countGenerationsToday();
        expect(gens).toBeGreaterThanOrEqual(1);
      }
    });
  });
