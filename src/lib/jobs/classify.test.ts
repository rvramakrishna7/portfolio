import { describe, it, expect } from "vitest";
import {
  classifyExperience,
  classifyGeo,
  scoreMatch,
  ExpClass,
  GeoEligibility,
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
});
