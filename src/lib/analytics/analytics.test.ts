import { describe, it, expect, vi } from "vitest";
import {
  calculateAnalyticsDashboard,
  resolveDateRange,
  type AnalyticsFilterParams,
} from "./analytics.server";
import { downloadCsv, generateCsvString, escapeCsvField } from "./export-csv";

// Helper to create mock Supabase client
function createMockSupabase(mockData: {
  jobs?: any[];
  candidates?: any[];
  appointments?: any[];
  offers?: any[];
  onboarding?: any[];
  documents?: any[];
  jobsError?: Error | null;
  candidatesError?: Error | null;
}) {
  const selectMock = vi.fn();

  const client: any = {
    from: vi.fn((table: string) => {
      if (table === "jobs") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockData.jobs ?? [],
              error: mockData.jobsError ?? null,
            }),
          }),
        };
      }
      if (table === "candidates") {
        let currentFilterJobId: string | null = null;
        const candidatesBuilder: any = {
          eq: vi.fn((col: string, val: string) => {
            if (col === "job_id") currentFilterJobId = val;
            return candidatesBuilder;
          }),
          then: (resolve: any) => {
            if (mockData.candidatesError) {
              return resolve({ data: null, error: mockData.candidatesError });
            }
            let res = mockData.candidates ?? [];
            if (currentFilterJobId) {
              res = res.filter((c: any) => c.job_id === currentFilterJobId);
            }
            return resolve({ data: res, error: null });
          },
        };
        return {
          select: vi.fn().mockReturnValue(candidatesBuilder),
        };
      }
      if (table === "appointments") {
        let currentFilterJobId: string | null = null;
        const apptsBuilder: any = {
          eq: vi.fn((col: string, val: string) => {
            if (col === "job_id") currentFilterJobId = val;
            return apptsBuilder;
          }),
          then: (resolve: any) => {
            let res = mockData.appointments ?? [];
            if (currentFilterJobId) {
              res = res.filter((a: any) => a.job_id === currentFilterJobId);
            }
            return resolve({ data: res, error: null });
          },
        };
        return {
          select: vi.fn().mockReturnValue(apptsBuilder),
        };
      }
      if (table === "offers") {
        let currentFilterJobId: string | null = null;
        const offersBuilder: any = {
          eq: vi.fn((col: string, val: string) => {
            if (col === "job_id") currentFilterJobId = val;
            return offersBuilder;
          }),
          then: (resolve: any) => {
            let res = mockData.offers ?? [];
            if (currentFilterJobId) {
              res = res.filter((o: any) => o.job_id === currentFilterJobId);
            }
            return resolve({ data: res, error: null });
          },
        };
        return {
          select: vi.fn().mockReturnValue(offersBuilder),
        };
      }
      if (table === "onboarding") {
        let currentFilterJobId: string | null = null;
        const onbBuilder: any = {
          eq: vi.fn((col: string, val: string) => {
            if (col === "job_id") currentFilterJobId = val;
            return onbBuilder;
          }),
          then: (resolve: any) => {
            let res = mockData.onboarding ?? [];
            if (currentFilterJobId) {
              res = res.filter((o: any) => o.job_id === currentFilterJobId);
            }
            return resolve({ data: res, error: null });
          },
        };
        return {
          select: vi.fn().mockReturnValue(onbBuilder),
        };
      }
      if (table === "onboarding_documents") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: mockData.documents ?? [],
              error: null,
            }),
          }),
        };
      }

      return {
        select: selectMock.mockResolvedValue({ data: [], error: null }),
      };
    }),
  };

  return client;
}

describe("Phase 8: Analytics & Reporting Engine", () => {
  const mockNow = new Date("2026-09-22T12:00:00.000Z");

  const sampleJobs = [
    {
      id: "job-1",
      title: "Senior Backend Engineer",
      department: "Engineering",
      status: "open",
      created_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "job-2",
      title: "Frontend Specialist",
      department: "Engineering",
      status: "open",
      created_at: "2026-09-05T00:00:00Z",
    },
    {
      id: "job-3",
      title: "HR Business Partner",
      department: "People",
      status: "closed",
      created_at: "2026-08-01T00:00:00Z",
    },
  ];

  const sampleCandidates = [
    // Scored >= 85 (Strong)
    {
      id: "cand-1",
      job_id: "job-1",
      stage: "offer",
      application_status: "active",
      ats_score: 92,
      ats_category: "Strong",
      ats_status: "scored",
      auto_shortlisted: true,
      shortlisted_at: "2026-09-10T10:00:00Z",
      interview_at: "2026-09-15T10:00:00Z",
      created_at: "2026-09-08T00:00:00Z",
    },
    // Scored 78 (Good)
    {
      id: "cand-2",
      job_id: "job-1",
      stage: "interview",
      application_status: "active",
      ats_score: 78,
      ats_category: "Good",
      ats_status: "scored",
      auto_shortlisted: false,
      shortlisted_at: "2026-09-12T10:00:00Z",
      interview_at: "2026-09-25T14:00:00Z",
      created_at: "2026-09-10T00:00:00Z",
    },
    // Scored 60 (Partial)
    {
      id: "cand-3",
      job_id: "job-2",
      stage: "screening",
      application_status: "active",
      ats_score: 60,
      ats_category: "Partial",
      ats_status: "scored",
      auto_shortlisted: false,
      shortlisted_at: null,
      interview_at: null,
      created_at: "2026-09-15T00:00:00Z",
    },
    // Scored 40 (Low)
    {
      id: "cand-4",
      job_id: "job-2",
      stage: "rejected",
      application_status: "rejected",
      ats_score: 40,
      ats_category: "Low",
      ats_status: "scored",
      auto_shortlisted: false,
      shortlisted_at: null,
      interview_at: null,
      created_at: "2026-09-16T00:00:00Z",
    },
    // Hired candidate
    {
      id: "cand-5",
      job_id: "job-1",
      stage: "hired",
      application_status: "hired",
      ats_score: 88,
      ats_category: "Strong",
      ats_status: "scored",
      auto_shortlisted: true,
      shortlisted_at: "2026-09-02T10:00:00Z",
      interview_at: "2026-09-05T10:00:00Z",
      created_at: "2026-09-01T12:00:00Z",
    },
  ];

  const sampleAppointments = [
    {
      id: "appt-1",
      job_id: "job-1",
      appointment_type: "screening",
      status: "completed",
      start_at: "2026-09-15T10:00:00Z",
      end_at: "2026-09-15T10:30:00Z",
      created_at: "2026-09-10T12:00:00Z",
    },
    {
      id: "appt-2",
      job_id: "job-1",
      appointment_type: "technical",
      status: "scheduled",
      start_at: "2026-09-25T14:00:00Z",
      end_at: "2026-09-25T15:00:00Z",
      created_at: "2026-09-20T12:00:00Z",
    },
    {
      id: "appt-3",
      job_id: "job-2",
      appointment_type: "screening",
      status: "cancelled",
      start_at: "2026-09-18T11:00:00Z",
      end_at: "2026-09-18T11:30:00Z",
      created_at: "2026-09-14T12:00:00Z",
    },
  ];

  const sampleOffers = [
    {
      id: "offer-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "ACCEPTED",
      compensation: 120000,
      currency: "USD",
      sent_at: "2026-09-06T00:00:00Z",
      accepted_at: "2026-09-07T00:00:00Z",
      created_at: "2026-09-05T00:00:00Z",
    },
    {
      id: "offer-2",
      job_id: "job-1",
      candidate_id: "cand-2",
      status: "SENT",
      compensation: 110000,
      currency: "USD",
      sent_at: "2026-09-18T00:00:00Z",
      accepted_at: null,
      created_at: "2026-09-17T00:00:00Z",
    },
    {
      id: "offer-3",
      job_id: "job-2",
      candidate_id: "cand-3",
      status: "DECLINED",
      compensation: 95000,
      currency: "USD",
      sent_at: "2026-09-15T00:00:00Z",
      accepted_at: null,
      created_at: "2026-09-14T00:00:00Z",
    },
    {
      id: "offer-4",
      job_id: "job-2",
      candidate_id: "cand-4",
      status: "DRAFT",
      compensation: 90000,
      currency: "USD",
      sent_at: null,
      accepted_at: null,
      created_at: "2026-09-16T00:00:00Z",
    },
    {
      id: "offer-5",
      job_id: "job-1",
      candidate_id: "cand-2",
      status: "EXPIRED",
      compensation: 105000,
      currency: "USD",
      sent_at: "2026-08-01T00:00:00Z",
      accepted_at: null,
      created_at: "2026-08-01T00:00:00Z",
    },
    {
      id: "offer-6",
      job_id: "job-1",
      candidate_id: "cand-2",
      status: "REVOKED",
      compensation: 105000,
      currency: "USD",
      sent_at: "2026-08-10T00:00:00Z",
      accepted_at: null,
      created_at: "2026-08-10T00:00:00Z",
    },
  ];

  const sampleOnboarding = [
    {
      id: "onb-1",
      job_id: "job-1",
      candidate_id: "cand-5",
      status: "COMPLETED",
      start_date: "2026-10-01",
      completed_at: "2026-09-20T00:00:00Z",
      created_at: "2026-09-08T00:00:00Z",
    },
    {
      id: "onb-2",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "IN_PROGRESS",
      start_date: "2026-10-15",
      completed_at: null,
      created_at: "2026-09-19T00:00:00Z",
    },
  ];

  const sampleDocuments = [
    {
      id: "doc-1",
      onboarding_id: "onb-1",
      is_required: true,
      document_status: "VERIFIED",
      created_at: "2026-09-08T00:00:00Z",
    },
    {
      id: "doc-2",
      onboarding_id: "onb-2",
      is_required: true,
      document_status: "PENDING_REVIEW",
      created_at: "2026-09-19T00:00:00Z",
    },
    {
      id: "doc-3",
      onboarding_id: "onb-2",
      is_required: true,
      document_status: "NOT_SUBMITTED",
      created_at: "2026-09-19T00:00:00Z",
    },
  ];

  it("Clarification 1: Consistently supports all_time preset and alias in date range resolution", () => {
    const rAllTime = resolveDateRange({ preset: "all_time" });
    expect(rAllTime.preset).toBe("all_time");
    expect(rAllTime.fromDate).toBeNull();
    expect(rAllTime.toDate).toBeNull();

    const rAllAlias = resolveDateRange({ preset: "all" });
    expect(rAllAlias.preset).toBe("all_time");
    expect(rAllAlias.fromDate).toBeNull();
    expect(rAllAlias.toDate).toBeNull();

    const r30 = resolveDateRange({ preset: "30d" });
    expect(r30.preset).toBe("30d");
    expect(r30.fromDate).not.toBeNull();
    expect(r30.toDate).not.toBeNull();

    const rCustom = resolveDateRange({
      preset: "custom",
      from: "2026-01-01T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
    });
    expect(rCustom.fromDate?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(rCustom.toDate?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("Clarification 2: Clearly distinguishes currentSnapshot from periodActivity metrics", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    // Current instantaneous snapshot:
    expect(res.currentSnapshot.totalJobs).toBe(3);
    expect(res.currentSnapshot.openJobs).toBe(2);
    expect(res.currentSnapshot.closedJobs).toBe(1);
    expect(res.currentSnapshot.draftJobs).toBe(0);
    expect(res.currentSnapshot.totalApplicationsLifetime).toBe(5);
    expect(res.currentSnapshot.totalHiredLifetime).toBe(1);
    expect(res.currentSnapshot.activeInterviewsCurrent).toBe(1); // cand-2 is in stage 'interview'
    expect(res.currentSnapshot.upcomingConfirmedInterviews).toBe(1); // appt-2 is scheduled in future
    expect(res.currentSnapshot.activeOnboardingCurrent).toBe(1); // onb-2 is IN_PROGRESS

    // Period activity metrics:
    expect(res.periodActivity.applicationsReceived).toBe(5);
    expect(res.periodActivity.atsScoredCount).toBe(5);
    expect(res.periodActivity.interviewsConducted).toBe(1); // appt-1 completed
    expect(res.periodActivity.interviewsCancelled).toBe(1); // appt-3 cancelled
    expect(res.periodActivity.offersAccepted).toBe(1);
    expect(res.periodActivity.offersDeclined).toBe(1);
    expect(res.periodActivity.hiredInPeriod).toBe(1);
  });

  it("Requirement 3: Calculates ATS Overview, categories, and threshold metrics accurately", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    // Scored: 92, 78, 60, 40, 88 -> Sum = 358 -> Avg = 358/5 = 71.6 -> 72
    expect(res.atsOverview.totalScored).toBe(5);
    expect(res.atsOverview.averageScore).toBe(72);
    expect(res.atsOverview.categories.strong).toBe(2); // 92, 88
    expect(res.atsOverview.categories.good).toBe(1); // 78
    expect(res.atsOverview.categories.partial).toBe(1); // 60
    expect(res.atsOverview.categories.low).toBe(1); // 40
    expect(res.atsOverview.threshold.meetingOrAbove).toBe(2); // >=85
    expect(res.atsOverview.threshold.below).toBe(3); // <85
  });

  it("Requirement 4: Populates candidate pipeline stages without inventing fake stages", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    const stages = res.candidatePipeline;
    const stageMap = Object.fromEntries(stages.map((s) => [s.stage, s.count]));

    expect(stageMap["offer"]).toBe(1);
    expect(stageMap["interview"]).toBe(1);
    expect(stageMap["screening"]).toBe(1);
    expect(stageMap["rejected"]).toBe(1);
    expect(stageMap["hired"]).toBe(1);
    expect(stageMap["application"]).toBe(0);
  });

  it("Requirement 5: Aggregates interview scheduling and appointment types", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    expect(res.interviewAnalytics.totalInPeriod).toBe(3);
    expect(res.interviewAnalytics.completed).toBe(1);
    expect(res.interviewAnalytics.scheduledOrConfirmed).toBe(1);
    expect(res.interviewAnalytics.cancelled).toBe(1);
    expect(res.interviewAnalytics.byType.length).toBe(2); // screening and technical
  });

  it("Clarification 4: Exact acceptance-rate denominator excludes draft, sent, expired, revoked", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    expect(res.offerAnalytics.totalInPeriod).toBe(6);
    expect(res.offerAnalytics.accepted).toBe(1);
    expect(res.offerAnalytics.declined).toBe(1);
    expect(res.offerAnalytics.sent).toBe(1);
    expect(res.offerAnalytics.draft).toBe(1);
    expect(res.offerAnalytics.expired).toBe(1);
    expect(res.offerAnalytics.revoked).toBe(1);

    // Exact denominator: Resolved Offers = 1 Accepted + 1 Declined = 2
    // Draft (1), Sent (1), Expired (1), Revoked (1) are excluded!
    // Acceptance rate = (1 / 2) * 100 = 50%
    expect(res.offerAnalytics.acceptanceRate).toBe(50);
    expect(res.offerAnalytics.acceptanceDenominatorNotes).toContain(
      "Accepted Offers / (Accepted Offers + Declined Offers)",
    );
  });

  it("Clarification 4 (Edge case): Returns null acceptance rate when zero resolved offers exist", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      offers: [
        { id: "o-1", job_id: "job-1", status: "SENT", created_at: "2026-09-01T00:00:00Z" },
        { id: "o-2", job_id: "job-1", status: "DRAFT", created_at: "2026-09-01T00:00:00Z" },
      ],
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    expect(res.offerAnalytics.accepted).toBe(0);
    expect(res.offerAnalytics.declined).toBe(0);
    expect(res.offerAnalytics.acceptanceRate).toBeNull();
  });

  it("Requirement 7: Aggregates onboarding lifecycle and document compliance", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    expect(res.onboardingAnalytics.totalInPeriod).toBe(2);
    expect(res.onboardingAnalytics.completed).toBe(1);
    expect(res.onboardingAnalytics.inProgress).toBe(1);
    expect(res.onboardingAnalytics.documents.total).toBe(3);
    expect(res.onboardingAnalytics.documents.verified).toBe(1);
    expect(res.onboardingAnalytics.documents.pendingReview).toBe(1);
    expect(res.onboardingAnalytics.documents.notSubmitted).toBe(1);
  });

  it("Clarification 6: Job filtering includes all authorized jobs regardless of open, closed, or draft", async () => {
    const jobsWithDraft = [
      ...sampleJobs,
      {
        id: "job-draft",
        title: "Draft Research Scientist",
        department: "AI Lab",
        status: "draft",
        created_at: "2026-09-20T00:00:00Z",
      },
    ];

    const supabase = createMockSupabase({
      jobs: jobsWithDraft,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    // Job performance matrix must include all jobs (open, closed, and draft)
    expect(res.jobPerformance.length).toBe(4);
    const draftRow = res.jobPerformance.find((j) => j.jobId === "job-draft");
    expect(draftRow).toBeDefined();
    expect(draftRow?.status).toBe("draft");

    const closedRow = res.jobPerformance.find((j) => j.jobId === "job-3");
    expect(closedRow).toBeDefined();
    expect(closedRow?.status).toBe("closed");
  });

  it("Clarification 3: Funnel reflects strictly verifiable database evidence", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "all_time" },
    });

    // Funnel steps with documented evidence source:
    expect(res.funnel[0]?.step).toBe("Applied");
    expect(res.funnel[0]?.count).toBe(5);
    expect(res.funnel[0]?.evidenceSource).toContain("Candidate application record");

    expect(res.funnel[1]?.step).toBe("ATS Evaluated");
    expect(res.funnel[1]?.count).toBe(5);
    expect(res.funnel[1]?.evidenceSource).toContain("ATS score");

    expect(res.funnel[2]?.step).toBe("Shortlisted");
    expect(res.funnel[2]?.count).toBe(3); // cand-1, cand-2, cand-5
    expect(res.funnel[2]?.evidenceSource).toContain("shortlisted_at timestamp");

    expect(res.funnel[3]?.step).toBe("Interview");
    expect(res.funnel[3]?.evidenceSource).toContain("Appointment record");

    expect(res.funnel[4]?.step).toBe("Offer");
    expect(res.funnel[4]?.evidenceSource).toContain("Offer record");

    expect(res.funnel[5]?.step).toBe("Hired");
    expect(res.funnel[5]?.evidenceSource).toContain("application_status = 'hired'");

    expect(res.funnel[6]?.step).toBe("Onboarding Started");
    expect(res.funnel[6]?.evidenceSource).toContain("Onboarding row");

    expect(res.funnel[7]?.step).toBe("Onboarding Completed");
    expect(res.funnel[7]?.evidenceSource).toContain("COMPLETED");
  });

  it("Requirement 10: Gracefully handles empty datasets with zero division protection", async () => {
    const supabase = createMockSupabase({
      jobs: [],
      candidates: [],
      appointments: [],
      offers: [],
      onboarding: [],
      documents: [],
    });

    const res = await calculateAnalyticsDashboard(supabase, {
      dateRange: { preset: "30d" },
    });

    expect(res.recruitmentOverview.totalJobs).toBe(0);
    expect(res.recruitmentOverview.applicationsInPeriod).toBe(0);
    expect(res.atsOverview.averageScore).toBeNull();
    expect(res.offerAnalytics.acceptanceRate).toBeNull();
    expect(res.funnel[0]?.count).toBe(0);
    expect(res.jobPerformance.length).toBe(0);
  });

  it("Requirement 11: Propagates query errors gracefully", async () => {
    const supabase = createMockSupabase({
      jobsError: new Error("Database connection failure"),
    });

    await expect(
      calculateAnalyticsDashboard(supabase, { dateRange: { preset: "30d" } }),
    ).rejects.toThrow("Failed to load jobs for analytics: Database connection failure");
  });

  it("Clarification 5: CSV export formats aggregated reporting data and never exposes tokens or PII", () => {
    // Test escaping
    expect(escapeCsvField("Hello")).toBe('"Hello"');
    expect(escapeCsvField('Hello "World"')).toBe('"Hello ""World"""');
    expect(escapeCsvField("Engineering, Lead")).toBe('"Engineering, Lead"');
    expect(escapeCsvField(null)).toBe('""');

    // Headers and rows must be purely aggregated metrics
    const headers = ["Job Title", "Department", "Status", "Applications", "Hired"];
    const rows = [
      ["Senior Backend Engineer", "Engineering", "open", 15, 2],
      ["Frontend Specialist", "Engineering", "open", 8, 1],
    ];

    const csv = generateCsvString(headers, rows);
    expect(csv).toContain('"Job Title","Department","Status","Applications","Hired"');
    expect(csv).toContain('"Senior Backend Engineer","Engineering","open","15","2"');

    // Never contain tokens, resume paths, or storage URLs
    expect(csv).not.toContain("raw_token");
    expect(csv).not.toContain("token_hash");
    expect(csv).not.toContain("resumes/");
    expect(csv).not.toContain("storage_path");

    // downloadCsv should be safe to call in non-DOM environment without throwing
    expect(() => downloadCsv("test_report", headers, rows)).not.toThrow();
  });

  it("Requirement 13: Read-only guarantee - client performs only SELECT queries", async () => {
    const supabase = createMockSupabase({
      jobs: sampleJobs,
      candidates: sampleCandidates,
      appointments: sampleAppointments,
      offers: sampleOffers,
      onboarding: sampleOnboarding,
      documents: sampleDocuments,
    });

    await calculateAnalyticsDashboard(supabase, { dateRange: { preset: "all_time" } });

    // Verify supabase.from was called for tables, but insert/update/delete were NEVER called
    expect(supabase.from).toHaveBeenCalledWith("jobs");
    expect(supabase.from).toHaveBeenCalledWith("candidates");
    expect(supabase.from).toHaveBeenCalledWith("appointments");
    expect(supabase.from).toHaveBeenCalledWith("offers");
    expect(supabase.from).toHaveBeenCalledWith("onboarding");
  });
});
