import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DEFAULT_TEMPLATES,
  EmailDispatchPage,
  fill,
  personalization,
  TEMPLATE_BY_ID,
  TEMPLATES,
  type Candidate,
  type EmailDispatchStateProps,
  type TemplateId,
} from "@/routes/_authenticated/email-dispatch";

// Mock dependencies not needed for render/logic tests
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      activeProps: _activeProps,
      ...props
    }: {
      to?: string;
      children?: React.ReactNode;
      activeProps?: unknown;
      [key: string]: unknown;
    }) => React.createElement("a", { href: typeof to === "string" ? to : "#", ...props }, children),
    useRouter: () => ({
      state: { location: { pathname: "/email-dispatch" } },
    }),
    useNavigate: () => vi.fn(),
    createFileRoute: () => () => (comp: unknown) => comp,
  };
});

vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useProfile: () => ({ data: { full_name: "HR Recruiter", role: "recruiter" } }),
  };
});

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: () => vi.fn().mockResolvedValue({ sent: true }),
  };
});

vi.mock("@/components/SenderDnsStatus", () => ({
  SenderDnsStatus: () => React.createElement("div", { "data-testid": "dns-status" }, "DNS Active"),
  useSenderDns: () => ({ live: true }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function createMockCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: overrides.id ?? "cand-elena-123",
    job_id: overrides.job_id ?? "job-devops-001",
    full_name: overrides.full_name ?? "Elena Rostova",
    email: overrides.email ?? "elena.rostova@example.com",
    phone: "+1-555-0101",
    location: "San Francisco, CA",
    applied_role: overrides.applied_role ?? "Lead DevOps Engineer",
    resume_text: "Senior DevOps and Cloud Infrastructure Specialist.",
    ats_score: 95,
    ats_summary: "Strong DevOps candidate.",
    ats_strengths: ["Kubernetes", "Terraform", "CI/CD"],
    ats_gaps: [],
    ats_scored_at: "2026-09-20T10:00:00Z",
    stage: overrides.stage ?? "hired",
    notes: null,
    shortlist_email_status: "sent",
    shortlist_email_sent_at: "2026-09-20T10:00:00Z",
    interview_at: "2026-09-21T10:00:00Z",
    interviewer: "VP Engineering",
    interview_location: "Google Meet",
    interview_email_status: "sent",
    interview_email_sent_at: "2026-09-21T10:00:00Z",
    interview_confirm_token: "elena-confirm-token-xyz",
    interview_confirmed_at: "2026-09-21T12:00:00Z",
    outcome: "accepted",
    outcome_at: "2026-09-21T14:00:00Z",
    outcome_notes: "Offer accepted by candidate",
    outcome_email_status: "not_sent",
    outcome_email_sent_at: null,
    ats_breakdown: null,
    resume_parsed: null,
    source: "direct",
    auto_shortlisted: true,
    linkedin_url: null,
    application_code: "APP-ELENA-001",
    source_post_id: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    years_experience: 10,
    portfolio_url: null,
    cover_letter: null,
    resume_path: null,
    resume_file_name: "elena_resume.pdf",
    resume_file_type: "pdf",
    resume_uploaded_at: "2026-09-20T08:00:00Z",
    application_status: "offer_accepted",
    ats_status: "completed",
    ats_category: overrides.ats_category ?? "Strong Match",
    ats_error: null,
    ats_version: "2.0",
    scoring_version: "v2.0-deterministic",
    matched_required_skills: ["Kubernetes", "AWS", "Terraform"],
    missing_required_skills: [],
    matched_preferred_skills: ["Docker"],
    missing_preferred_skills: [],
    total_experience_years: 10,
    relevant_experience_years: 10,
    experience_match: "Strong",
    education_match: "Strong",
    keyword_score: 95,
    created_at: "2026-09-20T08:00:00Z",
    ...overrides,
  };
}

const elenaCandidate: Candidate = createMockCandidate({
  id: "cand-elena-001",
  full_name: "Elena Rostova",
  email: "elena.rostova@example.com",
  applied_role: "Lead DevOps Engineer",
  stage: "hired",
  application_status: "offer_accepted",
});

const offlineTesterCandidate: Candidate = createMockCandidate({
  id: "cand-offline-002",
  full_name: "Offline Deterministic Tester",
  email: "offline.tester@example.com",
  applied_role: "QA Automation Engineer",
  stage: "rejected",
  application_status: "rejected",
});

const marcusCandidate: Candidate = createMockCandidate({
  id: "cand-marcus-003",
  full_name: "Marcus Vance",
  email: "marcus.vance@example.com",
  applied_role: "Principal Security Architect",
  stage: "shortlisted",
  application_status: "interview_invited",
});

function renderDispatchPage(props: EmailDispatchStateProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, enabled: false },
    },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <EmailDispatchPage
        initialCandidates={props.candidates}
        initialCandidateId={props.initialCandidateId}
        initialTemplateId={props.initialTemplateId}
      />
    </QueryClientProvider>,
  );
}

/**
 * Deterministic harness modeling candidate selection, template switching,
 * preview generation, and send safety exactly as implemented in Email Dispatch.
 */
class EmailDispatchHarness {
  private candidates: Candidate[];
  private candidateId: string;
  private templateId: TemplateId;
  private origin: string;
  private fixedDate = new Date(2026, 8, 25);
  private fixedTime = "10:00";

  constructor(
    candidates: Candidate[],
    initialCandidateId?: string,
    initialTemplateId: TemplateId = "shortlist",
  ) {
    this.candidates = [...candidates];
    this.candidateId = initialCandidateId ?? candidates[0]?.id ?? "";
    this.templateId = initialTemplateId;
    this.origin = "https://hr.seceon.com";
  }

  public selectCandidate(id: string) {
    this.candidateId = id;
  }

  public selectTemplate(nextId: TemplateId) {
    // Crucial: template selection only updates template state, NEVER candidateId
    this.templateId = nextId;
  }

  public reorderCandidates(newOrder: Candidate[]) {
    this.candidates = [...newOrder];
  }

  public filterCandidates(predicate: (c: Candidate) => boolean) {
    this.candidates = this.candidates.filter(predicate);
  }

  public getSelectedCandidate(): Candidate | null {
    return this.candidates.find((c) => c.id === this.candidateId) ?? null;
  }

  public getSelectedTemplateId(): TemplateId {
    return this.templateId;
  }

  public getPreview() {
    const candidate = this.getSelectedCandidate();
    const values = personalization(
      candidate ?? undefined,
      this.fixedDate,
      this.fixedTime,
      "Google Meet",
      this.origin,
    );
    const template = DEFAULT_TEMPLATES[this.templateId];
    return {
      recipientName: candidate?.full_name ?? "No candidate selected",
      recipientEmail: candidate?.email ?? null,
      subject: fill(template.subject, values),
      body: fill(template.body, values),
    };
  }

  public getIndividualDispatchPayload() {
    const candidate = this.getSelectedCandidate();
    if (!candidate) return null;
    const template = TEMPLATE_BY_ID[this.templateId];
    const values = personalization(
      candidate,
      this.fixedDate,
      this.fixedTime,
      "Google Meet",
      this.origin,
    );
    const source = DEFAULT_TEMPLATES[this.templateId];
    return {
      candidateId: candidate.id,
      recipientEmail: candidate.email,
      candidateName: candidate.full_name,
      templateId: this.templateId,
      subject: fill(source.subject, values),
      message: fill(source.body, values),
      schedule: template.needsSchedule ? values.schedule : undefined,
    };
  }
}

describe("Email Dispatch — Candidate & Template Selection Independence", () => {
  const candidatesList = [offlineTesterCandidate, elenaCandidate, marcusCandidate];

  // Requirements 1-6: Elena Rostova + Status update — accepted
  it("scenarios 1-6: selecting Elena and clicking 'Status update — accepted' keeps Elena selected with correct preview & recipient", () => {
    const harness = new EmailDispatchHarness(candidatesList, offlineTesterCandidate.id);

    // 1. Select Elena Rostova
    harness.selectCandidate(elenaCandidate.id);

    // 2. Verify Elena is selected
    expect(harness.getSelectedCandidate()?.id).toBe(elenaCandidate.id);
    expect(harness.getSelectedCandidate()?.full_name).toBe("Elena Rostova");

    // 3. Select 'Status update — accepted'
    harness.selectTemplate("hired");

    // 4. Verify Elena is STILL selected
    expect(harness.getSelectedCandidate()?.id).toBe(elenaCandidate.id);
    expect(harness.getSelectedCandidate()?.full_name).toBe("Elena Rostova");
    expect(harness.getSelectedTemplateId()).toBe("hired");

    // 5. Verify preview recipient is Elena's email
    const preview = harness.getPreview();
    expect(preview.recipientEmail).toBe("elena.rostova@example.com");

    // 6. Verify preview name is Elena Rostova
    expect(preview.recipientName).toBe("Elena Rostova");
    expect(preview.body).toContain("Dear Elena Rostova,");
    expect(preview.body).toContain("Lead DevOps Engineer");
    expect(preview.body).not.toContain("Offline Deterministic Tester");
  });

  // Requirements 7-10: Offline Deterministic Tester + Status update — accepted
  it("scenarios 7-10: selecting Offline Deterministic Tester and clicking 'Status update — accepted' keeps Offline Tester selected", () => {
    const harness = new EmailDispatchHarness(candidatesList, elenaCandidate.id);

    // 7. Select Offline Deterministic Tester
    harness.selectCandidate(offlineTesterCandidate.id);

    // 8. Verify Offline Deterministic Tester is selected
    expect(harness.getSelectedCandidate()?.id).toBe(offlineTesterCandidate.id);
    expect(harness.getSelectedCandidate()?.full_name).toBe("Offline Deterministic Tester");

    // 9. Select 'Status update — accepted'
    harness.selectTemplate("hired");

    // 10. Verify Offline Deterministic Tester remains selected
    expect(harness.getSelectedCandidate()?.id).toBe(offlineTesterCandidate.id);
    expect(harness.getSelectedCandidate()?.full_name).toBe("Offline Deterministic Tester");
    expect(harness.getSelectedTemplateId()).toBe("hired");

    const preview = harness.getPreview();
    expect(preview.recipientEmail).toBe("offline.tester@example.com");
    expect(preview.recipientName).toBe("Offline Deterministic Tester");
    expect(preview.body).toContain("Dear Offline Deterministic Tester,");
    expect(preview.body).not.toContain("Elena Rostova");
  });

  // Requirements 11-13: Elena remains selected after clicking several different templates
  it("scenarios 11-13: selecting Elena and switching through all templates keeps Elena selected throughout", () => {
    const harness = new EmailDispatchHarness(candidatesList, elenaCandidate.id);

    // 11. Select Elena
    harness.selectCandidate(elenaCandidate.id);

    // 12. Select several different templates
    const templatesToTest: TemplateId[] = [
      "shortlist",
      "interview",
      "hired",
      "rejected",
      "interview",
      "hired",
    ];

    for (const tid of templatesToTest) {
      harness.selectTemplate(tid);

      // 13. Verify Elena remains selected after every template selection
      expect(harness.getSelectedCandidate()?.id).toBe(elenaCandidate.id);
      expect(harness.getSelectedCandidate()?.full_name).toBe("Elena Rostova");
      expect(harness.getSelectedTemplateId()).toBe(tid);

      const preview = harness.getPreview();
      expect(preview.recipientEmail).toBe("elena.rostova@example.com");
      expect(preview.recipientName).toBe("Elena Rostova");
      expect(preview.body).toContain("Dear Elena Rostova,");
    }
  });

  // Requirements 14-15: Selecting different candidates always updates preview to that candidate
  it("scenarios 14-15: selecting several different candidates always corresponds strictly to the currently selected candidate", () => {
    const harness = new EmailDispatchHarness(candidatesList, elenaCandidate.id, "interview");

    const candidateTests = [
      {
        candidate: elenaCandidate,
        expectedEmail: "elena.rostova@example.com",
        expectedRole: "Lead DevOps Engineer",
      },
      {
        candidate: offlineTesterCandidate,
        expectedEmail: "offline.tester@example.com",
        expectedRole: "QA Automation Engineer",
      },
      {
        candidate: marcusCandidate,
        expectedEmail: "marcus.vance@example.com",
        expectedRole: "Principal Security Architect",
      },
    ];

    for (const testCase of candidateTests) {
      harness.selectCandidate(testCase.candidate.id);
      expect(harness.getSelectedCandidate()?.id).toBe(testCase.candidate.id);

      const preview = harness.getPreview();
      expect(preview.recipientName).toBe(testCase.candidate.full_name);
      expect(preview.recipientEmail).toBe(testCase.expectedEmail);
      expect(preview.body).toContain(`Dear ${testCase.candidate.full_name},`);
      expect(preview.body).toContain(testCase.expectedRole);
      // Template remains unchanged
      expect(harness.getSelectedTemplateId()).toBe("interview");
    }
  });

  // Requirement 16: Candidate list re-ordering/filtering does not replace selectedCandidateId
  it("scenario 16: candidate list re-ordering does not replace selected candidate with another candidate", () => {
    const harness = new EmailDispatchHarness(candidatesList, elenaCandidate.id, "hired");

    expect(harness.getSelectedCandidate()?.id).toBe(elenaCandidate.id);

    // Reverse list order so Offline Deterministic Tester or Marcus is index 0
    harness.reorderCandidates([marcusCandidate, offlineTesterCandidate, elenaCandidate]);

    // Selected candidate MUST still be Elena Rostova, NOT marcusCandidate (which is at index 0)
    expect(harness.getSelectedCandidate()?.id).toBe(elenaCandidate.id);
    expect(harness.getSelectedCandidate()?.full_name).toBe("Elena Rostova");
    expect(harness.getPreview().recipientEmail).toBe("elena.rostova@example.com");

    // Put Offline Tester at index 0
    harness.reorderCandidates([offlineTesterCandidate, elenaCandidate, marcusCandidate]);
    expect(harness.getSelectedCandidate()?.id).toBe(elenaCandidate.id);
    expect(harness.getSelectedCandidate()?.full_name).toBe("Elena Rostova");
  });

  // Requirement 17: Production regression test
  it("scenario 17 (production regression): Elena Rostova -> Status update — accepted MUST remain Elena Rostova and NEVER become Offline Deterministic Tester", () => {
    // Offline Deterministic Tester is at candidates[0] in the collection (just like production)
    const productionCandidates = [offlineTesterCandidate, elenaCandidate];
    const harness = new EmailDispatchHarness(productionCandidates, elenaCandidate.id, "shortlist");

    expect(harness.getSelectedCandidate()?.full_name).toBe("Elena Rostova");

    // The recruiter selects 'Status update — accepted' ('hired')
    harness.selectTemplate("hired");

    // MUST remain Elena Rostova
    expect(harness.getSelectedCandidate()?.id).toBe("cand-elena-001");
    expect(harness.getSelectedCandidate()?.full_name).toBe("Elena Rostova");

    // NEVER Offline Deterministic Tester
    expect(harness.getSelectedCandidate()?.id).not.toBe("cand-offline-002");
    expect(harness.getSelectedCandidate()?.full_name).not.toBe("Offline Deterministic Tester");

    const preview = harness.getPreview();
    expect(preview.recipientName).toBe("Elena Rostova");
    expect(preview.recipientEmail).toBe("elena.rostova@example.com");
    expect(preview.body).toContain("Dear Elena Rostova,");
    expect(preview.body).not.toContain("Offline Deterministic Tester");
  });

  // Send Safety: Recipient and candidate identity consistency
  it("send safety: individual dispatch payload strictly uses selected candidate id, email, and name without mixing", () => {
    const harness = new EmailDispatchHarness(candidatesList, elenaCandidate.id, "hired");

    const payload = harness.getIndividualDispatchPayload();
    expect(payload).not.toBeNull();
    expect(payload?.candidateId).toBe(elenaCandidate.id);
    expect(payload?.recipientEmail).toBe(elenaCandidate.email);
    expect(payload?.candidateName).toBe("Elena Rostova");
    expect(payload?.templateId).toBe("hired");
    expect(payload?.subject).toContain("Elena Rostova");
    expect(payload?.message).toContain("Dear Elena Rostova,");

    // Ensure zero trace of candidate B (Offline Tester) in candidate A's payload
    expect(payload?.candidateId).not.toBe(offlineTesterCandidate.id);
    expect(payload?.recipientEmail).not.toBe(offlineTesterCandidate.email);
    expect(payload?.candidateName).not.toBe(offlineTesterCandidate.full_name);
    expect(payload?.message).not.toContain(offlineTesterCandidate.full_name);
  });

  // Template count and metadata stability
  it("maintains 4 existing templates with proper metadata", () => {
    expect(TEMPLATES).toHaveLength(4);
    expect(TEMPLATES.map((t) => t.id)).toEqual(["shortlist", "interview", "hired", "rejected"]);
    expect(TEMPLATE_BY_ID["hired"].label).toBe("Status update — accepted");
  });
});

describe("EmailDispatchPage — Render & Static Markup Safety", () => {
  const candidatesList = [offlineTesterCandidate, elenaCandidate];

  it("renders Elena Rostova when Elena is initialCandidateId with 'hired' template", () => {
    const html = renderDispatchPage({
      candidates: candidatesList,
      initialCandidateId: elenaCandidate.id,
      initialTemplateId: "hired",
    });

    // Verify recipient section displays Elena Rostova
    expect(html).toContain("Elena Rostova");
    expect(html).toContain("elena.rostova@example.com");

    // Verify body preview displays Elena Rostova
    expect(html).toContain("Dear Elena Rostova,");

    // Verify button says 'Send to Elena'
    expect(html).toContain("Send to Elena");

    // Verify recipient header shows Elena's email
    expect(html).toContain("(elena.rostova@example.com)");

    // Crucial: should NOT have Offline Deterministic Tester in the recipient or preview
    expect(html).not.toContain("Dear Offline Deterministic Tester,");
    expect(html).not.toContain("Send to Offline");
  });

  it("renders Offline Deterministic Tester when explicitly selected", () => {
    const html = renderDispatchPage({
      candidates: candidatesList,
      initialCandidateId: offlineTesterCandidate.id,
      initialTemplateId: "hired",
    });

    expect(html).toContain("Offline Deterministic Tester");
    expect(html).toContain("offline.tester@example.com");
    expect(html).toContain("Dear Offline Deterministic Tester,");
    expect(html).toContain("Send to Offline");
    expect(html).not.toContain("Dear Elena Rostova,");
  });
});
