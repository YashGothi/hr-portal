import { describe, expect, it } from "vitest";
import { parseResume } from "./parser.server";
import { evaluateResume } from "./engine.server";
import { assessTextQuality } from "./extract.server";
import {
  isForbiddenCrossMatch,
  skillVariants,
  evaluateSkillEvidence,
  normalizeSkill,
  matchSkillList,
} from "./skills";
import { SHORTLIST_THRESHOLD, shortlistDecision, ATS_WEIGHTS } from "./weights";
import type { AtsJobRequirements } from "./score";

describe("Production ATS Screening Pipeline", () => {
  const softwareEngineerJob: AtsJobRequirements = {
    title: "Senior Full Stack Engineer",
    department: "Engineering",
    location: "Remote",
    employment_type: "Full-time",
    description:
      "Design and maintain REST APIs, microservices architecture, and scalable frontend applications. Collaborate across agile teams.",
    required_skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker"],
    preferred_skills: ["AWS", "GraphQL"],
    min_experience_years: 5,
    max_experience_years: 10,
    education_requirement: "Bachelor's degree in Computer Science or related field",
  };

  // 1. Synonym and Alias Matching
  describe("Synonym & Alias Matching", () => {
    it("recognizes accepted aliases for core technologies", () => {
      expect(skillVariants("JavaScript")).toContain("js");
      expect(skillVariants("PostgreSQL")).toContain("postgres");
      expect(skillVariants("PostgreSQL")).toContain("psql");
      expect(skillVariants("AWS")).toContain("amazon web services");
      expect(skillVariants("Kubernetes")).toContain("k8s");
      expect(skillVariants("Golang")).toContain("go");
    });
  });

  // 2. False Technology Equivalence Guardrails
  describe("False Technology Equivalence Guardrails", () => {
    it("strictly rejects treating distinct technologies as equivalents", () => {
      expect(isForbiddenCrossMatch("React", "Angular")).toBe(true);
      expect(isForbiddenCrossMatch("React", "Vue")).toBe(true);
      expect(isForbiddenCrossMatch("Python", "Java")).toBe(true);
      expect(isForbiddenCrossMatch("Java", "JavaScript")).toBe(true);
      expect(isForbiddenCrossMatch("AWS", "Azure")).toBe(true);
      expect(isForbiddenCrossMatch("AWS", "GCP")).toBe(true);
      expect(isForbiddenCrossMatch("MongoDB", "PostgreSQL")).toBe(true);
      expect(isForbiddenCrossMatch("Docker", "Kubernetes")).toBe(true);
    });

    it("allows valid identical or alias terms", () => {
      expect(isForbiddenCrossMatch("React", "React.js")).toBe(false);
      expect(isForbiddenCrossMatch("PostgreSQL", "Postgres")).toBe(false);
    });
  });

  // 3. Evidence Traceability & Confidence Levels
  describe("Evidence Traceability & Confidence", () => {
    it("extracts traceable sentence evidence for skills in work experience", () => {
      const resume = `
        Experience:
        Lead Engineer at Acme (2019 - Present)
        - Developed and maintained responsive user interfaces using React and TypeScript.
        - Designed and implemented RESTful microservices with Node.js and PostgreSQL databases.
      `;
      const result = evaluateSkillEvidence("React", resume, [], resume);
      expect(result.matched).toBe(true);
      expect(result.evidence).toContain("React");
      expect(result.confidence).toBe("experience_supported");
    });

    it("distinguishes skills listed only in a keyword block from experience evidence", () => {
      const resume = `
        Skills:
        React, Node.js, Python, Docker

        Experience:
        Account Manager at Firm (2020 - 2023)
        - Coordinated partner relations and client meetings.
      `;
      const result = evaluateSkillEvidence("React", resume, ["react"], "");
      expect(result.matched).toBe(true);
      expect(result.confidence).toBe("listed_only");
    });
  });

  // 4. Non-Overlapping Experience Calculation
  describe("Employment Dates & Overlapping Intervals", () => {
    it("merges overlapping dates without double-counting", () => {
      const resume = `
        Experience:
        Frontend Engineer at Company A (Jan 2020 - Dec 2022)
        Part-time Consultant at Company B (Jun 2020 - Jun 2022)
      `;
      const parsed = parseResume(resume);
      // Jan 2020 to Dec 2022 is exactly 3.0 years (not 3.0 + 2.0 = 5.0)
      expect(parsed.total_experience_years).toBeGreaterThanOrEqual(2.8);
      expect(parsed.total_experience_years).toBeLessThanOrEqual(3.2);
    });

    it("flags ambiguous dates as uncertain without fabricating numbers", () => {
      const resume = `
        Experience:
        Software Engineer at Startup Co
        Built backend services with Go.
      `;
      const parsed = parseResume(resume);
      expect(parsed.dates_uncertain).toBe(true);
      expect(parsed.total_experience_years).toBeNull();
    });
  });

  // 5. Candidate Evaluation: Strong Candidate (>= 85 Shortlisted)
  describe("Candidate Screening Outcomes", () => {
    const strongResume = `
      John Smith - Senior Full Stack Engineer
      john.smith@example.com | San Francisco, CA

      Experience:
      Senior Full Stack Engineer at CloudScale Inc (Jan 2018 - Present)
      - Architected and built high-throughput microservices using Node.js, TypeScript, and Docker.
      - Developed responsive frontend applications with React.js and Tailwind CSS.
      - Designed schema migrations and optimized queries on PostgreSQL databases.
      - Automated CI/CD deployment pipelines on AWS infrastructure.

      Developer at WebWorks (Jan 2016 - Dec 2017)
      - Maintained enterprise REST APIs and integrated GraphQL endpoints.
      - Managed Dockerized container deployments.

      Education:
      Bachelor of Science in Computer Science, State University, 2015

      Skills:
      React, Node.js, TypeScript, PostgreSQL, Docker, AWS, GraphQL
    `;

    it("evaluates strong candidate at or above 85 and shortlists", async () => {
      const outcome = await evaluateResume(softwareEngineerJob, strongResume);
      expect(outcome.result.atsScore).toBeGreaterThanOrEqual(85);
      expect(outcome.result.atsCategory).toBe("Strong Match");
      expect(shortlistDecision(outcome.result.atsScore)).toBe("shortlisted");
      expect(outcome.result.requiredSkills.matched).toHaveLength(5);
      expect(outcome.result.preferredSkills.matched).toHaveLength(2);
      expect(outcome.result.education.match).toBe("Strong");
    });

    it("evaluates weak candidate under 40 and filters out", async () => {
      const weakResume = `
        Graphic Designer
        Experience:
        Designer at Studio (2022 - Present)
        - Created marketing banners using Photoshop and Illustrator.
        Education:
        Bachelor of Fine Arts, 2021
        Skills:
        Photoshop, Illustrator, InDesign
      `;
      const outcome = await evaluateResume(softwareEngineerJob, weakResume);
      expect(outcome.result.atsScore).toBeLessThan(40);
      expect(outcome.result.atsCategory).toBe("Low Match");
      expect(shortlistDecision(outcome.result.atsScore)).toBe("filtered_out");
      expect(outcome.result.requiredSkills.missing).toHaveLength(5);
    });
  });

  // 6. Required vs Preferred Skills Impact
  describe("Skill Priority and Proportional Impact", () => {
    it("reduces required skills score strictly in proportion to missing required skills", async () => {
      const missing2ReqResume = `
        Frontend Developer
        Experience: Engineer (2018 - 2024)
        - Built web apps using React and TypeScript with Node.js backend.
        Education: BS in Computer Science, 2017
        Skills: React, Node.js, TypeScript
      `;
      const outcome = await evaluateResume(softwareEngineerJob, missing2ReqResume);
      expect(outcome.result.requiredSkills.matched).toHaveLength(3);
      expect(outcome.result.requiredSkills.missing).toEqual(["PostgreSQL", "Docker"]);
      // 3/5 * 35 = 21.0
      expect(outcome.result.requiredSkills.score).toBe(21);
      expect(outcome.result.requiredSkills.weight).toBe(35);
    });

    it("allocates preferred skills to the 5% component without penalizing required skills", async () => {
      const missingPrefResume = `
        Alex Engineer
        Experience: Full Stack (2018 - 2024)
        - Built apps with React, Node.js, TypeScript, PostgreSQL, and Docker.
        Education: BS in Computer Science, 2017
        Skills: React, Node.js, TypeScript, PostgreSQL, Docker
      `;
      const outcome = await evaluateResume(softwareEngineerJob, missingPrefResume);
      expect(outcome.result.requiredSkills.score).toBe(35);
      expect(outcome.result.preferredSkills.score).toBe(0);
      expect(outcome.result.preferredSkills.weight).toBe(5);
    });
  });

  // 7. Shortlist Boundary Verification (85 vs 84)
  describe("Shortlisting Threshold Boundary", () => {
    it("shortlists exactly 85 and filters out 84", () => {
      expect(SHORTLIST_THRESHOLD).toBe(85);
      expect(shortlistDecision(85)).toBe("shortlisted");
      expect(shortlistDecision(86)).toBe("shortlisted");
      expect(shortlistDecision(84)).toBe("filtered_out");
      expect(shortlistDecision(84.9)).toBe("filtered_out");
    });
  });

  // 8. Mathematical Integrity
  describe("Mathematical Integrity", () => {
    it("verifies component weights total exactly 100", () => {
      const sum = Object.values(ATS_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });

    it("verifies final score is the exact sum of the six components", async () => {
      const resume = `
        Dev Lead
        Experience: 6 years (2018 - 2024)
        - Built systems with React, Node.js, TypeScript, PostgreSQL, Docker, AWS.
        Education: Bachelor of Science in Computer Science, 2018
        Skills: React, Node.js, TypeScript, PostgreSQL, Docker, AWS
      `;
      const outcome = await evaluateResume(softwareEngineerJob, resume);
      const componentSum = Math.round(
        outcome.result.requiredSkills.score +
          outcome.result.experience.score +
          outcome.result.technicalSkills.score +
          outcome.result.education.score +
          outcome.result.keywordMatch.score +
          outcome.result.preferredSkills.score,
      );
      expect(outcome.result.atsScore).toBe(componentSum);
      expect(outcome.result.atsScore).toBeGreaterThanOrEqual(0);
      expect(outcome.result.atsScore).toBeLessThanOrEqual(100);
    });
  });

  // 9. Fairness Invariance
  describe("Fairness and Demographic Invariance", () => {
    it("produces identical scores regardless of name, gender, or university prestige", async () => {
      const resume1 = `
        Robert Williams
        Experience: Senior Engineer (2017 - 2024)
        - Developed REST APIs with Node.js and TypeScript. Built frontends in React. Docker on AWS.
        Education: Bachelor of Science in Computer Science, State College, 2017
        Skills: React, Node.js, TypeScript, PostgreSQL, Docker, AWS
      `;
      const resume2 = `
        Amina Al-Khatib
        Experience: Senior Engineer (2017 - 2024)
        - Developed REST APIs with Node.js and TypeScript. Built frontends in React. Docker on AWS.
        Education: Bachelor of Science in Computer Science, Prestigious Ivy League University, 2017
        Skills: React, Node.js, TypeScript, PostgreSQL, Docker, AWS
      `;

      const outcome1 = await evaluateResume(softwareEngineerJob, resume1);
      const outcome2 = await evaluateResume(softwareEngineerJob, resume2);

      expect(outcome1.result.atsScore).toBe(outcome2.result.atsScore);
      expect(outcome1.result.education.score).toBe(outcome2.result.education.score);
    });
  });

  // 10. Reproducibility
  describe("Scoring Reproducibility", () => {
    it("produces identical scores across repeated runs for the same resume and job", async () => {
      const resume = `
        Developer
        Experience: Engineer (2019 - 2024)
        - React, Node.js, TypeScript, PostgreSQL, Docker.
        Education: Bachelor in Software Engineering, 2019
        Skills: React, Node.js, TypeScript, PostgreSQL, Docker
      `;
      const run1 = await evaluateResume(softwareEngineerJob, resume);
      const run2 = await evaluateResume(softwareEngineerJob, resume);
      expect(run1.result.atsScore).toBe(run2.result.atsScore);
      expect(run1.result.requiredSkills.score).toBe(run2.result.requiredSkills.score);
    });
  });

  // 11. Parsing Quality & Scanned Document Detection
  describe("Parsing Quality Detection", () => {
    it("flags empty or short text as parsing_failed", () => {
      const quality = assessTextQuality("Too short to be a valid resume.");
      expect(quality.quality).toBe("parsing_failed");
      expect(quality.reason).toBeDefined();
    });

    it("flags garbled text as parsing_failed", () => {
      const garble = "A".repeat(50) + "\uFFFD\u0001\u0002\u0003\u0004\u0005".repeat(20);
      const quality = assessTextQuality(garble);
      expect(quality.quality).toBe("parsing_failed");
    });
  });

  // 12. AI Failure / Offline Resilience
  describe("AI Fallback Resilience", () => {
    it("completes full deterministic evaluation when AI is unavailable", async () => {
      const originalKey = process.env["LOVABLE_API_KEY"];
      delete process.env["LOVABLE_API_KEY"];
      try {
        const resume = `
          Full Stack Developer
          Experience: Senior Engineer (2018 - 2024)
          - Built applications with React, Node.js, TypeScript, PostgreSQL, and Docker.
          Education: BS in Computer Science, 2018
          Skills: React, Node.js, TypeScript, PostgreSQL, Docker
        `;
        const outcome = await evaluateResume(softwareEngineerJob, resume);
        expect(outcome.result.atsScore).toBeGreaterThanOrEqual(80);
        expect(outcome.breakdown).toHaveLength(6);
        expect(outcome.result.requiredSkills.matched).toHaveLength(5);
      } finally {
        if (originalKey) process.env["LOVABLE_API_KEY"] = originalKey;
      }
    });

    it("handles AI malformed response by falling back gracefully to deterministic evaluation", async () => {
      const originalFetch = globalThis.fetch;
      const originalKey = process.env["LOVABLE_API_KEY"];
      process.env["LOVABLE_API_KEY"] = "mock-key";
      globalThis.fetch = async () =>
        new Response("Malformed non-JSON garbage string <<<<<", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });

      try {
        const resume = `
          Full Stack Developer
          Experience: Senior Engineer (2018 - 2024)
          - Built applications with React, Node.js, TypeScript, PostgreSQL, and Docker.
          Education: BS in Computer Science, 2018
          Skills: React, Node.js, TypeScript, PostgreSQL, Docker
        `;
        const outcome = await evaluateResume(softwareEngineerJob, resume);
        expect(outcome.result.atsScore).toBeGreaterThanOrEqual(80);
        expect(outcome.breakdown).toHaveLength(6);
      } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) process.env["LOVABLE_API_KEY"] = originalKey;
        else delete process.env["LOVABLE_API_KEY"];
      }
    });

    it("strictly rejects hallucinated AI skill suggestions that lack resume evidence", () => {
      const resume = `
        Accountant with financial audit experience.
      `;
      // AI claims "React" and "Docker" are present, but resume contains zero evidence
      const match = matchSkillList(["React", "Docker"], resume, [], ["React", "Docker"], "");
      expect(match.matched).toHaveLength(0);
      expect(match.missing).toEqual(["React", "Docker"]);
      expect(match.evidenceMap["React"]?.matched).toBe(false);
    });
  });
});
