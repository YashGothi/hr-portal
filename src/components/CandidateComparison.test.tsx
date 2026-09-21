import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CandidateComparison } from "./CandidateComparison";
import type { ComparisonCandidate, PublicJob } from "@/lib/applications.functions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to?: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href: typeof to === "string" ? to : "#", ...props }, children),
}));

const mockJob: PublicJob = {
  id: "job-001",
  job_code: "ENG-BACKEND",
  title: "Senior Cloud Backend Engineer",
  department: "Cloud Engineering",
  location: "San Francisco, CA",
  employment_type: "Full-time",
  description: "Senior role requiring Node.js, TypeScript, Docker, AWS, and PostgreSQL.",
  required_skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS"],
  preferred_skills: ["Redis", "GraphQL"],
  min_experience_years: 5,
  max_experience_years: 10,
  education_requirement: "Bachelor's in Computer Science or related field",
  application_deadline: null,
  status: "active",
};

const candidateA: ComparisonCandidate = {
  id: "cand-aaa",
  job_id: "job-001",
  full_name: "Sarah Jenkins",
  email: "sarah@example.com",
  phone: "+1-555-0101",
  location: "San Francisco, CA",
  applied_role: "Senior Cloud Backend Engineer",
  ats_score: 95,
  ats_category: "Strong Match",
  ats_summary: "Strong alignment across all technical skills and requirements.",
  scoring_version: "v2.0-deterministic",
  ats_scored_at: "2026-09-20T10:00:00Z",
  stage: "shortlisted",
  application_status: "interview_invited",
  auto_shortlisted: true,
  matched_required_skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS"],
  missing_required_skills: [],
  matched_preferred_skills: ["Redis", "GraphQL"],
  missing_preferred_skills: [],
  total_experience_years: 10.2,
  relevant_experience_years: 10.2,
  experience_match: "Strong",
  education_match: "Strong",
  keyword_score: 95,
  ats_breakdown: [
    {
      key: "requiredSkills",
      label: "Required Skills",
      weight: 35,
      score: 100,
      reason: "All matched.",
    },
    {
      key: "relevantExperience",
      label: "Relevant Experience",
      weight: 25,
      score: 100,
      reason: "10.2 yrs exceeds 5 yrs.",
    },
    {
      key: "technicalSkills",
      label: "Technical Skills",
      weight: 15,
      score: 100,
      reason: "Demonstrated full backend stack.",
    },
    {
      key: "education",
      label: "Education",
      weight: 10,
      score: 100,
      reason: "B.S. Computer Science Stanford.",
    },
    {
      key: "keywordMatch",
      label: "Job Description Match",
      weight: 10,
      score: 100,
      reason: "High alignment.",
    },
    {
      key: "preferredSkills",
      label: "Preferred Skills",
      weight: 5,
      score: 100,
      reason: "Matched Redis, GraphQL.",
    },
  ],
  resume_parsed: {
    skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS", "Redis", "GraphQL"],
    total_experience_years: 10.2,
    experience: [{ title: "Staff Engineer", company: "TechCorp", duration: "2019-2026" }],
    education: [
      { qualification: "B.S. Computer Science", institution: "Stanford University", year: "2015" },
    ],
    certifications: ["AWS Solutions Architect"],
  },
  created_at: "2026-09-20T09:00:00Z",
  latestEvaluation: {
    summary: "Exceptional candidate.",
    result: {
      evidence: {
        requiredSkills: {
          "Node.js": {
            skill: "Node.js",
            matched: true,
            evidence:
              "Architected high-throughput microservices using Node.js and TypeScript on AWS",
            confidence: "experience_supported",
          },
        },
      },
    },
    created_at: "2026-09-20T10:00:00Z",
  },
};

const candidateB: ComparisonCandidate = {
  id: "cand-bbb",
  job_id: "job-001",
  full_name: "Marcus Vance",
  email: "marcus@example.com",
  phone: "+1-555-0202",
  location: "Austin, TX",
  applied_role: "Senior Cloud Backend Engineer",
  ats_score: 59,
  ats_category: "Moderate Match",
  ats_summary: "Partial alignment with backend requirements.",
  scoring_version: "v2.0-deterministic",
  ats_scored_at: "2026-09-20T10:15:00Z",
  stage: "application",
  application_status: "filtered_out",
  auto_shortlisted: false,
  matched_required_skills: ["Node.js", "TypeScript", "Docker"],
  missing_required_skills: ["PostgreSQL", "AWS"],
  matched_preferred_skills: ["Redis"],
  missing_preferred_skills: ["GraphQL"],
  total_experience_years: 3.5,
  relevant_experience_years: 3.5,
  experience_match: "Weak",
  education_match: "Related",
  keyword_score: 55,
  ats_breakdown: [
    {
      key: "requiredSkills",
      label: "Required Skills",
      weight: 35,
      score: 60,
      reason: "Missing: PostgreSQL, AWS.",
    },
    {
      key: "relevantExperience",
      label: "Relevant Experience",
      weight: 25,
      score: 50,
      reason: "3.5 yrs is below 5 yrs requirement.",
    },
    {
      key: "technicalSkills",
      label: "Technical Skills",
      weight: 15,
      score: 70,
      reason: "Core competencies demonstrated.",
    },
    {
      key: "education",
      label: "Education",
      weight: 10,
      score: 70,
      reason: "B.S. Information Systems.",
    },
    {
      key: "keywordMatch",
      label: "Job Description Match",
      weight: 10,
      score: 60,
      reason: "Partial alignment.",
    },
    {
      key: "preferredSkills",
      label: "Preferred Skills",
      weight: 5,
      score: 50,
      reason: "Matched Redis.",
    },
  ],
  resume_parsed: {
    skills: ["Node.js", "TypeScript", "Docker", "Redis"],
    total_experience_years: 3.5,
    experience: [{ title: "Backend Developer", company: "StartupX", duration: "2022-2026" }],
    education: [
      { qualification: "B.S. Information Systems", institution: "UT Austin", year: "2022" },
    ],
    certifications: [],
  },
  created_at: "2026-09-20T09:30:00Z",
  latestEvaluation: {
    summary: "Partial candidate.",
    result: {
      evidence: {
        requiredSkills: {
          "Node.js": {
            skill: "Node.js",
            matched: true,
            evidence: "Built RESTful APIs using Node.js and Express",
            confidence: "experience_supported",
          },
        },
      },
    },
    created_at: "2026-09-20T10:15:00Z",
  },
};

const candidateC: ComparisonCandidate = {
  id: "cand-ccc",
  job_id: "job-001",
  full_name: "Chloe Bennett",
  email: "chloe@example.com",
  phone: "+1-555-0303",
  location: "New York, NY",
  applied_role: "Senior Cloud Backend Engineer",
  ats_score: 31,
  ats_category: "Very Low Match",
  ats_summary: "Substantial gaps across core skills.",
  scoring_version: "v2.0-deterministic",
  ats_scored_at: "2026-09-20T10:30:00Z",
  stage: "application",
  application_status: "filtered_out",
  auto_shortlisted: false,
  matched_required_skills: ["TypeScript"],
  missing_required_skills: ["Node.js", "PostgreSQL", "Docker", "AWS"],
  matched_preferred_skills: [],
  missing_preferred_skills: ["Redis", "GraphQL"],
  total_experience_years: 1.5,
  relevant_experience_years: 1.5,
  experience_match: "None",
  education_match: "Not identified",
  keyword_score: 25,
  ats_breakdown: [
    {
      key: "requiredSkills",
      label: "Required Skills",
      weight: 35,
      score: 20,
      reason: "Missing: Node.js, PostgreSQL, Docker, AWS.",
    },
    {
      key: "relevantExperience",
      label: "Relevant Experience",
      weight: 25,
      score: 30,
      reason: "1.5 yrs is below 5 yrs requirement.",
    },
    {
      key: "technicalSkills",
      label: "Technical Skills",
      weight: 15,
      score: 30,
      reason: "Few technical matches.",
    },
    { key: "education", label: "Education", weight: 10, score: 30, reason: "No degree found." },
    {
      key: "keywordMatch",
      label: "Job Description Match",
      weight: 10,
      score: 25,
      reason: "Little overlap.",
    },
    {
      key: "preferredSkills",
      label: "Preferred Skills",
      weight: 5,
      score: 0,
      reason: "No preferred skills.",
    },
  ],
  resume_parsed: {
    skills: ["TypeScript"],
    total_experience_years: 1.5,
    experience: [{ title: "Junior Web Developer", company: "WebStudio", duration: "2024-2026" }],
    education: [],
    certifications: [],
  },
  created_at: "2026-09-20T09:45:00Z",
};

describe("Phase 2: Candidate Comparison UI", () => {
  it("renders side-by-side comparison for 2 candidates from the same job", () => {
    const html = renderToStaticMarkup(
      React.createElement(CandidateComparison, {
        job: mockJob,
        candidates: [candidateA, candidateB],
      }),
    );

    // Job header
    expect(html).toContain("Senior Cloud Backend Engineer");
    expect(html).toContain("ENG-BACKEND");

    // Both candidates displayed
    expect(html).toContain("Sarah Jenkins");
    expect(html).toContain("Marcus Vance");
    expect(html).toContain("sarah@example.com");
    expect(html).toContain("marcus@example.com");

    // ATS scores
    expect(html).toContain("95");
    expect(html).toContain("59");
    expect(html).toContain("Strong Match");
    expect(html).toContain("Moderate Match");

    // Backend shortlist decisions
    expect(html).toContain("Shortlisted (≥85)");
    expect(html).toContain("Filtered Out (&lt;85)");
  });

  it("renders side-by-side comparison for 3 candidates from the same job", () => {
    const html = renderToStaticMarkup(
      React.createElement(CandidateComparison, {
        job: mockJob,
        candidates: [candidateA, candidateB, candidateC],
      }),
    );

    expect(html).toContain("Sarah Jenkins");
    expect(html).toContain("Marcus Vance");
    expect(html).toContain("Chloe Bennett");
    expect(html).toContain("Comparing 3 candidates");
  });

  it("displays all six scoring components clearly", () => {
    const html = renderToStaticMarkup(
      React.createElement(CandidateComparison, {
        job: mockJob,
        candidates: [candidateA, candidateB],
      }),
    );

    expect(html).toContain("1. Required Skills");
    expect(html).toContain("35% Weight");
    expect(html).toContain("2. Relevant Experience");
    expect(html).toContain("25% Weight");
    expect(html).toContain("3. Technical Skills");
    expect(html).toContain("15% Weight");
    expect(html).toContain("4. Education");
    expect(html).toContain("10% Weight");
    expect(html).toContain("5. JD Match");
    expect(html).toContain("6. Preferred Skills");
    expect(html).toContain("5% Weight");
  });

  it("displays matched skills with ✓ and missing skills with ✗", () => {
    const html = renderToStaticMarkup(
      React.createElement(CandidateComparison, {
        job: mockJob,
        candidates: [candidateA, candidateB],
      }),
    );

    // Candidate A has all matched
    expect(html).toContain("✓ Node.js");
    expect(html).toContain("✓ AWS");

    // Candidate B has missing skills
    expect(html).toContain("✗ PostgreSQL");
    expect(html).toContain("✗ AWS");
  });

  it("displays experience and requirement met status accurately", () => {
    const html = renderToStaticMarkup(
      React.createElement(CandidateComparison, {
        job: mockJob,
        candidates: [candidateA, candidateB],
      }),
    );

    expect(html).toContain("10.2 yrs");
    expect(html).toContain("3.5 yrs");
    expect(html).toContain("5 yrs");
    expect(html).toContain("✓ Requirement met");
    expect(html).toContain("✗ Requirement not met");
  });

  it("displays education degrees and matches accurately", () => {
    const html = renderToStaticMarkup(
      React.createElement(CandidateComparison, {
        job: mockJob,
        candidates: [candidateA, candidateB],
      }),
    );

    expect(html).toContain("B.S. Computer Science");
    expect(html).toContain("Stanford University");
    expect(html).toContain("B.S. Information Systems");
    expect(html).toContain("UT Austin");
  });

  it("strictly avoids ranking, winners, recommendations, or evaluative ordering", () => {
    // Pass candidate B first, then candidate A (testing preservation of selection order)
    const html = renderToStaticMarkup(
      React.createElement(CandidateComparison, {
        job: mockJob,
        candidates: [candidateB, candidateA],
      }),
    );

    // Candidate B appears before Candidate A in DOM
    const indexB = html.indexOf("Marcus Vance");
    const indexA = html.indexOf("Sarah Jenkins");
    expect(indexB).toBeLessThan(indexA);

    // Strictly no winner or ranking badges
    expect(html).not.toContain("Top Candidate");
    expect(html).not.toContain("Best Candidate");
    expect(html).not.toContain("Winner");
    expect(html).not.toContain("#1");
    expect(html).not.toContain("#2");
    expect(html).not.toContain("Recommended");
  });

  it("displays explicit disclaimer that comparison does not make a hiring recommendation", () => {
    const html = renderToStaticMarkup(
      React.createElement(CandidateComparison, {
        job: mockJob,
        candidates: [candidateA, candidateB],
      }),
    );

    expect(html).toContain("Displays ATS results without making a hiring recommendation");
  });
});
