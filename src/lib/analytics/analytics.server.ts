import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { STAGES, STAGE_LABELS } from "@/lib/hr";

/**
 * Standard supported date-range filter presets.
 * Supports "all_time" (with legacy "all" alias).
 */
export type DateRangePreset =
  "today" | "7d" | "30d" | "90d" | "this_year" | "all_time" | "all" | "custom";

export interface DateRangeFilter {
  preset?: DateRangePreset;
  from?: string | null;
  to?: string | null;
}

export interface AnalyticsFilterParams {
  jobId?: string | null;
  dateRange?: DateRangeFilter;
}

/**
 * Current instantaneous state of the organization's hiring pipeline.
 * Not bounded by date filter.
 */
export interface CurrentStateSnapshot {
  totalJobs: number;
  openJobs: number;
  closedJobs: number;
  draftJobs: number;
  activeCandidatesTotal: number;
  activeInterviewsCurrent: number; // Candidates currently in stage === 'interview'
  upcomingConfirmedInterviews: number; // Appointments scheduled/confirmed in future
  activeOnboardingCurrent: number; // Onboarding records in NOT_STARTED or IN_PROGRESS
  totalHiredLifetime: number;
  totalApplicationsLifetime: number;
}

/**
 * Event and volume metrics occurring strictly within the selected date range.
 */
export interface PeriodActivityMetrics {
  applicationsReceived: number;
  atsScoredCount: number;
  averageAtsScore: number | null;
  interviewsConducted: number;
  interviewsCancelled: number;
  interviewsRescheduled: number;
  offersCreated: number;
  offersAccepted: number;
  offersDeclined: number;
  onboardingInitiated: number;
  onboardingCompleted: number;
  hiredInPeriod: number;
}

/**
 * Recruitment Overview metrics combining current snapshot and date-filtered period activity.
 */
export interface RecruitmentOverviewMetrics {
  totalJobs: number;
  openJobs: number;
  closedJobs: number;
  draftJobs: number;
  totalApplicationsLifetime: number;
  applicationsInPeriod: number;
  hiredInPeriod: number;
  hiredLifetime: number;
  activeInterviewsCurrent: number;
  activeOnboardingCurrent: number;
}

export interface AtsOverviewMetrics {
  totalScored: number;
  averageScore: number | null;
  categories: {
    strong: number; // >= 85
    good: number; // 70 - 84
    partial: number; // 50 - 69
    low: number; // < 50
    unscored: number;
  };
  threshold: {
    meetingOrAbove: number; // >= 85
    below: number; // < 85
  };
  scoreDistribution: Array<{
    range: string;
    count: number;
  }>;
}

export interface CandidatePipelineStageMetric {
  stage: string;
  label: string;
  count: number;
  percentage: number;
}

export interface InterviewMetrics {
  totalInPeriod: number;
  scheduledOrConfirmed: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
  upcoming: number; // Future appointments with status in scheduled/confirmed
  byType: Array<{
    code: string;
    title: string;
    count: number;
  }>;
}

/**
 * Offer lifecycle metrics.
 *
 * ACCEPTANCE RATE DENOMINATOR DEFINITION:
 * Denominator = Resolved Offers (Accepted Offers + Declined Offers).
 * Draft, Sent (Awaiting Candidate Decision), Expired, and Revoked offers are NOT
 * candidate decisions and are excluded from the denominator.
 * If Resolved Offers === 0, acceptanceRate is null (not 0%) to avoid false negative reporting.
 */
export interface OfferMetrics {
  totalInPeriod: number;
  draft: number;
  sent: number;
  accepted: number;
  declined: number;
  expired: number;
  revoked: number;
  active: number;
  acceptanceRate: number | null;
  acceptanceDenominatorNotes: string;
}

export interface OnboardingMetrics {
  totalInPeriod: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  documents: {
    total: number;
    notSubmitted: number;
    pendingReview: number;
    verified: number;
    rejected: number;
    requiredTotal: number;
    requiredPending: number;
    requiredVerified: number;
    requiredRejected: number;
  };
}

export interface FunnelStepMetric {
  step: string;
  evidenceSource: string;
  description: string;
  count: number;
  conversionFromPrevious: number | null;
}

export interface JobPerformanceRow {
  jobId: string;
  jobTitle: string;
  department: string;
  status: string;
  applications: number;
  shortlisted: number;
  interviews: number;
  offers: number;
  hired: number;
  onboarding: number;
}

export interface AnalyticsDashboardData {
  appliedFilter: {
    preset: DateRangePreset;
    from: string | null;
    to: string | null;
    jobId: string | null;
    jobTitle: string | null;
  };
  currentSnapshot: CurrentStateSnapshot;
  periodActivity: PeriodActivityMetrics;
  recruitmentOverview: RecruitmentOverviewMetrics;
  atsOverview: AtsOverviewMetrics;
  candidatePipeline: CandidatePipelineStageMetric[];
  interviewAnalytics: InterviewMetrics;
  offerAnalytics: OfferMetrics;
  onboardingAnalytics: OnboardingMetrics;
  funnel: FunnelStepMetric[];
  jobPerformance: JobPerformanceRow[];
}

/**
 * Resolves standard date boundaries for a given preset or custom range.
 * Consistently supports "all_time" and legacy alias "all".
 */
export function resolveDateRange(filter?: DateRangeFilter): {
  preset: DateRangePreset;
  fromDate: Date | null;
  toDate: Date | null;
} {
  const preset: DateRangePreset = filter?.preset ?? "30d";
  const now = new Date();

  if (preset === "all" || preset === "all_time") {
    return { preset: "all_time", fromDate: null, toDate: null };
  }

  if (preset === "custom") {
    const fromDate = filter?.from ? new Date(filter.from) : null;
    const toDate = filter?.to ? new Date(filter.to) : null;
    return { preset, fromDate, toDate };
  }

  const toDate = now;
  let fromDate = new Date(now);

  switch (preset) {
    case "today": {
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      break;
    }
    case "7d": {
      fromDate.setDate(now.getDate() - 7);
      break;
    }
    case "30d": {
      fromDate.setDate(now.getDate() - 30);
      break;
    }
    case "90d": {
      fromDate.setDate(now.getDate() - 90);
      break;
    }
    case "this_year": {
      fromDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      break;
    }
    default: {
      fromDate.setDate(now.getDate() - 30);
      break;
    }
  }

  return { preset, fromDate, toDate };
}

/**
 * Checks if an ISO date string falls within [fromDate, toDate].
 */
function isDateWithinRange(
  dateStr: string | null | undefined,
  fromDate: Date | null,
  toDate: Date | null,
): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

/**
 * Primary server-side aggregation engine for HR Analytics.
 * READ-ONLY: Never performs mutations, never alters candidate stages or records.
 */
export async function calculateAnalyticsDashboard(
  supabase: SupabaseClient<Database>,
  params?: AnalyticsFilterParams,
): Promise<AnalyticsDashboardData> {
  const { preset, fromDate, toDate } = resolveDateRange(params?.dateRange);
  const selectedJobId = params?.jobId || null;

  // 1. Fetch All Authorized Jobs (includes open, closed, and draft for complete filtering)
  const { data: allJobsData, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, title, department, status, created_at")
    .order("created_at", { ascending: false });

  if (jobsErr) throw new Error(`Failed to load jobs for analytics: ${jobsErr.message}`);
  const allJobs = allJobsData ?? [];

  const selectedJob = selectedJobId ? (allJobs.find((j) => j.id === selectedJobId) ?? null) : null;

  // 2. Fetch Candidates
  let candidatesQuery = supabase
    .from("candidates")
    .select(
      "id, job_id, stage, application_status, ats_score, ats_category, ats_status, ats_scored_at, auto_shortlisted, shortlisted_at, interview_at, interview_invited_at, interview_confirmed_at, created_at, updated_at",
    );

  if (selectedJobId) {
    candidatesQuery = candidatesQuery.eq("job_id", selectedJobId);
  }

  const { data: allCandidatesData, error: candErr } = await candidatesQuery;
  if (candErr) throw new Error(`Failed to load candidates for analytics: ${candErr.message}`);
  const allCandidates = allCandidatesData ?? [];

  // 3. Fetch Appointments
  let appointmentsQuery = supabase
    .from("appointments")
    .select("id, candidate_id, job_id, appointment_type, status, start_at, end_at, created_at");

  if (selectedJobId) {
    appointmentsQuery = appointmentsQuery.eq("job_id", selectedJobId);
  }

  const { data: allAppointmentsData, error: apptErr } = await appointmentsQuery;
  if (apptErr) throw new Error(`Failed to load interviews for analytics: ${apptErr.message}`);
  const allAppointments = allAppointmentsData ?? [];

  // 4. Fetch Offers
  let offersQuery = supabase
    .from("offers")
    .select(
      "id, candidate_id, job_id, status, compensation, currency, sent_at, accepted_at, declined_at, expires_at, created_at",
    );

  if (selectedJobId) {
    offersQuery = offersQuery.eq("job_id", selectedJobId);
  }

  const { data: allOffersData, error: offerErr } = await offersQuery;
  if (offerErr) throw new Error(`Failed to load offers for analytics: ${offerErr.message}`);
  const allOffers = allOffersData ?? [];

  // 5. Fetch Onboarding
  let onboardingQuery = supabase
    .from("onboarding")
    .select("id, job_id, candidate_id, status, start_date, completed_at, created_at");

  if (selectedJobId) {
    onboardingQuery = onboardingQuery.eq("job_id", selectedJobId);
  }

  const { data: allOnboardingData, error: onbErr } = await onboardingQuery;
  if (onbErr) throw new Error(`Failed to load onboarding for analytics: ${onbErr.message}`);
  const allOnboarding = allOnboardingData ?? [];

  // 6. Fetch Onboarding Documents
  const onboardingIds = allOnboarding.map((o) => o.id);
  let allDocuments: Database["public"]["Tables"]["onboarding_documents"]["Row"][] = [];

  if (onboardingIds.length > 0) {
    const { data: docsData, error: docsErr } = await supabase
      .from("onboarding_documents")
      .select(
        "id, onboarding_id, is_required, document_status, created_at, uploaded_at, reviewed_at",
      )
      .in("onboarding_id", onboardingIds);

    if (docsErr)
      throw new Error(`Failed to load onboarding documents for analytics: ${docsErr.message}`);
    allDocuments = (docsData ??
      []) as Database["public"]["Tables"]["onboarding_documents"]["Row"][];
  }

  // --- FILTER SETS FOR DATE RANGE ---
  const candidatesInPeriod = allCandidates.filter((c) =>
    isDateWithinRange(c.created_at, fromDate, toDate),
  );
  const appointmentsInPeriod = allAppointments.filter((a) =>
    isDateWithinRange(a.start_at || a.created_at, fromDate, toDate),
  );
  const offersInPeriod = allOffers.filter((o) => isDateWithinRange(o.created_at, fromDate, toDate));
  const onboardingInPeriod = allOnboarding.filter((o) =>
    isDateWithinRange(o.created_at, fromDate, toDate),
  );

  // --- CURRENT SNAPSHOT (NOT BOUNDED BY DATE RANGE) ---
  const now = new Date();
  const openJobs = allJobs.filter(
    (j) => j.status?.toLowerCase() === "open" || j.status?.toLowerCase() === "active",
  ).length;
  const closedJobs = allJobs.filter((j) => j.status?.toLowerCase() === "closed").length;
  const draftJobs = allJobs.filter((j) => j.status?.toLowerCase() === "draft").length;

  const totalApplicationsLifetime = allCandidates.length;
  const totalHiredLifetime = allCandidates.filter(
    (c) => c.application_status === "hired" || c.stage === "hired",
  ).length;
  const activeCandidatesTotal = allCandidates.filter(
    (c) => c.application_status === "active" && c.stage !== "rejected" && c.stage !== "hired",
  ).length;

  // Active Interviews Definition: candidates currently in stage === 'interview'
  const activeInterviewsCurrent = allCandidates.filter((c) => c.stage === "interview").length;

  // Upcoming confirmed appointments: status scheduled/confirmed where start_at >= NOW()
  const upcomingConfirmedInterviews = allAppointments.filter((a) => {
    const st = a.status?.toLowerCase();
    const isScheduled = st === "scheduled" || st === "confirmed";
    const isFuture = a.start_at ? new Date(a.start_at) >= now : true;
    return isScheduled && isFuture;
  }).length;

  // Active Onboarding: records with status NOT_STARTED or IN_PROGRESS
  const activeOnboardingCurrent = allOnboarding.filter(
    (o) => o.status === "NOT_STARTED" || o.status === "IN_PROGRESS",
  ).length;

  const currentSnapshot: CurrentStateSnapshot = {
    totalJobs: allJobs.length,
    openJobs,
    closedJobs,
    draftJobs,
    activeCandidatesTotal,
    activeInterviewsCurrent,
    upcomingConfirmedInterviews,
    activeOnboardingCurrent,
    totalHiredLifetime,
    totalApplicationsLifetime,
  };

  // --- SECTION B: ATS OVERVIEW ---
  const scoredCandidates = candidatesInPeriod.filter(
    (c) => typeof c.ats_score === "number" && c.ats_score !== null,
  );

  const totalScored = scoredCandidates.length;
  const averageScore =
    totalScored > 0
      ? Math.round(scoredCandidates.reduce((sum, c) => sum + (c.ats_score ?? 0), 0) / totalScored)
      : null;

  let strongCount = 0;
  let goodCount = 0;
  let partialCount = 0;
  let lowCount = 0;

  for (const c of scoredCandidates) {
    const score = c.ats_score ?? 0;
    const cat = c.ats_category?.toLowerCase();
    if (cat === "strong" || score >= 85) {
      strongCount++;
    } else if (cat === "good" || score >= 70) {
      goodCount++;
    } else if (cat === "partial" || score >= 50) {
      partialCount++;
    } else {
      lowCount++;
    }
  }

  const meetingOrAbove = scoredCandidates.filter((c) => (c.ats_score ?? 0) >= 85).length;
  const belowThreshold = scoredCandidates.filter((c) => (c.ats_score ?? 0) < 85).length;

  const scoreDistribution = [
    { range: "0–49", count: scoredCandidates.filter((c) => (c.ats_score ?? 0) < 50).length },
    {
      range: "50–69",
      count: scoredCandidates.filter((c) => (c.ats_score ?? 0) >= 50 && (c.ats_score ?? 0) < 70)
        .length,
    },
    {
      range: "70–84",
      count: scoredCandidates.filter((c) => (c.ats_score ?? 0) >= 70 && (c.ats_score ?? 0) < 85)
        .length,
    },
    { range: "85–100", count: scoredCandidates.filter((c) => (c.ats_score ?? 0) >= 85).length },
  ];

  // --- SECTION C: CANDIDATE PIPELINE ---
  const totalInScope = candidatesInPeriod.length;
  const candidatePipeline: CandidatePipelineStageMetric[] = STAGES.map((stg) => {
    const count = candidatesInPeriod.filter((c) => c.stage === stg).length;
    const percentage = totalInScope > 0 ? Math.round((count / totalInScope) * 100) : 0;
    return {
      stage: stg,
      label: STAGE_LABELS[stg] || stg,
      count,
      percentage,
    };
  });

  // --- SECTION D: INTERVIEW ANALYTICS ---
  let scheduledOrConfirmed = 0;
  let completedInterviews = 0;
  let cancelledInterviews = 0;
  let rescheduledInterviews = 0;
  let upcomingInterviews = 0;
  const typeMap: Record<string, number> = {};

  for (const a of appointmentsInPeriod) {
    const status = a.status?.toLowerCase() || "";
    if (status === "scheduled" || status === "confirmed") {
      scheduledOrConfirmed++;
      if (a.start_at && new Date(a.start_at) >= now) {
        upcomingInterviews++;
      }
    } else if (status === "completed") {
      completedInterviews++;
    } else if (status === "cancelled") {
      cancelledInterviews++;
    } else if (status === "rescheduled") {
      rescheduledInterviews++;
    }

    const typeCode = a.appointment_type || "standard";
    typeMap[typeCode] = (typeMap[typeCode] || 0) + 1;
  }

  const byType = Object.entries(typeMap).map(([code, count]) => {
    const title =
      code === "screening"
        ? "Initial Phone Screening"
        : code === "technical"
          ? "Technical Interview"
          : code === "final"
            ? "Final Round"
            : code.charAt(0).toUpperCase() + code.slice(1);
    return { code, title, count };
  });

  // --- SECTION E: OFFER ANALYTICS ---
  let draftOffers = 0;
  let sentOffers = 0;
  let acceptedOffers = 0;
  let declinedOffers = 0;
  let expiredOffers = 0;
  let revokedOffers = 0;

  for (const o of offersInPeriod) {
    const st = o.status?.toUpperCase() || "";
    if (st === "DRAFT") draftOffers++;
    else if (st === "SENT") sentOffers++;
    else if (st === "ACCEPTED") acceptedOffers++;
    else if (st === "DECLINED") declinedOffers++;
    else if (st === "EXPIRED") expiredOffers++;
    else if (st === "REVOKED") revokedOffers++;
  }

  const activeOffers = sentOffers; // Offers awaiting candidate response
  const resolvedOffers = acceptedOffers + declinedOffers; // DENOMINATOR: Candidate-resolved decisions only
  const acceptanceRate =
    resolvedOffers > 0 ? Math.round((acceptedOffers / resolvedOffers) * 100) : null;

  // --- SECTION F: ONBOARDING ANALYTICS ---
  let obNotStarted = 0;
  let obInProgress = 0;
  let obCompleted = 0;
  let obCancelled = 0;

  for (const ob of onboardingInPeriod) {
    const st = ob.status?.toUpperCase() || "";
    if (st === "NOT_STARTED") obNotStarted++;
    else if (st === "IN_PROGRESS") obInProgress++;
    else if (st === "COMPLETED") obCompleted++;
    else if (st === "CANCELLED") obCancelled++;
  }

  const periodOnboardingIds = new Set(onboardingInPeriod.map((o) => o.id));
  const docsInPeriod = allDocuments.filter((d) => periodOnboardingIds.has(d.onboarding_id));

  let docNotSubmitted = 0;
  let docPendingReview = 0;
  let docVerified = 0;
  let docRejected = 0;
  let reqTotal = 0;
  let reqPending = 0;
  let reqVerified = 0;
  let reqRejected = 0;

  for (const d of docsInPeriod) {
    const st = d.document_status?.toUpperCase() || "";
    if (st === "NOT_SUBMITTED") docNotSubmitted++;
    else if (st === "PENDING_REVIEW") docPendingReview++;
    else if (st === "VERIFIED") docVerified++;
    else if (st === "REJECTED") docRejected++;

    if (d.is_required) {
      reqTotal++;
      if (st === "PENDING_REVIEW") reqPending++;
      else if (st === "VERIFIED") reqVerified++;
      else if (st === "REJECTED") reqRejected++;
    }
  }

  // --- SECTION G: FUNNEL VISUALIZATION (VERIFIABLE DATABASE EVIDENCE ONLY) ---
  // In accordance with Clarification 3: Build only from verifiable database evidence;
  // do NOT infer historical stages from current stage alone!

  // Lookup sets of candidates with concrete related records:
  const candidateIdsWithAppointments = new Set(
    allAppointments.map((a) => a.candidate_id).filter(Boolean),
  );
  const candidateIdsOnOffers = new Set(allOffers.map((o) => o.candidate_id).filter(Boolean));
  const candidateIdsAcceptedOffers = new Set(
    allOffers
      .filter((o) => o.status === "ACCEPTED" || o.accepted_at !== null)
      .map((o) => o.candidate_id)
      .filter(Boolean),
  );
  const candidateIdsOnboardingStarted = new Set(
    allOnboarding.map((o) => o.candidate_id).filter(Boolean),
  );
  const candidateIdsOnboardingCompleted = new Set(
    allOnboarding
      .filter((o) => o.status === "COMPLETED" || o.completed_at !== null)
      .map((o) => o.candidate_id)
      .filter(Boolean),
  );

  // 1. Applied: Actual application records created in the selected range
  const funnelApps = candidatesInPeriod.length;

  // 2. ATS Evaluated: Verifiable evidence: ats_score is numeric OR ats_scored_at is not null
  const funnelScored = candidatesInPeriod.filter(
    (c) => (typeof c.ats_score === "number" && c.ats_score !== null) || Boolean(c.ats_scored_at),
  ).length;

  // 3. Shortlisted: Verifiable evidence: shortlisted_at timestamp is set OR auto_shortlisted is true
  const funnelShortlisted = candidatesInPeriod.filter(
    (c) => Boolean(c.shortlisted_at) || Boolean(c.auto_shortlisted),
  ).length;

  // 4. Interview: Verifiable evidence: Appointment record exists in appointments OR candidate has interview_at / interview_confirmed_at / interview_invited_at
  const funnelInterview = candidatesInPeriod.filter(
    (c) =>
      candidateIdsWithAppointments.has(c.id) ||
      Boolean(c.interview_at) ||
      Boolean(c.interview_confirmed_at) ||
      Boolean(c.interview_invited_at),
  ).length;

  // 5. Offer Extended: Verifiable evidence: Offer record exists in offers table for this candidate
  const funnelOffer = candidatesInPeriod.filter((c) => candidateIdsOnOffers.has(c.id)).length;

  // 6. Hired: Verifiable evidence: application_status is 'hired' OR accepted offer record exists
  const funnelHired = candidatesInPeriod.filter(
    (c) => c.application_status === "hired" || candidateIdsAcceptedOffers.has(c.id),
  ).length;

  // 7. Onboarding Started: Verifiable evidence: Onboarding record exists in onboarding table
  const funnelOnboarding = candidatesInPeriod.filter((c) =>
    candidateIdsOnboardingStarted.has(c.id),
  ).length;

  // 8. Onboarding Completed: Verifiable evidence: Onboarding record has status === 'COMPLETED'
  const funnelCompleted = candidatesInPeriod.filter((c) =>
    candidateIdsOnboardingCompleted.has(c.id),
  ).length;

  const funnelStepsRaw = [
    {
      step: "Applied",
      evidenceSource: "Candidate application record created in period",
      description: "Applications received within the selected date range",
      count: funnelApps,
    },
    {
      step: "ATS Evaluated",
      evidenceSource: "ATS score or ats_scored_at timestamp present",
      description: "Screened and evaluated by ATS scoring engine",
      count: funnelScored,
    },
    {
      step: "Shortlisted",
      evidenceSource: "shortlisted_at timestamp or auto_shortlisted flag verified",
      description: "Formally qualified and recorded as shortlisted",
      count: funnelShortlisted,
    },
    {
      step: "Interview",
      evidenceSource: "Appointment record created or interview timestamp set",
      description: "Invited, booked, or completed an interview session",
      count: funnelInterview,
    },
    {
      step: "Offer",
      evidenceSource: "Offer record created in offers table",
      description: "Formal offer package generated",
      count: funnelOffer,
    },
    {
      step: "Hired",
      evidenceSource: "application_status = 'hired' or accepted offer verified",
      description: "Offer accepted and candidate marked hired",
      count: funnelHired,
    },
    {
      step: "Onboarding Started",
      evidenceSource: "Onboarding row created in onboarding table",
      description: "Onboarding record and compliance requirements initialized",
      count: funnelOnboarding,
    },
    {
      step: "Onboarding Completed",
      evidenceSource: "Onboarding record status = 'COMPLETED' verified",
      description: "All required compliance documents approved by staff",
      count: funnelCompleted,
    },
  ];

  const funnel: FunnelStepMetric[] = funnelStepsRaw.map((item, idx) => {
    let conversion: number | null = null;
    if (idx > 0) {
      const prev = funnelStepsRaw[idx - 1]?.count ?? 0;
      conversion = prev > 0 ? Math.round((item.count / prev) * 100) : null;
    }
    return {
      step: item.step,
      evidenceSource: item.evidenceSource,
      description: item.description,
      count: item.count,
      conversionFromPrevious: conversion,
    };
  });

  // --- SECTION H: JOB PERFORMANCE BREAKDOWN (ALL JOBS REGARDLESS OF STATUS) ---
  const jobPerformance: JobPerformanceRow[] = allJobs.map((job) => {
    const jobCandidates = candidatesInPeriod.filter((c) => c.job_id === job.id);
    const jobApps = jobCandidates.length;
    const jobShortlisted = jobCandidates.filter(
      (c) => Boolean(c.shortlisted_at) || Boolean(c.auto_shortlisted),
    ).length;
    const jobInterviews = appointmentsInPeriod.filter((a) => a.job_id === job.id).length;
    const jobOffers = offersInPeriod.filter((o) => o.job_id === job.id).length;
    const jobHires = jobCandidates.filter(
      (c) => c.application_status === "hired" || c.stage === "hired",
    ).length;
    const jobOnboardings = onboardingInPeriod.filter((o) => o.job_id === job.id).length;

    return {
      jobId: job.id,
      jobTitle: job.title,
      department: job.department || "General",
      status: job.status || "open",
      applications: jobApps,
      shortlisted: jobShortlisted,
      interviews: jobInterviews,
      offers: jobOffers,
      hired: jobHires,
      onboarding: jobOnboardings,
    };
  });

  const hiredInPeriod = candidatesInPeriod.filter(
    (c) => c.application_status === "hired" || c.stage === "hired",
  ).length;

  const periodActivity: PeriodActivityMetrics = {
    applicationsReceived: candidatesInPeriod.length,
    atsScoredCount: totalScored,
    averageAtsScore: averageScore,
    interviewsConducted: completedInterviews,
    interviewsCancelled: cancelledInterviews,
    interviewsRescheduled: rescheduledInterviews,
    offersCreated: offersInPeriod.length,
    offersAccepted: acceptedOffers,
    offersDeclined: declinedOffers,
    onboardingInitiated: onboardingInPeriod.length,
    onboardingCompleted: obCompleted,
    hiredInPeriod,
  };

  const recruitmentOverview: RecruitmentOverviewMetrics = {
    totalJobs: allJobs.length,
    openJobs,
    closedJobs,
    draftJobs,
    totalApplicationsLifetime,
    applicationsInPeriod: candidatesInPeriod.length,
    hiredInPeriod,
    hiredLifetime: totalHiredLifetime,
    activeInterviewsCurrent,
    activeOnboardingCurrent,
  };

  return {
    appliedFilter: {
      preset,
      from: fromDate ? fromDate.toISOString() : null,
      to: toDate ? toDate.toISOString() : null,
      jobId: selectedJobId,
      jobTitle: selectedJob?.title ?? null,
    },
    currentSnapshot,
    periodActivity,
    recruitmentOverview,
    atsOverview: {
      totalScored,
      averageScore,
      categories: {
        strong: strongCount,
        good: goodCount,
        partial: partialCount,
        low: lowCount,
        unscored: totalInScope - totalScored,
      },
      threshold: {
        meetingOrAbove,
        below: belowThreshold,
      },
      scoreDistribution,
    },
    candidatePipeline,
    interviewAnalytics: {
      totalInPeriod: appointmentsInPeriod.length,
      scheduledOrConfirmed,
      completed: completedInterviews,
      cancelled: cancelledInterviews,
      rescheduled: rescheduledInterviews,
      upcoming: upcomingInterviews,
      byType,
    },
    offerAnalytics: {
      totalInPeriod: offersInPeriod.length,
      draft: draftOffers,
      sent: sentOffers,
      accepted: acceptedOffers,
      declined: declinedOffers,
      expired: expiredOffers,
      revoked: revokedOffers,
      active: activeOffers,
      acceptanceRate,
      acceptanceDenominatorNotes:
        "Acceptance rate = (Accepted Offers / (Accepted Offers + Declined Offers)) * 100. Unresolved offers (draft, sent, expired, revoked) are excluded from denominator.",
    },
    onboardingAnalytics: {
      totalInPeriod: onboardingInPeriod.length,
      notStarted: obNotStarted,
      inProgress: obInProgress,
      completed: obCompleted,
      cancelled: obCancelled,
      documents: {
        total: docsInPeriod.length,
        notSubmitted: docNotSubmitted,
        pendingReview: docPendingReview,
        verified: docVerified,
        rejected: docRejected,
        requiredTotal: reqTotal,
        requiredPending: reqPending,
        requiredVerified: reqVerified,
        requiredRejected: reqRejected,
      },
    },
    funnel,
    jobPerformance,
  };
}
