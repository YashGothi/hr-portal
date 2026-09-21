import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AtsBreakdownItem, ResumeParsed } from "@/lib/ats.functions";
import {
  calculateAtsScore,
  type AtsAiAnalysis,
  type AtsJobRequirements,
  type AtsResult,
} from "./score";
import { ATS_VERSION, ATS_WEIGHTS, ATS_WEIGHT_LABELS, SCORING_VERSION } from "./weights";
import { assessTextQuality, ResumeTextError } from "./extract.server";
import { parseResume, type StructuredResume } from "./parser.server";
import { matchJobRequirementsDeterministically } from "./matcher.server";
import type { SkillEvidence } from "./skills";

type Db = SupabaseClient<Database>;

export const JOB_REQUIREMENT_COLUMNS =
  "id, title, department, location, employment_type, description, required_skills, preferred_skills, min_experience_years, max_experience_years, education_requirement";

/** Turns the weighted result into the breakdown rows the candidate page renders. */
export function toBreakdownRows(result: AtsResult): AtsBreakdownItem[] {
  const rows: Array<[keyof typeof ATS_WEIGHTS, number, string]> = [
    [
      "requiredSkills",
      result.requiredSkills.score,
      result.requiredSkills.missing.length
        ? `Missing: ${result.requiredSkills.missing.join(", ")}`
        : "All required skills identified in the resume.",
    ],
    ["relevantExperience", result.experience.score, result.experience.explanation],
    ["technicalSkills", result.technicalSkills.score, result.technicalSkills.analysis],
    ["education", result.education.score, result.education.explanation],
    [
      "keywordMatch",
      result.keywordMatch.score,
      result.keywordMatch.matched.length
        ? `Matched: ${result.keywordMatch.matched.slice(0, 8).join(", ")}`
        : "Little overlap with the job description.",
    ],
    [
      "preferredSkills",
      result.preferredSkills.score,
      result.preferredSkills.matched.length
        ? `Matched: ${result.preferredSkills.matched.join(", ")}`
        : "No preferred skills identified.",
    ],
  ];

  return rows.map(([key, score, reason]) => ({
    key,
    label: ATS_WEIGHT_LABELS[key],
    weight: ATS_WEIGHTS[key],
    score: Math.round((score / ATS_WEIGHTS[key]) * 100),
    reason: reason || "No detail available for this area.",
  }));
}

/** Calls AI gateway for optional qualitative enrichment, with graceful fallback. */
async function tryAiEnrichment(
  job: AtsJobRequirements,
  resumeText: string,
  deterministicAnalysis: AtsAiAnalysis,
): Promise<AtsAiAnalysis> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return deterministicAnalysis;
  }

  try {
    const prompt = [
      "You are an ATS resume screening assistant for a hiring team.",
      "Analyse the resume against the job opening below. Use ONLY job-related evidence:",
      "skills, experience, education, responsibilities and technologies.",
      "Never consider or mention gender, race, religion, age, nationality, disability,",
      "marital status, photographs, school prestige, or a name as a proxy for any of those.",
      "Never invent facts: use null when something is not stated in the resume.",
      "You do NOT decide the final score — the application computes it from your analysis.",
      "",
      "JOB OPENING",
      `Title: ${job.title}`,
      `Department: ${job.department ?? "-"}`,
      `Location: ${job.location ?? "-"}`,
      `Employment type: ${job.employment_type}`,
      `Required skills: ${job.required_skills.join(", ") || "-"}`,
      `Preferred skills: ${job.preferred_skills.join(", ") || "-"}`,
      `Minimum experience (years): ${job.min_experience_years ?? "-"}`,
      `Maximum experience (years): ${job.max_experience_years ?? "-"}`,
      `Education requirement: ${job.education_requirement ?? "-"}`,
      `Description: ${(job.description ?? "-").slice(0, 4000)}`,
      "",
      "RESUME",
      resumeText.slice(0, 12000),
      "",
      'Reply with JSON only: {"matchedRequiredSkills": string[], "matchedPreferredSkills": string[], "relevantExperience": {"years": number|null, "explanation": string}, "educationMatch": {"result": "Strong"|"Related"|"Weak"|"Not identified", "explanation": string}, "keywordMatch": string[], "keywordMatchPercent": number, "technicalSkillAnalysis": string, "technicalSkillPercent": number, "summary": string}.',
      "Keep the summary under 60 words and each explanation under 30 words.",
    ].join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn(
        `[ATS AI] Enrichment unavailable (HTTP ${response.status}), proceeding with deterministic analysis.`,
      );
      return deterministicAnalysis;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";

    const json = JSON.parse(raw) as Record<string, unknown>;
    const relevant = (json["relevantExperience"] ?? {}) as Record<string, unknown>;
    const education = (json["educationMatch"] ?? {}) as Record<string, unknown>;

    // Validate and merge: deterministic evidence always has final say on skill matches
    const aiRequired = Array.isArray(json["matchedRequiredSkills"])
      ? (json["matchedRequiredSkills"] as string[]).filter((s) => typeof s === "string")
      : [];
    const aiPreferred = Array.isArray(json["matchedPreferredSkills"])
      ? (json["matchedPreferredSkills"] as string[]).filter((s) => typeof s === "string")
      : [];

    const mergedRequired = Array.from(
      new Set([...deterministicAnalysis.matchedRequiredSkills, ...aiRequired]),
    );
    const mergedPreferred = Array.from(
      new Set([...deterministicAnalysis.matchedPreferredSkills, ...aiPreferred]),
    );

    return {
      matchedRequiredSkills: mergedRequired,
      matchedPreferredSkills: mergedPreferred,
      relevantExperience: {
        years:
          typeof relevant["years"] === "number"
            ? relevant["years"]
            : deterministicAnalysis.relevantExperience.years,
        explanation:
          typeof relevant["explanation"] === "string" && relevant["explanation"].trim()
            ? relevant["explanation"].trim().slice(0, 300)
            : deterministicAnalysis.relevantExperience.explanation,
      },
      totalExperienceYears: deterministicAnalysis.totalExperienceYears,
      educationMatch: {
        result:
          typeof education["result"] === "string"
            ? education["result"]
            : deterministicAnalysis.educationMatch.result,
        explanation:
          typeof education["explanation"] === "string" && education["explanation"].trim()
            ? education["explanation"].trim().slice(0, 300)
            : deterministicAnalysis.educationMatch.explanation,
      },
      keywordMatch: Array.isArray(json["keywordMatch"])
        ? (json["keywordMatch"] as string[]).slice(0, 15)
        : deterministicAnalysis.keywordMatch,
      keywordMatchPercent:
        typeof json["keywordMatchPercent"] === "number"
          ? Math.max(0, Math.min(100, json["keywordMatchPercent"]))
          : deterministicAnalysis.keywordMatchPercent,
      technicalSkillAnalysis:
        typeof json["technicalSkillAnalysis"] === "string" && json["technicalSkillAnalysis"].trim()
          ? json["technicalSkillAnalysis"].trim().slice(0, 400)
          : deterministicAnalysis.technicalSkillAnalysis,
      technicalSkillPercent:
        typeof json["technicalSkillPercent"] === "number"
          ? Math.max(0, Math.min(100, json["technicalSkillPercent"]))
          : deterministicAnalysis.technicalSkillPercent,
      summary:
        typeof json["summary"] === "string" && json["summary"].trim()
          ? json["summary"].trim().slice(0, 600)
          : deterministicAnalysis.summary,
    };
  } catch (err) {
    console.warn(
      "[ATS AI] Exception during AI enrichment, falling back to deterministic evaluation:",
      err,
    );
    return deterministicAnalysis;
  }
}

export type EvaluationOutcome = {
  result: AtsResult;
  parsed: ResumeParsed;
  structured: StructuredResume;
  breakdown: AtsBreakdownItem[];
  evidence: Record<string, SkillEvidence>;
};

/** Runs the full ATS evaluation: text quality assessment, deterministic parsing, matching, and scoring. */
export async function evaluateResume(
  job: AtsJobRequirements,
  resumeText: string,
): Promise<EvaluationOutcome> {
  // 1. Text Quality Assessment
  const quality = assessTextQuality(resumeText);
  if (quality.quality === "parsing_failed") {
    throw new ResumeTextError(quality.reason || "Unable to extract readable text from resume.");
  }

  // 2. Deterministic Resume Parsing
  const structured = parseResume(resumeText);

  // 3. Deterministic Job Requirements Matching
  const { ai: deterministicAi, evidence } = matchJobRequirementsDeterministically(
    job,
    resumeText,
    structured,
  );

  // 4. Optional AI Enrichment (safe, never fails the application)
  const enrichedAi = await tryAiEnrichment(job, resumeText, deterministicAi);

  // 5. Backend-Calculated Deterministic Weighted Scoring
  const result = calculateAtsScore(
    job,
    resumeText,
    structured.skills,
    enrichedAi,
    structured.rawSections.experienceText,
  );

  // Adapter for existing ResumeParsed format expected by the frontend UI
  const legacyParsed: ResumeParsed = {
    skills: structured.skills,
    total_experience_years: structured.total_experience_years,
    experience: structured.experience.map((e) => ({
      title: e.title,
      company: e.company,
      duration: e.duration,
    })),
    education: structured.education.map((e) => ({
      qualification: e.qualification,
      institution: e.institution,
      year: e.year,
    })),
    certifications: structured.certifications,
  };

  return {
    result,
    parsed: legacyParsed,
    structured,
    breakdown: toBreakdownRows(result),
    evidence,
  };
}

/** Writes a completed evaluation onto the candidate and into the history table. */
export async function saveEvaluation(
  db: Db,
  candidateId: string,
  jobId: string | null,
  outcome: EvaluationOutcome,
  userId: string | null,
): Promise<void> {
  const { result, parsed, structured, breakdown, evidence } = outcome;

  const { error } = await db
    .from("candidates")
    .update({
      ats_score: result.atsScore,
      ats_category: result.atsCategory,
      ats_summary: result.summary,
      ats_strengths: result.requiredSkills.matched.slice(0, 6),
      ats_gaps: result.requiredSkills.missing.slice(0, 6),
      ats_breakdown: breakdown as never,
      resume_parsed: {
        ...parsed,
        structured_profile: structured.candidate,
        dates_uncertain: structured.dates_uncertain,
        categorized_skills: structured.categorizedSkills,
      } as never,
      ats_scored_at: new Date().toISOString(),
      ats_status: "completed",
      ats_error: null,
      ats_version: ATS_VERSION,
      scoring_version: SCORING_VERSION,
      application_status: "ats_evaluated",
      matched_required_skills: result.requiredSkills.matched,
      missing_required_skills: result.requiredSkills.missing,
      matched_preferred_skills: result.preferredSkills.matched,
      missing_preferred_skills: result.preferredSkills.missing,
      total_experience_years: result.experience.totalYears,
      relevant_experience_years: result.experience.relevantYears,
      experience_match: result.experience.match,
      education_match: result.education.match,
      keyword_score: result.keywordMatch.score,
    })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);

  await db.from("ats_evaluations").insert({
    candidate_id: candidateId,
    job_id: jobId,
    ats_score: result.atsScore,
    ats_category: result.atsCategory,
    summary: result.summary,
    result: {
      ...result,
      evidence,
    } as never,
    scoring_version: SCORING_VERSION,
    status: "completed",
    created_by: userId,
  });

  // Backend threshold rule: >= 85 shortlists and prepares the interview
  // invitation, below 85 is filtered out but kept on record.
  const { applyShortlistDecision } = await import("./shortlist.server");
  await applyShortlistDecision(db, candidateId, result.atsScore);
}

/** Records a failed evaluation without inventing a score, keeping candidate available for manual review. */
export async function saveEvaluationFailure(
  db: Db,
  candidateId: string,
  jobId: string | null,
  message: string,
): Promise<void> {
  await db
    .from("candidates")
    .update({
      ats_status: "failed",
      ats_error: message.slice(0, 400),
      ats_scored_at: new Date().toISOString(),
      ats_version: ATS_VERSION,
      scoring_version: SCORING_VERSION,
    })
    .eq("id", candidateId);

  await db.from("ats_evaluations").insert({
    candidate_id: candidateId,
    job_id: jobId,
    status: "failed",
    error: message.slice(0, 400),
    scoring_version: SCORING_VERSION,
  });
}
