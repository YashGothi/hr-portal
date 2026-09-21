import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  GraduationCap,
  Layers,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Building,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STAGE_LABELS } from "@/lib/hr";
import type { ComparisonCandidate, PublicJob } from "@/lib/applications.functions";
import type { SkillEvidence } from "@/lib/ats/skills";

export interface CandidateComparisonProps {
  job: PublicJob;
  candidates: ComparisonCandidate[];
}

export function CandidateComparison({ job, candidates }: CandidateComparisonProps) {
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});

  function toggleEvidence(candidateId: string) {
    setExpandedEvidence((prev) => ({
      ...prev,
      [candidateId]: !prev[candidateId],
    }));
  }

  // Extract evidence map for a candidate
  function getCandidateEvidenceStore(
    candidate: ComparisonCandidate,
  ): Record<string, SkillEvidence> {
    const ev = candidate.latestEvaluation?.result as
      | {
          evidence?: {
            requiredSkills?: Record<string, SkillEvidence>;
            preferredSkills?: Record<string, SkillEvidence>;
          };
          requiredSkills?: { evidence?: Record<string, SkillEvidence> };
          preferredSkills?: { evidence?: Record<string, SkillEvidence> };
        }
      | undefined;

    return {
      ...(ev?.evidence?.requiredSkills ?? {}),
      ...(ev?.requiredSkills?.evidence ?? {}),
      ...(ev?.evidence?.preferredSkills ?? {}),
      ...(ev?.preferredSkills?.evidence ?? {}),
    };
  }

  return (
    <div className="space-y-6">
      {/* Header and Context */}
      <div className="panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link to="/candidates">
                  <ArrowLeft className="size-4 mr-1.5" /> Back to Pipeline
                </Link>
              </Button>
              <Badge variant="outline" className="text-xs">
                Candidate Comparison
              </Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mt-2">
              Candidate Comparison
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Job Opening: <strong className="text-foreground">{job.title}</strong>
              {job.job_code ? ` · ${job.job_code}` : ""}
              {job.department ? ` · ${job.department}` : ""}
              {job.location ? ` · ${job.location}` : ""}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-muted-foreground block font-mono">
              Comparing {candidates.length} candidates
            </span>
          </div>
        </div>

        {/* Factual comparison disclaimer — strictly no rankings */}
        <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground leading-relaxed">
          <Info className="size-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-primary">Candidate Comparison</p>
            <p className="text-muted-foreground mt-0.5">
              Displays ATS results without making a hiring recommendation. This side-by-side view
              displays factual candidate information and stored ATS evaluations without assigning
              new scores, rankings, or automated hiring recommendations.
            </p>
          </div>
        </div>

        {/* Opening Requirements Summary */}
        <div className="grid gap-2 sm:grid-cols-3 rounded-lg bg-muted/30 p-3 text-xs border border-border/60">
          <div>
            <span className="text-muted-foreground block font-medium">
              Required Skills ({job.required_skills.length}):
            </span>
            <span className="text-foreground">
              {job.required_skills.join(", ") || "None specified"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Experience Requirement:</span>
            <span className="text-foreground">
              {job.min_experience_years != null
                ? `Min ${job.min_experience_years} years`
                : "None specified"}
              {job.max_experience_years != null ? ` (up to ${job.max_experience_years} yrs)` : ""}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Education Requirement:</span>
            <span className="text-foreground">{job.education_requirement ?? "None specified"}</span>
          </div>
        </div>
      </div>

      {/* Side-by-Side Comparison Matrix */}
      <div className="panel overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm min-w-[760px]">
            {/* Table Header: Candidate Profile Cards */}
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="p-4 w-52 shrink-0 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Attribute / Candidate
                </th>
                {candidates.map((c) => {
                  const isFiltered =
                    c.application_status === "filtered_out" ||
                    (c.ats_score != null && c.ats_score < 85);
                  const isShortlisted =
                    !isFiltered &&
                    (c.application_status === "shortlisted" ||
                      c.application_status === "interview_invited" ||
                      c.stage === "shortlisted" ||
                      c.auto_shortlisted ||
                      (c.ats_score != null && c.ats_score >= 85));

                  return (
                    <th key={`hdr-${c.id}`} className="p-4 min-w-[240px] align-top">
                      <div className="space-y-1.5">
                        <Link
                          to="/candidates/$candidateId"
                          params={{ candidateId: c.id }}
                          className="text-base font-bold text-foreground hover:text-primary transition-colors block truncate"
                          title={c.full_name}
                        >
                          {c.full_name}
                        </Link>
                        <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        <div className="flex flex-wrap gap-1 pt-1">
                          <Badge variant="secondary" className="text-[11px]">
                            {STAGE_LABELS[c.stage as keyof typeof STAGE_LABELS] ?? c.stage}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              isShortlisted
                                ? "border-success/40 bg-success/15 text-success text-[11px]"
                                : isFiltered
                                  ? "border-destructive/40 bg-destructive/15 text-destructive text-[11px]"
                                  : "text-muted-foreground text-[11px]"
                            }
                          >
                            {isShortlisted
                              ? "Shortlisted"
                              : isFiltered
                                ? "Filtered Out"
                                : c.application_status}
                          </Badge>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {/* Row 1: Overall ATS Score */}
              <tr className="hover:bg-muted/10">
                <td className="p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                  ATS Score &amp; Decision
                </td>
                {candidates.map((c) => {
                  const isFiltered =
                    c.application_status === "filtered_out" ||
                    (c.ats_score != null && c.ats_score < 85);
                  const isShortlisted =
                    !isFiltered &&
                    (c.application_status === "shortlisted" ||
                      c.application_status === "interview_invited" ||
                      c.stage === "shortlisted" ||
                      c.auto_shortlisted ||
                      (c.ats_score != null && c.ats_score >= 85));

                  return (
                    <td key={`score-${c.id}`} className="p-4 align-top">
                      <div className="space-y-1">
                        <p className="text-2xl font-extrabold text-foreground">
                          {c.ats_score ?? "—"}
                          <span className="text-xs font-normal text-muted-foreground"> / 100</span>
                        </p>
                        <Badge
                          variant="outline"
                          className={
                            (c.ats_score ?? 0) >= 85
                              ? "border-success/40 bg-success/15 text-success text-xs"
                              : "border-muted text-muted-foreground text-xs"
                          }
                        >
                          {c.ats_category ?? "Evaluated"}
                        </Badge>
                        <div className="pt-1 text-xs">
                          {isShortlisted ? (
                            <span className="flex items-center gap-1 text-success font-medium">
                              <CheckCircle2 className="size-3.5" /> Shortlisted (≥85)
                            </span>
                          ) : isFiltered ? (
                            <span className="flex items-center gap-1 text-destructive font-medium">
                              <XCircle className="size-3.5" /> Filtered Out (&lt;85)
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Row 2: Required Skills (35%) */}
              <tr className="hover:bg-muted/10">
                <td className="p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <div className="space-y-0.5">
                    <span>1. Required Skills</span>
                    <span className="block text-[10px] text-primary font-medium">35% Weight</span>
                  </div>
                </td>
                {candidates.map((c) => {
                  const breakdown = c.ats_breakdown?.find((b) => b.key === "requiredSkills");
                  const points =
                    breakdown != null ? Math.round(((breakdown.score * 35) / 100) * 10) / 10 : 0;

                  return (
                    <td key={`req-${c.id}`} className="p-4 align-top space-y-2">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-semibold text-foreground">
                          {points} <span className="text-muted-foreground">/ 35 pts</span>
                        </span>
                        <span className="text-muted-foreground font-mono">
                          ({breakdown?.score ?? 0}%)
                        </span>
                      </div>

                      {/* Matched Required */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-foreground block">
                          Matched ({c.matched_required_skills.length}):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {c.matched_required_skills.length > 0 ? (
                            c.matched_required_skills.map((skill) => (
                              <Badge
                                key={`c-m-${c.id}-${skill}`}
                                variant="outline"
                                className="border-success/40 bg-success/15 text-success text-[10px] font-normal"
                              >
                                ✓ {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">None</span>
                          )}
                        </div>
                      </div>

                      {/* Missing Required */}
                      {c.missing_required_skills.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-border/50">
                          <span className="text-[11px] font-medium text-destructive block">
                            Missing ({c.missing_required_skills.length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {c.missing_required_skills.map((skill) => (
                              <Badge
                                key={`c-x-${c.id}-${skill}`}
                                variant="outline"
                                className="border-destructive/30 bg-destructive/10 text-destructive text-[10px] font-normal"
                              >
                                ✗ {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Row 3: Resume Evidence (Expandable) */}
              <tr className="hover:bg-muted/10">
                <td className="p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <div className="space-y-0.5">
                    <span>Skill Evidence</span>
                    <span className="block text-[10px] text-muted-foreground font-normal">
                      Verbatim resume extracts
                    </span>
                  </div>
                </td>
                {candidates.map((c) => {
                  const evStore = getCandidateEvidenceStore(c);
                  const isExpanded = Boolean(expandedEvidence[c.id]);

                  return (
                    <td key={`ev-${c.id}`} className="p-4 align-top">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleEvidence(c.id)}
                        className="w-full justify-between text-xs h-7"
                      >
                        <span className="flex items-center gap-1 truncate">
                          <FileCheck className="size-3.5 text-primary shrink-0" />
                          Evidence ({c.matched_required_skills.length})
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="size-3.5 shrink-0 ml-1" />
                        ) : (
                          <ChevronDown className="size-3.5 shrink-0 ml-1" />
                        )}
                      </Button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2 text-xs">
                          {c.matched_required_skills.map((skill) => {
                            const evidenceEntry = evStore[skill];
                            const hasEvidence = Boolean(
                              evidenceEntry?.evidence && evidenceEntry.evidence.trim().length > 0,
                            );
                            const confidence = evidenceEntry?.confidence;

                            return (
                              <div
                                key={`ev-item-${c.id}-${skill}`}
                                className="rounded border border-border/70 bg-background p-2 space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-foreground">{skill}</span>
                                  {confidence === "experience_supported" ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] border-primary/40 text-primary"
                                    >
                                      Experience supported
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] text-muted-foreground"
                                    >
                                      Listed only
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {hasEvidence ? (
                                    <span className="italic text-foreground/90">
                                      &ldquo;{evidenceEntry?.evidence}&rdquo;
                                    </span>
                                  ) : (
                                    <span className="italic text-muted-foreground">
                                      No supporting resume evidence available.
                                    </span>
                                  )}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Row 4: Relevant Experience (25%) */}
              <tr className="hover:bg-muted/10">
                <td className="p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <div className="space-y-0.5">
                    <span>2. Relevant Experience</span>
                    <span className="block text-[10px] text-primary font-medium">25% Weight</span>
                  </div>
                </td>
                {candidates.map((c) => {
                  const breakdown = c.ats_breakdown?.find((b) => b.key === "relevantExperience");
                  const points =
                    breakdown != null ? Math.round(((breakdown.score * 25) / 100) * 10) / 10 : 0;
                  const reqYears = job.min_experience_years;
                  const relYears = c.relevant_experience_years;
                  const isMet = reqYears == null || (relYears != null && relYears >= reqYears);
                  const datesUncertain = Boolean(
                    (c.resume_parsed as Record<string, unknown> | null)?.["dates_uncertain"],
                  );

                  return (
                    <td key={`exp-${c.id}`} className="p-4 align-top space-y-1.5 text-xs">
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-foreground">
                          {points} <span className="text-muted-foreground">/ 25 pts</span>
                        </span>
                        <span className="text-muted-foreground font-mono">
                          ({breakdown?.score ?? 0}%)
                        </span>
                      </div>

                      <div className="rounded bg-muted/40 p-2 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Relevant Experience:</span>
                          <span className="font-semibold text-foreground">
                            {relYears != null ? `${relYears} yrs` : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Required Minimum:</span>
                          <span className="text-foreground">
                            {reqYears != null ? `${reqYears} yrs` : "None"}
                          </span>
                        </div>
                        <div className="pt-1 border-t border-border/40 flex items-center justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <span
                            className={`font-semibold ${isMet ? "text-success" : "text-destructive"}`}
                          >
                            {isMet ? "✓ Requirement met" : "✗ Requirement not met"}
                          </span>
                        </div>
                      </div>

                      {datesUncertain && (
                        <div className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 p-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="size-3 shrink-0" />
                          <span>
                            Employment dates contain uncertainty. ATS did not fabricate missing
                            dates.
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Row 5: Technical/Professional Skills (15%) */}
              <tr className="hover:bg-muted/10">
                <td className="p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <div className="space-y-0.5">
                    <span>3. Technical Skills</span>
                    <span className="block text-[10px] text-primary font-medium">15% Weight</span>
                  </div>
                </td>
                {candidates.map((c) => {
                  const breakdown = c.ats_breakdown?.find((b) => b.key === "technicalSkills");
                  const points =
                    breakdown != null ? Math.round(((breakdown.score * 15) / 100) * 10) / 10 : 0;

                  return (
                    <td key={`tech-${c.id}`} className="p-4 align-top space-y-1 text-xs">
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-foreground">
                          {points} <span className="text-muted-foreground">/ 15 pts</span>
                        </span>
                        <span className="text-muted-foreground font-mono">
                          ({breakdown?.score ?? 0}%)
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {breakdown?.reason ?? "Technical stack competencies evaluated."}
                      </p>
                    </td>
                  );
                })}
              </tr>

              {/* Row 6: Education (10%) */}
              <tr className="hover:bg-muted/10">
                <td className="p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <div className="space-y-0.5">
                    <span>4. Education</span>
                    <span className="block text-[10px] text-primary font-medium">10% Weight</span>
                  </div>
                </td>
                {candidates.map((c) => {
                  const breakdown = c.ats_breakdown?.find((b) => b.key === "education");
                  const points =
                    breakdown != null ? Math.round(((breakdown.score * 10) / 100) * 10) / 10 : 0;
                  const eduList = c.resume_parsed?.education ?? [];
                  const degree = eduList[0]?.qualification ?? null;
                  const inst = eduList[0]?.institution ?? null;

                  return (
                    <td key={`edu-${c.id}`} className="p-4 align-top space-y-1.5 text-xs">
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-foreground">
                          {points} <span className="text-muted-foreground">/ 10 pts</span>
                        </span>
                        <span className="text-muted-foreground font-mono">
                          ({breakdown?.score ?? 0}%)
                        </span>
                      </div>
                      <div className="rounded bg-muted/40 p-2 space-y-1 text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Degree: </span>
                          <span className="font-medium text-foreground">
                            {degree ?? "No formal degree stated"}
                          </span>
                          {inst && <span className="text-muted-foreground"> · {inst}</span>}
                        </div>
                        <div className="flex justify-between pt-1 border-t border-border/40">
                          <span className="text-muted-foreground">Match:</span>
                          <span className="font-semibold text-foreground">
                            {c.education_match ? `${c.education_match} match` : "Evaluated"}
                          </span>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Row 7: Job Description Match (10%) */}
              <tr className="hover:bg-muted/10">
                <td className="p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <div className="space-y-0.5">
                    <span>5. JD Match</span>
                    <span className="block text-[10px] text-primary font-medium">10% Weight</span>
                  </div>
                </td>
                {candidates.map((c) => {
                  const breakdown = c.ats_breakdown?.find((b) => b.key === "keywordMatch");
                  const points =
                    breakdown != null ? Math.round(((breakdown.score * 10) / 100) * 10) / 10 : 0;

                  return (
                    <td key={`jd-${c.id}`} className="p-4 align-top space-y-1 text-xs">
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-foreground">
                          {points} <span className="text-muted-foreground">/ 10 pts</span>
                        </span>
                        <span className="text-muted-foreground font-mono">
                          ({breakdown?.score ?? 0}%)
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {breakdown?.reason ?? "Overlap with opening responsibilities."}
                      </p>
                    </td>
                  );
                })}
              </tr>

              {/* Row 8: Preferred Skills (5%) */}
              <tr className="hover:bg-muted/10">
                <td className="p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <div className="space-y-0.5">
                    <span>6. Preferred Skills</span>
                    <span className="block text-[10px] text-primary font-medium">5% Weight</span>
                  </div>
                </td>
                {candidates.map((c) => {
                  const breakdown = c.ats_breakdown?.find((b) => b.key === "preferredSkills");
                  const points =
                    breakdown != null ? Math.round(((breakdown.score * 5) / 100) * 10) / 10 : 0;

                  return (
                    <td key={`pref-${c.id}`} className="p-4 align-top space-y-1.5 text-xs">
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-foreground">
                          {points} <span className="text-muted-foreground">/ 5 pts</span>
                        </span>
                        <span className="text-muted-foreground font-mono">
                          ({breakdown?.score ?? 0}%)
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {c.matched_preferred_skills.length > 0 ? (
                            c.matched_preferred_skills.map((skill) => (
                              <Badge
                                key={`pref-m-${c.id}-${skill}`}
                                variant="outline"
                                className="border-success/40 bg-success/15 text-success text-[10px] font-normal"
                              >
                                ✓ {skill}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">
                              None matched
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
