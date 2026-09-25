import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ScoreInput = z.object({ candidateId: z.string().uuid() });

export const ATS_CATEGORIES = [
  { key: "skills", label: "Skills match", weight: 40 },
  { key: "experience", label: "Relevant experience", weight: 30 },
  { key: "education", label: "Education & certifications", weight: 15 },
  { key: "role_fit", label: "Role & seniority fit", weight: 10 },
  { key: "location", label: "Location & availability", weight: 5 },
] as const;

export type AtsBreakdownItem = {
  key: string;
  label: string;
  weight: number;
  score: number;
  reason: string;
};

export type ResumeParsed = {
  skills: string[];
  total_experience_years: number | null;
  experience: Array<{ title: string; company: string; duration: string }>;
  education: Array<{ qualification: string; institution: string; year: string }>;
  certifications: string[];
};

type AtsResult = {
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  breakdown: AtsBreakdownItem[];
  parsed: ResumeParsed;
};

function toText(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toParsed(value: unknown): ResumeParsed {
  const raw = (value ?? {}) as Record<string, unknown>;
  const years = Number(raw["total_experience_years"]);
  const experience = Array.isArray(raw["experience"]) ? raw["experience"] : [];
  const education = Array.isArray(raw["education"]) ? raw["education"] : [];
  return {
    skills: toStringList(raw["skills"], 20),
    total_experience_years: Number.isFinite(years)
      ? Math.max(0, Math.round(years * 10) / 10)
      : null,
    experience: experience.slice(0, 8).map((item) => {
      const e = (item ?? {}) as Record<string, unknown>;
      return {
        title: toText(e["title"]) || "Role not stated",
        company: toText(e["company"]),
        duration: toText(e["duration"], 60),
      };
    }),
    education: education.slice(0, 6).map((item) => {
      const e = (item ?? {}) as Record<string, unknown>;
      return {
        qualification: toText(e["qualification"] ?? e["degree"]) || "Qualification not stated",
        institution: toText(e["institution"]),
        year: toText(e["year"], 20),
      };
    }),
    certifications: toStringList(raw["certifications"], 10),
  };
}

function toBreakdown(value: unknown): AtsBreakdownItem[] {
  const raw = (value ?? {}) as Record<string, unknown>;
  return ATS_CATEGORIES.map((category) => {
    const entry = (raw[category.key] ?? {}) as Record<string, unknown>;
    return {
      key: category.key,
      label: category.label,
      weight: category.weight,
      score: clampScore(entry["score"]),
      reason:
        typeof entry["reason"] === "string" && entry["reason"].trim()
          ? (entry["reason"] as string).trim().slice(0, 240)
          : "No detail returned for this area.",
    };
  });
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, max)
    .map((v) => v.trim().slice(0, 200));
}

/** Runs an ATS match on a candidate's resume against the linked job opening. */
export const scoreCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ScoreInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select("id, full_name, applied_role, resume_text, job_id")
      .eq("id", data.candidateId)
      .single();

    if (error || !candidate) throw new Error("Candidate not found.");
    if (!candidate.resume_text || candidate.resume_text.trim().length < 40) {
      throw new Error("Add the candidate's resume text before running the match.");
    }

    const { evaluateResume, saveEvaluation, JOB_REQUIREMENT_COLUMNS } =
      await import("@/lib/ats/engine.server");

    let jobRequirements = {
      title: candidate.applied_role || "General Role",
      department: null as string | null,
      location: null as string | null,
      employment_type: "Full-time",
      description: null as string | null,
      required_skills: [] as string[],
      preferred_skills: [] as string[],
      min_experience_years: null as number | null,
      max_experience_years: null as number | null,
      education_requirement: null as string | null,
    };

    if (candidate.job_id) {
      const { data: job } = await context.supabase
        .from("jobs")
        .select(JOB_REQUIREMENT_COLUMNS)
        .eq("id", candidate.job_id)
        .single();
      if (job) {
        jobRequirements = job as never;
      }
    }

    const outcome = await evaluateResume(jobRequirements, candidate.resume_text);
    const { data: userData } = await context.supabase.auth.getUser();
    await saveEvaluation(
      context.supabase,
      candidate.id,
      candidate.job_id,
      outcome,
      userData.user?.id ?? null,
    );

    return {
      score: outcome.result.atsScore,
      summary: outcome.result.summary,
      strengths: outcome.result.requiredSkills.matched.slice(0, 4),
      gaps: outcome.result.requiredSkills.missing.slice(0, 4),
      breakdown: outcome.breakdown,
      parsed: outcome.parsed,
    };
  });
