import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AtsAnalysis } from "./AtsAnalysis";
import type { Candidate, Job } from "@/lib/queries";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        enabled: false,
      },
    },
  });
  return renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, ui));
}

const mockJob: Job = {
  id: "job-123",
  job_code: "ENG-001",
  title: "Senior Full Stack Engineer",
  department: "Engineering",
  location: "Remote",
  employment_type: "Full-time",
  description: "We are seeking a senior engineer proficient in Node.js, TypeScript, and AWS.",
  required_skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS"],
  preferred_skills: ["Redis", "GraphQL"],
  min_experience_years: 5,
  max_experience_years: 10,
  education_requirement: "Bachelor's degree in Computer Science or related field",
  application_deadline: null,
  status: "active",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: null,
};

const baseCandidate: Candidate = {
  id: "cand-123",
  job_id: "job-123",
  full_name: "Sarah Jenkins",
  email: "sarah.jenkins@example.com",
  phone: "+1-555-0199",
  location: "San Francisco, CA",
  applied_role: "Senior Full Stack Engineer",
  resume_text: "Architected microservices using Node.js and TypeScript on AWS.",
  ats_score: 95,
  ats_category: "Strong Match",
  ats_summary: "Exceptional alignment with role requirements and strong technical depth.",
  ats_strengths: ["Node.js", "TypeScript", "PostgreSQL"],
  ats_gaps: [],
  ats_scored_at: "2026-09-20T10:00:00Z",
  stage: "shortlisted",
  notes: null,
  shortlist_email_status: "not_sent",
  shortlist_email_sent_at: null,
  interview_at: null,
  interviewer: null,
  interview_location: null,
  interview_email_status: "not_sent",
  interview_email_sent_at: null,
  interview_confirm_token: null,
  interview_confirmed_at: null,
  outcome: "none",
  outcome_at: null,
  outcome_notes: null,
  outcome_email_status: "not_sent",
  outcome_email_sent_at: null,
  ats_breakdown: [
    {
      key: "requiredSkills",
      label: "Required Skills",
      weight: 35,
      score: 100,
      reason: "All required skills identified in the resume.",
    },
    {
      key: "relevantExperience",
      label: "Relevant Experience",
      weight: 25,
      score: 100,
      reason: "10.2 years exceeds requirement of 5 years.",
    },
    {
      key: "technicalSkills",
      label: "Technical/Professional Skills",
      weight: 15,
      score: 100,
      reason: "Strong backend and infrastructure capabilities.",
    },
    {
      key: "education",
      label: "Education",
      weight: 10,
      score: 100,
      reason: "Meets Bachelor's / Computer Science requirement.",
    },
    {
      key: "keywordMatch",
      label: "Job Description Match",
      weight: 10,
      score: 100,
      reason: "High overlap with role description.",
    },
    {
      key: "preferredSkills",
      label: "Preferred Skills",
      weight: 5,
      score: 100,
      reason: "Matched: Redis, GraphQL.",
    },
  ],
  resume_parsed: {
    skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS", "Redis"],
    total_experience_years: 10.2,
    experience: [
      {
        title: "Staff Software Engineer",
        company: "CloudScale Inc",
        duration: "2020 - Present",
      },
      {
        title: "Senior Backend Developer",
        company: "DataCorp",
        duration: "2015 - 2020",
      },
    ],
    education: [
      {
        qualification: "B.S. Computer Science",
        institution: "Stanford University",
        year: "2015",
      },
    ],
    certifications: ["AWS Solutions Architect"],
  },
  source: "direct",
  auto_shortlisted: true,
  linkedin_url: null,
  application_code: "APP-001",
  source_post_id: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  years_experience: 10,
  portfolio_url: null,
  cover_letter: null,
  resume_path: "resumes/sarah_jenkins.pdf",
  resume_file_name: "sarah_jenkins.pdf",
  resume_file_type: "pdf",
  resume_uploaded_at: "2026-09-20T09:00:00Z",
  application_status: "shortlisted",
  ats_status: "completed",
  ats_error: null,
  ats_version: "2.0",
  scoring_version: "v2.0-deterministic",
  matched_required_skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker", "AWS"],
  missing_required_skills: [],
  matched_preferred_skills: ["Redis", "GraphQL"],
  missing_preferred_skills: [],
  total_experience_years: 10.2,
  relevant_experience_years: 10.2,
  experience_match: "Strong",
  education_match: "Strong",
  keyword_score: 95,
  created_at: "2026-09-20T09:00:00Z",
};

describe("Phase 1: Professional ATS Analysis UI", () => {
  it("renders candidate metadata and all six scoring components", () => {
    const html = renderWithClient(
      React.createElement(AtsAnalysis, { person: baseCandidate, job: mockJob }),
    );

    // Candidate metadata
    expect(html).toContain("Sarah Jenkins");
    expect(html).toContain("sarah.jenkins@example.com");
    expect(html).toContain("+1-555-0199");
    expect(html).toContain("Senior Full Stack Engineer");

    // All six component headers with correct percentage weights
    expect(html).toContain("1. Required Skills");
    expect(html).toContain("35% Weight");
    expect(html).toContain("2. Relevant Experience");
    expect(html).toContain("25% Weight");
    expect(html).toContain("3. Technical/Professional Skills");
    expect(html).toContain("15% Weight");
    expect(html).toContain("4. Education");
    expect(html).toContain("10% Weight");
    expect(html).toContain("5. Job Description Match");
    expect(html).toContain("6. Preferred Skills");
    expect(html).toContain("5% Weight");

    // Total points check
    expect(html).toContain("/ 35 pts");
    expect(html).toContain("/ 25 pts");
    expect(html).toContain("/ 15 pts");
    expect(html).toContain("/ 10 pts");
    expect(html).toContain("/ 5 pts");
  });

  it("displays missing skills clearly separated with ✗ marks", () => {
    const candidateWithMissing: Candidate = {
      ...baseCandidate,
      ats_score: 59,
      ats_category: "Moderate Match",
      application_status: "filtered_out",
      auto_shortlisted: false,
      stage: "application",
      matched_required_skills: ["Node.js", "TypeScript"],
      missing_required_skills: ["PostgreSQL", "Docker", "AWS"],
      ats_breakdown: [
        {
          key: "requiredSkills",
          label: "Required Skills",
          weight: 35,
          score: 40,
          reason: "Missing: PostgreSQL, Docker, AWS.",
        },
      ],
    };

    const html = renderWithClient(
      React.createElement(AtsAnalysis, { person: candidateWithMissing, job: mockJob }),
    );

    expect(html).toContain("Missing Required Skills (3):");
    expect(html).toContain("✗ PostgreSQL");
    expect(html).toContain("✗ Docker");
    expect(html).toContain("✗ AWS");
  });

  it("derives shortlist decision strictly from backend authority (>=85 vs <85)", () => {
    // Shortlisted candidate
    const shortlistedHtml = renderWithClient(
      React.createElement(AtsAnalysis, { person: baseCandidate, job: mockJob }),
    );
    expect(shortlistedHtml).toContain("Shortlisted");
    expect(shortlistedHtml).toContain("Backend verified: Interview token eligible");

    // Filtered out candidate (<85)
    const filteredCandidate: Candidate = {
      ...baseCandidate,
      ats_score: 59,
      ats_category: "Moderate Match",
      application_status: "filtered_out",
      auto_shortlisted: false,
      stage: "application",
    };
    const filteredHtml = renderWithClient(
      React.createElement(AtsAnalysis, { person: filteredCandidate, job: mockJob }),
    );
    expect(filteredHtml).toContain("Filtered Out");
    expect(filteredHtml).toContain("Below 85 shortlisting threshold");
    expect(filteredHtml).toContain("No scheduling action permitted");
  });

  it("displays uncertainty warning when employment dates contain uncertainty without fabricating", () => {
    const candidateWithUncertainDates: Candidate = {
      ...baseCandidate,
      resume_parsed: {
        ...baseCandidate.resume_parsed!,
        // @ts-expect-error test extended property
        dates_uncertain: true,
      },
    };

    const html = renderWithClient(
      React.createElement(AtsAnalysis, {
        person: candidateWithUncertainDates,
        job: mockJob,
      }),
    );

    expect(html).toContain(
      "Employment dates contain uncertainty. ATS did not fabricate missing dates.",
    );
  });

  it("shows education and requirement match clearly without inferring missing details", () => {
    const html = renderWithClient(
      React.createElement(AtsAnalysis, { person: baseCandidate, job: mockJob }),
    );

    expect(html).toContain("B.S. Computer Science");
    expect(html).toContain("Stanford University");
    expect(html).toContain("Bachelor&#x27;s degree in Computer Science or related field");
    expect(html).toContain("Strong match");
  });
});
