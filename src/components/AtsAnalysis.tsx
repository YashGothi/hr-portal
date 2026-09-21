import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Briefcase,
  GraduationCap,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  Calendar,
  Layers,
  FileCheck,
  Building,
  Mail,
  Phone,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getAtsHistory } from "@/lib/applications.functions";
import { useCandidateAppointments } from "@/lib/scheduling/queries";
import { ATS_WEIGHT_LABELS, atsCategory } from "@/lib/ats/weights";
import { STAGE_LABELS } from "@/lib/hr";
import type { Candidate, Job } from "@/lib/queries";
import type { SkillEvidence } from "@/lib/ats/skills";

type AtsBreakdownRecord = {
  key: string;
  label: string;
  weight: number;
  score: number;
  reason: string;
};

type EvaluationResultJson = {
  atsScore?: number;
  atsCategory?: string;
  summary?: string;
  requiredSkills?: {
    score?: number;
    weight?: number;
    matched?: string[];
    missing?: string[];
    evidence?: Record<string, SkillEvidence>;
  };
  preferredSkills?: {
    score?: number;
    weight?: number;
    matched?: string[];
    missing?: string[];
    evidence?: Record<string, SkillEvidence>;
  };
  experience?: {
    totalYears?: number | null;
    relevantYears?: number | null;
    requiredYears?: number | null;
    match?: string;
    explanation?: string;
    score?: number;
    weight?: number;
  };
  education?: {
    match?: string;
    explanation?: string;
    score?: number;
    weight?: number;
  };
  technicalSkills?: {
    analysis?: string;
    score?: number;
    weight?: number;
    percent?: number;
  };
  keywordMatch?: {
    matched?: string[];
    score?: number;
    weight?: number;
    percent?: number;
    explanation?: string;
  };
  evidence?: {
    requiredSkills?: Record<string, SkillEvidence>;
    preferredSkills?: Record<string, SkillEvidence>;
  };
};

export interface AtsAnalysisProps {
  person: Candidate;
  job?: Job | undefined;
  onRerunAts?: (() => void) | undefined;
  isRerunning?: boolean | undefined;
  onViewResume?: (() => void | Promise<void>) | undefined;
}

export function AtsAnalysis({
  person,
  job,
  onRerunAts,
  isRerunning,
  onViewResume,
}: AtsAnalysisProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const fetchHistory = useServerFn(getAtsHistory);
  const history = useQuery({
    queryKey: ["ats-history", person.id],
    queryFn: () => fetchHistory({ data: { candidateId: person.id } }),
  });

  const appointments = useCandidateAppointments(person.id);

  // Latest evaluation result with authentic evidence if saved
  const latestEvaluation = (history.data ?? []).find(
    (entry) => entry.status === "completed" && entry.result,
  );
  const evalResult = latestEvaluation?.result as EvaluationResultJson | undefined;

  // Breakdown items from candidate or fallback
  const breakdownItems: AtsBreakdownRecord[] = (person.ats_breakdown as AtsBreakdownRecord[]) ?? [];
  const breakdownMap = new Map<string, AtsBreakdownRecord>();
  for (const item of breakdownItems) {
    breakdownMap.set(item.key, item);
  }

  // Derive shortlist status strictly from backend state
  const isBackendFiltered =
    person.application_status === "filtered_out" ||
    (person.ats_score != null && person.ats_score < 85);

  const isBackendShortlisted =
    !isBackendFiltered &&
    (person.application_status === "shortlisted" ||
      person.application_status === "interview_invited" ||
      person.stage === "shortlisted" ||
      person.auto_shortlisted ||
      (person.ats_score != null && person.ats_score >= 85));

  const bookedAppointment = (appointments.data ?? []).find((app) => app.status === "BOOKED");

  const category = person.ats_category ?? atsCategory(person.ats_score);

  // Handle failure state
  if (person.ats_status === "failed") {
    return (
      <section className="panel space-y-4 p-6 border-warning/40 bg-warning/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-warning font-semibold">
            <AlertTriangle className="size-5 shrink-0" />
            <h2 className="text-lg">ATS Screening Failed</h2>
          </div>
          {onRerunAts && (
            <Button size="sm" onClick={onRerunAts} disabled={isRerunning}>
              <Sparkles className="size-4 mr-1.5" />
              {isRerunning ? "Retrying…" : "Retry ATS Screening"}
            </Button>
          )}
        </div>
        <p className="text-sm text-foreground">
          {person.ats_error ?? "Unable to extract readable text from resume."}
        </p>
        <p className="text-xs text-muted-foreground">
          No numerical score has been assigned. Please verify the resume format (PDF or DOCX with
          selectable text), save, and re-run the screening pipeline.
        </p>
      </section>
    );
  }

  // Handle unscreened state
  if (person.ats_score == null) {
    return (
      <section className="panel space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">ATS Candidate Screening</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Candidate has not been evaluated against {job?.title ?? "the linked opening"} yet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onViewResume && (
              <Button size="sm" variant="outline" onClick={onViewResume}>
                <FileText className="size-4 mr-1.5" /> View Resume
              </Button>
            )}
            {onRerunAts && (
              <Button size="sm" onClick={onRerunAts} disabled={isRerunning}>
                <Sparkles className="size-4 mr-1.5" />
                {isRerunning ? "Evaluating…" : "Run ATS Screening"}
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Evidence lookup map for matched skills
  const evidenceStore = {
    ...(evalResult?.evidence?.requiredSkills ?? {}),
    ...(evalResult?.requiredSkills?.evidence ?? {}),
    ...(evalResult?.evidence?.preferredSkills ?? {}),
    ...(evalResult?.preferredSkills?.evidence ?? {}),
  };

  const matchedRequired =
    person.matched_required_skills ?? evalResult?.requiredSkills?.matched ?? [];
  const missingRequired =
    person.missing_required_skills ?? evalResult?.requiredSkills?.missing ?? [];
  const matchedPreferred =
    person.matched_preferred_skills ?? evalResult?.preferredSkills?.matched ?? [];
  const missingPreferred =
    person.missing_preferred_skills ?? evalResult?.preferredSkills?.missing ?? [];

  // Component 1: Required Skills (35%)
  const reqPointsEarned =
    evalResult?.requiredSkills?.score ??
    (breakdownMap.has("requiredSkills")
      ? Math.round(((breakdownMap.get("requiredSkills")!.score * 35) / 100) * 10) / 10
      : 0);
  const reqPercent =
    breakdownMap.get("requiredSkills")?.score ?? Math.round((reqPointsEarned / 35) * 100);
  const reqExplanation =
    breakdownMap.get("requiredSkills")?.reason ??
    (missingRequired.length
      ? `Missing ${missingRequired.length} of ${matchedRequired.length + missingRequired.length} required skills.`
      : "All required skills identified in candidate resume.");

  // Component 2: Relevant Experience (25%)
  const expPointsEarned =
    evalResult?.experience?.score ??
    (breakdownMap.has("relevantExperience")
      ? Math.round(((breakdownMap.get("relevantExperience")!.score * 25) / 100) * 10) / 10
      : 0);
  const expPercent =
    breakdownMap.get("relevantExperience")?.score ?? Math.round((expPointsEarned / 25) * 100);
  const expExplanation =
    evalResult?.experience?.explanation ??
    breakdownMap.get("relevantExperience")?.reason ??
    "Evaluated relevant industry and technical experience.";
  const relevantYears =
    person.relevant_experience_years ?? evalResult?.experience?.relevantYears ?? null;
  const minRequiredYears =
    job?.min_experience_years ?? evalResult?.experience?.requiredYears ?? null;
  const isExpRequirementMet =
    minRequiredYears == null || (relevantYears != null && relevantYears >= minRequiredYears);
  const datesUncertain = Boolean(
    (person.resume_parsed as Record<string, unknown> | null)?.["dates_uncertain"],
  );

  // Component 3: Technical/Professional Skills (15%)
  const techPointsEarned =
    evalResult?.technicalSkills?.score ??
    (breakdownMap.has("technicalSkills")
      ? Math.round(((breakdownMap.get("technicalSkills")!.score * 15) / 100) * 10) / 10
      : 0);
  const techPercent =
    evalResult?.technicalSkills?.percent ??
    breakdownMap.get("technicalSkills")?.score ??
    Math.round((techPointsEarned / 15) * 100);
  const techAnalysis =
    evalResult?.technicalSkills?.analysis ??
    breakdownMap.get("technicalSkills")?.reason ??
    "Evaluation of professional capabilities and depth in core technologies.";

  // Component 4: Education (10%)
  const eduPointsEarned =
    evalResult?.education?.score ??
    (breakdownMap.has("education")
      ? Math.round(((breakdownMap.get("education")!.score * 10) / 100) * 10) / 10
      : 0);
  const eduPercent =
    breakdownMap.get("education")?.score ?? Math.round((eduPointsEarned / 10) * 100);
  const eduExplanation =
    evalResult?.education?.explanation ??
    breakdownMap.get("education")?.reason ??
    "Evaluated academic qualifications against opening requirements.";
  const eduParsed = person.resume_parsed?.education ?? [];
  const detectedDegree = eduParsed.length > 0 ? eduParsed[0]?.qualification : null;
  const detectedInstitution = eduParsed.length > 0 ? eduParsed[0]?.institution : null;
  const jobEduRequirement =
    job?.education_requirement ?? "No specific degree requirement specified";
  const eduMatchStatus = person.education_match ?? evalResult?.education?.match ?? null;

  // Component 5: Job Description Match (10%)
  const jdPointsEarned =
    evalResult?.keywordMatch?.score ??
    (breakdownMap.has("keywordMatch")
      ? Math.round(((breakdownMap.get("keywordMatch")!.score * 10) / 100) * 10) / 10
      : 0);
  const jdPercent =
    person.keyword_score ??
    evalResult?.keywordMatch?.percent ??
    breakdownMap.get("keywordMatch")?.score ??
    Math.round((jdPointsEarned / 10) * 100);
  const jdMatchedConcepts = evalResult?.keywordMatch?.matched ?? [];
  const jdExplanation =
    evalResult?.keywordMatch?.explanation ??
    breakdownMap.get("keywordMatch")?.reason ??
    "Contextual alignment with role responsibilities and description.";

  // Component 6: Preferred Skills (5%)
  const prefPointsEarned =
    evalResult?.preferredSkills?.score ??
    (breakdownMap.has("preferredSkills")
      ? Math.round(((breakdownMap.get("preferredSkills")!.score * 5) / 100) * 10) / 10
      : 0);
  const prefPercent =
    breakdownMap.get("preferredSkills")?.score ?? Math.round((prefPointsEarned / 5) * 100);
  const prefExplanation =
    breakdownMap.get("preferredSkills")?.reason ??
    (matchedPreferred.length
      ? `Matched ${matchedPreferred.length} preferred skill${matchedPreferred.length > 1 ? "s" : ""}.`
      : "No preferred skills identified.");

  // Helper to find exact evidence for a skill without inventing
  function getSkillEvidence(skill: string): SkillEvidence | null {
    if (evidenceStore[skill]) return evidenceStore[skill];
    const lower = skill.toLowerCase().trim();
    for (const [k, v] of Object.entries(evidenceStore)) {
      if (k.toLowerCase().trim() === lower) return v;
    }
    return null;
  }

  return (
    <section className="panel space-y-6 p-6">
      {/* 1. Header: Candidate Metadata & Quick Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Candidate ATS Profile
            </span>
            <Badge variant="outline" className="text-xs font-medium">
              {job?.title ?? person.applied_role ?? "Unlinked Role"}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Stage: {STAGE_LABELS[person.stage] ?? person.stage}
            </Badge>
            <Badge
              variant="outline"
              className={
                person.application_status === "shortlisted" ||
                person.application_status === "interview_invited"
                  ? "border-success/40 bg-success/15 text-success"
                  : person.application_status === "filtered_out"
                    ? "border-destructive/40 bg-destructive/15 text-destructive"
                    : "text-muted-foreground"
              }
            >
              Status: {person.application_status.replace(/_/g, " ")}
            </Badge>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-foreground">{person.full_name}</h2>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="size-3.5" />
              {person.email}
            </span>
            {person.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3.5" />
                {person.phone}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              Applied: {person.created_at ? new Date(person.created_at).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {person.resume_path && onViewResume && (
            <Button size="sm" variant="outline" onClick={onViewResume}>
              <FileText className="size-4 mr-1.5" /> View Resume
            </Button>
          )}
          {onRerunAts && (
            <Button size="sm" onClick={onRerunAts} disabled={isRerunning}>
              <Sparkles className="size-4 mr-1.5" />
              {isRerunning ? "Screening…" : "Re-run ATS"}
            </Button>
          )}
        </div>
      </div>

      {/* 2. ATS Score & Final Decision Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* ATS Score card */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Overall ATS Score
          </p>
          <div className="flex items-baseline justify-between">
            <p className="text-4xl font-extrabold tracking-tight">
              {person.ats_score}
              <span className="text-sm font-normal text-muted-foreground"> / 100</span>
            </p>
            {category && (
              <Badge
                className={
                  person.ats_score >= 85
                    ? "border-success/40 bg-success/15 text-success"
                    : person.ats_score >= 70
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-muted bg-muted/40 text-muted-foreground"
                }
              >
                {category}
              </Badge>
            )}
          </div>
          <Progress value={person.ats_score} className="h-2 mt-2" />
          <p className="text-xs text-muted-foreground pt-1">
            Deterministic weighted evaluation across 6 job-specific dimensions.
          </p>
        </div>

        {/* Shortlist Decision (Backend Authority) */}
        <div
          className={`rounded-lg border p-4 space-y-2 ${
            isBackendShortlisted
              ? "border-success/40 bg-success/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shortlist Decision (≥85)
          </p>
          <div className="flex items-center gap-2">
            {isBackendShortlisted ? (
              <>
                <CheckCircle2 className="size-6 text-success shrink-0" />
                <div>
                  <p className="text-lg font-bold text-success">Shortlisted</p>
                  <p className="text-xs text-muted-foreground">Threshold requirement satisfied</p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="size-6 text-destructive shrink-0" />
                <div>
                  <p className="text-lg font-bold text-destructive">Filtered Out</p>
                  <p className="text-xs text-muted-foreground">Below 85 shortlisting threshold</p>
                </div>
              </>
            )}
          </div>
          <div className="pt-1 text-xs">
            {isBackendShortlisted ? (
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <ShieldCheck className="size-3.5" />
                Backend verified: Interview token eligible
              </span>
            ) : (
              <span className="text-muted-foreground">
                Retained in database for audit. No scheduling action permitted.
              </span>
            )}
          </div>
        </div>

        {/* Evaluation Metadata & Scheduling Status */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Evaluation & Scheduling
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">Scoring Version:</strong>{" "}
              {(person.scoring_version ?? evalResult?.summary)
                ? "v2.0-deterministic"
                : "v2.0-deterministic"}
            </p>
            <p>
              <strong className="text-foreground">Evaluated At:</strong>{" "}
              {person.ats_scored_at
                ? new Date(person.ats_scored_at).toLocaleString()
                : "Not recorded"}
            </p>
            <p>
              <strong className="text-foreground">Interview Status:</strong>{" "}
              {bookedAppointment ? (
                <span className="text-success font-medium">Interview Booked</span>
              ) : person.application_status === "interview_invited" ? (
                <span className="text-primary font-medium">Invitation Ready / Sent</span>
              ) : isBackendShortlisted ? (
                <span className="text-muted-foreground">Eligible for Interview</span>
              ) : (
                <span className="text-muted-foreground">None (Filtered)</span>
              )}
            </p>
            {bookedAppointment && (
              <p>
                <strong className="text-foreground">Appointment:</strong>{" "}
                {new Date(bookedAppointment.start_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 3. ATS Summary Narrative */}
      {person.ats_summary && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            ATS Evaluation Summary
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">{person.ats_summary}</p>
        </div>
      )}

      {/* 4. The Six Weighted ATS Scoring Components */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            Six-Component ATS Breakdown
          </h3>
          <span className="text-xs text-muted-foreground font-mono">Weighted Total: 100%</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Component 1: Required Skills (35%) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  1. Required Skills
                </span>
                <span className="ml-2 text-xs font-medium text-primary">35% Weight</span>
              </div>
              <p className="font-semibold text-sm">
                {reqPointsEarned} <span className="text-xs text-muted-foreground">/ 35 pts</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  ({reqPercent}%)
                </span>
              </p>
            </div>
            <Progress value={reqPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground">{reqExplanation}</p>

            {/* Matched Required Skills */}
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-foreground">
                Matched Required Skills ({matchedRequired.length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matchedRequired.length > 0 ? (
                  matchedRequired.map((skill) => {
                    const ev = getSkillEvidence(skill);
                    const isExp = ev?.confidence === "experience_supported";
                    return (
                      <Badge
                        key={`req-m-${skill}`}
                        variant="outline"
                        className="border-success/40 bg-success/15 text-success text-xs font-normal"
                      >
                        ✓ {skill}
                        {isExp && (
                          <span className="ml-1 text-[10px] opacity-75 font-mono">[exp]</span>
                        )}
                      </Badge>
                    );
                  })
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    No required skills matched
                  </span>
                )}
              </div>
            </div>

            {/* Missing Required Skills */}
            {missingRequired.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border/60">
                <p className="text-xs font-medium text-destructive">
                  Missing Required Skills ({missingRequired.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {missingRequired.map((skill) => (
                    <Badge
                      key={`req-x-${skill}`}
                      variant="outline"
                      className="border-destructive/30 bg-destructive/10 text-destructive text-xs font-normal"
                    >
                      ✗ {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Component 2: Relevant Experience (25%) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Relevant Experience
                </span>
                <span className="ml-2 text-xs font-medium text-primary">25% Weight</span>
              </div>
              <p className="font-semibold text-sm">
                {expPointsEarned} <span className="text-xs text-muted-foreground">/ 25 pts</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  ({expPercent}%)
                </span>
              </p>
            </div>
            <Progress value={expPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground">{expExplanation}</p>

            <div className="rounded-md bg-muted/40 p-2.5 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Calculated Relevant Experience:</span>
                <span className="font-semibold text-foreground">
                  {relevantYears != null ? `${relevantYears} years` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Minimum Required Experience:</span>
                <span className="font-medium text-foreground">
                  {minRequiredYears != null ? `${minRequiredYears} years` : "None specified"}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                <span className="text-muted-foreground">Requirement Status:</span>
                <span
                  className={`font-semibold flex items-center gap-1 ${
                    isExpRequirementMet ? "text-success" : "text-destructive"
                  }`}
                >
                  {isExpRequirementMet ? (
                    <>
                      <CheckCircle2 className="size-3.5" /> Requirement met
                    </>
                  ) : (
                    <>
                      <XCircle className="size-3.5" /> Requirement not met
                    </>
                  )}
                </span>
              </div>
            </div>

            {datesUncertain && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>
                  Employment dates contain uncertainty. ATS did not fabricate missing dates.
                </span>
              </div>
            )}

            {/* Parsed Employment History snippet */}
            {(person.resume_parsed?.experience ?? []).length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium text-foreground">Parsed Employment History:</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {(person.resume_parsed?.experience ?? []).slice(0, 3).map((exp, idx) => (
                    <li key={`exp-${idx}`} className="truncate">
                      • <strong className="text-foreground">{exp.title}</strong>
                      {exp.company ? ` at ${exp.company}` : ""}
                      {exp.duration ? ` (${exp.duration})` : ""}
                    </li>
                  ))}
                  {(person.resume_parsed?.experience ?? []).length > 3 && (
                    <li className="text-[11px] italic">
                      + {(person.resume_parsed?.experience ?? []).length - 3} earlier role(s)
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Component 3: Technical/Professional Skills (15%) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  3. Technical/Professional Skills
                </span>
                <span className="ml-2 text-xs font-medium text-primary">15% Weight</span>
              </div>
              <p className="font-semibold text-sm">
                {techPointsEarned} <span className="text-xs text-muted-foreground">/ 15 pts</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  ({techPercent}%)
                </span>
              </p>
            </div>
            <Progress value={techPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{techAnalysis}</p>

            {(person.resume_parsed?.skills ?? []).length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium text-foreground">
                  Detected Technology & Tool Keywords ({person.resume_parsed?.skills.length}):
                </p>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {(person.resume_parsed?.skills ?? []).slice(0, 16).map((skill) => (
                    <Badge
                      key={`p-skill-${skill}`}
                      variant="secondary"
                      className="text-[11px] py-0 font-normal"
                    >
                      {skill}
                    </Badge>
                  ))}
                  {(person.resume_parsed?.skills ?? []).length > 16 && (
                    <span className="text-[11px] text-muted-foreground self-center">
                      +{(person.resume_parsed?.skills ?? []).length - 16} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Component 4: Education (10%) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  4. Education
                </span>
                <span className="ml-2 text-xs font-medium text-primary">10% Weight</span>
              </div>
              <p className="font-semibold text-sm">
                {eduPointsEarned} <span className="text-xs text-muted-foreground">/ 10 pts</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  ({eduPercent}%)
                </span>
              </p>
            </div>
            <Progress value={eduPercent} className="h-1.5" />

            <div className="rounded-md bg-muted/40 p-2.5 space-y-1 text-xs">
              <div>
                <span className="text-muted-foreground">Detected Degree: </span>
                <span className="font-semibold text-foreground">
                  {detectedDegree ?? "No formal degree identified in resume"}
                </span>
                {detectedInstitution && (
                  <span className="text-muted-foreground"> · {detectedInstitution}</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Job Requirement: </span>
                <span className="font-medium text-foreground">{jobEduRequirement}</span>
              </div>
              <div className="pt-1 border-t border-border/40 flex items-center justify-between">
                <span className="text-muted-foreground">Match Result:</span>
                <span
                  className={`font-semibold flex items-center gap-1 ${
                    eduMatchStatus === "Strong" || eduMatchStatus === "Related"
                      ? "text-success"
                      : "text-muted-foreground"
                  }`}
                >
                  {eduMatchStatus === "Strong" || eduMatchStatus === "Related" ? (
                    <CheckCircle2 className="size-3.5 text-success" />
                  ) : (
                    <Building className="size-3.5" />
                  )}
                  {eduMatchStatus ? `${eduMatchStatus} match` : "Evaluated"}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{eduExplanation}</p>
          </div>

          {/* Component 5: Job Description Match (10%) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  5. Job Description Match
                </span>
                <span className="ml-2 text-xs font-medium text-primary">10% Weight</span>
              </div>
              <p className="font-semibold text-sm">
                {jdPointsEarned} <span className="text-xs text-muted-foreground">/ 10 pts</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">({jdPercent}%)</span>
              </p>
            </div>
            <Progress value={jdPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{jdExplanation}</p>

            {jdMatchedConcepts.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium text-foreground">
                  Major Matched Concepts / Role Alignment:
                </p>
                <div className="flex flex-wrap gap-1">
                  {jdMatchedConcepts.slice(0, 10).map((term) => (
                    <Badge
                      key={`jd-m-${term}`}
                      variant="outline"
                      className="text-[11px] py-0 border-primary/30 text-primary"
                    >
                      {term}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Component 6: Preferred Skills (5%) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  6. Preferred Skills
                </span>
                <span className="ml-2 text-xs font-medium text-primary">5% Weight</span>
              </div>
              <p className="font-semibold text-sm">
                {prefPointsEarned} <span className="text-xs text-muted-foreground">/ 5 pts</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  ({prefPercent}%)
                </span>
              </p>
            </div>
            <Progress value={prefPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground">{prefExplanation}</p>

            {/* Matched Preferred Skills */}
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium text-foreground">
                Matched Preferred Skills ({matchedPreferred.length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matchedPreferred.length > 0 ? (
                  matchedPreferred.map((skill) => (
                    <Badge
                      key={`pref-m-${skill}`}
                      variant="outline"
                      className="border-success/40 bg-success/15 text-success text-xs font-normal"
                    >
                      ✓ {skill}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground italic">None matched</span>
                )}
              </div>
            </div>

            {/* Missing Preferred Skills */}
            {missingPreferred.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Missing Preferred Skills ({missingPreferred.length}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {missingPreferred.map((skill) => (
                    <Badge
                      key={`pref-x-${skill}`}
                      variant="outline"
                      className="border-muted text-muted-foreground text-xs font-normal"
                    >
                      ✗ {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Expandable ATS Evidence Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => setShowEvidence(!showEvidence)}
          className="flex w-full items-center justify-between text-left text-sm font-semibold tracking-tight text-foreground hover:text-primary transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FileCheck className="size-4 text-primary" />
            <span>
              Traceable Resume Evidence ({matchedRequired.length + matchedPreferred.length} skills)
            </span>
          </div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {showEvidence ? (
              <>
                Hide Evidence <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                View Evidence <ChevronDown className="size-4" />
              </>
            )}
          </span>
        </button>

        {showEvidence && (
          <div className="mt-4 space-y-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Verbatim supporting sentences extracted from the candidate&apos;s resume by the ATS
              engine. Evidence is never fabricated or inferred.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {[...matchedRequired, ...matchedPreferred].map((skill) => {
                const ev = getSkillEvidence(skill);
                const hasEvidence = Boolean(ev?.evidence && ev.evidence.trim().length > 0);
                const confidence =
                  ev?.confidence ?? (hasEvidence ? "experience_supported" : "listed_only");

                return (
                  <div
                    key={`ev-card-${skill}`}
                    className="rounded-md border border-border/80 bg-background p-3 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-success" />
                        {skill}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          confidence === "experience_supported"
                            ? "border-primary/40 bg-primary/10 text-primary text-[10px]"
                            : "border-muted bg-muted/30 text-muted-foreground text-[10px]"
                        }
                      >
                        {confidence === "experience_supported"
                          ? "Experience supported"
                          : confidence === "listed_only"
                            ? "Listed only"
                            : "Uncertain / Unstated"}
                      </Badge>
                    </div>

                    <div className="text-muted-foreground">
                      <strong className="text-foreground">Evidence: </strong>
                      {hasEvidence ? (
                        <blockquote className="mt-1 border-l-2 border-primary/40 pl-2 text-foreground/90 italic">
                          &ldquo;{ev?.evidence}&rdquo;
                        </blockquote>
                      ) : (
                        <span className="italic text-muted-foreground">
                          No supporting resume evidence available.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 6. Evaluation History Section */}
      {(history.data ?? []).length > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Evaluation History ({(history.data ?? []).length} run
              {(history.data ?? []).length > 1 ? "s" : ""})
            </p>
            {(history.data ?? []).length > 2 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={() => setShowAllHistory(!showAllHistory)}
              >
                {showAllHistory ? "Show less" : "Show all"}
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border/60 text-xs">
            {(showAllHistory ? (history.data ?? []) : (history.data ?? []).slice(0, 2)).map(
              (entry, index) => (
                <li key={entry.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-foreground">
                      Evaluation #{(history.data ?? []).length - index}
                    </span>
                    <span className="ml-2 text-muted-foreground font-mono">
                      [{entry.scoring_version ?? "v2.0-deterministic"}]
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      · {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        entry.status === "failed"
                          ? "border-destructive text-destructive"
                          : (entry.ats_score ?? 0) >= 85
                            ? "border-success/40 bg-success/15 text-success"
                            : "border-muted text-muted-foreground"
                      }
                    >
                      {entry.status === "failed"
                        ? "Failed"
                        : `Score ${entry.ats_score}/100 (${entry.ats_category ?? "Evaluated"})`}
                    </Badge>
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
