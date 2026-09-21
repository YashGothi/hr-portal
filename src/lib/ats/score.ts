import { ATS_WEIGHTS, atsCategory, type AtsCategory } from "./weights";
import { matchSkillList, type SkillEvidence } from "./skills";

export type AtsJobRequirements = {
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string;
  description: string | null;
  required_skills: string[];
  preferred_skills: string[];
  min_experience_years: number | null;
  max_experience_years: number | null;
  education_requirement: string | null;
};

export type AtsAiAnalysis = {
  matchedRequiredSkills: string[];
  matchedPreferredSkills: string[];
  relevantExperience: { years: number | null; explanation: string };
  totalExperienceYears: number | null;
  educationMatch: { result: string; explanation: string };
  keywordMatch: string[];
  keywordMatchPercent: number;
  technicalSkillAnalysis: string;
  technicalSkillPercent: number;
  summary: string;
};

export type AtsResult = {
  atsScore: number;
  atsCategory: AtsCategory;
  requiredSkills: {
    matched: string[];
    missing: string[];
    score: number;
    weight: number;
    evidence?: Record<string, SkillEvidence>;
  };
  preferredSkills: {
    matched: string[];
    missing: string[];
    score: number;
    weight: number;
    evidence?: Record<string, SkillEvidence>;
  };
  experience: {
    totalYears: number | null;
    relevantYears: number | null;
    requiredYears: number | null;
    match: string;
    explanation: string;
    score: number;
    weight: number;
  };
  education: { match: string; explanation: string; score: number; weight: number };
  keywordMatch: { matched: string[]; score: number; weight: number };
  technicalSkills: { analysis: string; score: number; weight: number };
  summary: string;
  recommendation: "Review";
};

function pct(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n)) / 100;
}

function round1(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value * 10) / 10);
}

function educationFactor(result: string): number {
  const value = result.toLowerCase();
  if (value.includes("strong") || value.includes("exceed")) return 1;
  if (value.includes("related") || value.includes("partial") || value.includes("equivalent"))
    return 0.75;
  if (value.includes("weak") || value.includes("below")) return 0.35;
  if (value.includes("not identified") || value.includes("none")) return 0.2;
  return 0.2;
}

function experienceLabel(relevant: number | null, required: number | null): string {
  if (relevant == null) return "Not identified";
  if (required == null || required <= 0) return "Strong";
  if (relevant >= required) return "Strong";
  if (relevant >= required * 0.6) return "Partial";
  return "Low";
}

/**
 * Computes the final 0-100 ATS score strictly in our own code from the configured
 * weights. The AI model only supplies qualitative entities — never the score.
 */
export function calculateAtsScore(
  job: AtsJobRequirements,
  resumeText: string,
  resumeSkills: string[],
  ai: AtsAiAnalysis,
  experienceSectionText: string = "",
): AtsResult {
  const required = matchSkillList(
    job.required_skills,
    resumeText,
    resumeSkills,
    ai.matchedRequiredSkills,
    experienceSectionText,
  );
  const preferred = matchSkillList(
    job.preferred_skills,
    resumeText,
    resumeSkills,
    ai.matchedPreferredSkills,
    experienceSectionText,
  );

  const keywordPct = pct(ai.keywordMatchPercent);
  const technicalPct = pct(ai.technicalSkillPercent);

  const requiredRatio = job.required_skills.length
    ? required.matched.length / job.required_skills.length
    : keywordPct;
  const preferredRatio = job.preferred_skills.length
    ? preferred.matched.length / job.preferred_skills.length
    : technicalPct;

  const requiredYears = round1(job.min_experience_years);
  const relevantYears = round1(ai.relevantExperience.years);
  const totalYears = round1(ai.totalExperienceYears);
  const experienceRatio =
    relevantYears == null
      ? 0
      : requiredYears && requiredYears > 0
        ? Math.min(1, relevantYears / requiredYears)
        : Math.min(1, relevantYears / 3);

  const educationExplanation = ai.educationMatch.explanation;
  const eduFactor = educationFactor(ai.educationMatch.result);

  const parts = {
    requiredSkills: requiredRatio * ATS_WEIGHTS.requiredSkills,
    relevantExperience: experienceRatio * ATS_WEIGHTS.relevantExperience,
    technicalSkills: technicalPct * ATS_WEIGHTS.technicalSkills,
    education: eduFactor * ATS_WEIGHTS.education,
    keywordMatch: keywordPct * ATS_WEIGHTS.keywordMatch,
    preferredSkills: preferredRatio * ATS_WEIGHTS.preferredSkills,
  };

  const total = Math.max(
    0,
    Math.min(100, Math.round(Object.values(parts).reduce((sum, n) => sum + n, 0))),
  );

  return {
    atsScore: total,
    atsCategory: atsCategory(total)!,
    requiredSkills: {
      matched: required.matched,
      missing: required.missing,
      score: Math.round(parts.requiredSkills * 10) / 10,
      weight: ATS_WEIGHTS.requiredSkills,
      evidence: required.evidenceMap,
    },
    preferredSkills: {
      matched: preferred.matched,
      missing: preferred.missing,
      score: Math.round(parts.preferredSkills * 10) / 10,
      weight: ATS_WEIGHTS.preferredSkills,
      evidence: preferred.evidenceMap,
    },
    experience: {
      totalYears,
      relevantYears,
      requiredYears,
      match: experienceLabel(relevantYears, requiredYears),
      explanation: ai.relevantExperience.explanation,
      score: Math.round(parts.relevantExperience * 10) / 10,
      weight: ATS_WEIGHTS.relevantExperience,
    },
    education: {
      match: ai.educationMatch.result || "Not identified",
      explanation: educationExplanation,
      score: Math.round(parts.education * 10) / 10,
      weight: ATS_WEIGHTS.education,
    },
    keywordMatch: {
      matched: ai.keywordMatch,
      score: Math.round(parts.keywordMatch * 10) / 10,
      weight: ATS_WEIGHTS.keywordMatch,
    },
    technicalSkills: {
      analysis: ai.technicalSkillAnalysis,
      score: Math.round(parts.technicalSkills * 10) / 10,
      weight: ATS_WEIGHTS.technicalSkills,
    },
    summary: ai.summary,
    recommendation: "Review",
  };
}
