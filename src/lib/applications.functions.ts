import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type PublicJob = {
  id: string;
  job_code: string;
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
  application_deadline: string | null;
  status: string;
};

const PUBLIC_JOB_COLUMNS =
  "id, job_code, title, department, location, employment_type, description, required_skills, preferred_skills, min_experience_years, max_experience_years, education_requirement, application_deadline, status";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public: the details shown on the candidate application page. */
export const getPublicJob = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ code: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const trimmed = data.code.trim();
    const isUuid = UUID_REGEX.test(trimmed);

    let query = supabaseAdmin.from("jobs").select(PUBLIC_JOB_COLUMNS);
    if (isUuid) {
      query = query.eq("id", trimmed);
    } else {
      query = query.ilike("job_code", trimmed);
    }

    const { data: job } = await query.maybeSingle();

    if (!job) return { job: null as PublicJob | null, closed: false as boolean };
    const row = job as unknown as PublicJob;
    const expired = row.application_deadline
      ? new Date(`${row.application_deadline}T23:59:59`) < new Date()
      : false;
    if (row.status !== "active" || expired) {
      return { job: { ...row, description: null } as PublicJob, closed: true };
    }
    return { job: row, closed: false };
  });

/** HR only: a short-lived link to open a candidate's stored resume. */
export const getResumeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select("resume_path")
      .eq("id", data.candidateId)
      .single();
    if (error || !candidate?.resume_path)
      throw new Error("No resume file is stored for this applicant.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(candidate.resume_path, 300);
    if (signError || !signed?.signedUrl) throw new Error("Could not open the resume file.");
    return { url: signed.signedUrl };
  });

/** HR only: re-run the ATS against the current job requirements. */
export const rerunAts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { evaluateResume, saveEvaluation, saveEvaluationFailure, JOB_REQUIREMENT_COLUMNS } =
      await import("@/lib/ats/engine.server");

    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select("id, job_id, resume_text, resume_path, resume_file_type")
      .eq("id", data.candidateId)
      .single();
    if (error || !candidate) throw new Error("Applicant not found.");
    if (!candidate.job_id) throw new Error("Link this applicant to a job opening first.");

    const { data: job } = await context.supabase
      .from("jobs")
      .select(JOB_REQUIREMENT_COLUMNS)
      .eq("id", candidate.job_id)
      .single();
    if (!job) throw new Error("The linked job opening no longer exists.");

    await context.supabase
      .from("candidates")
      .update({ ats_status: "processing", ats_error: null })
      .eq("id", candidate.id);

    try {
      let resumeText = candidate.resume_text ?? "";
      if (candidate.resume_path) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: file } = await supabaseAdmin.storage
          .from("resumes")
          .download(candidate.resume_path);
        if (file) {
          const { extractResumeText } = await import("@/lib/ats/extract.server");
          resumeText = await extractResumeText(
            new Uint8Array(await file.arrayBuffer()),
            candidate.resume_file_type ?? "pdf",
          );
          await context.supabase
            .from("candidates")
            .update({ resume_text: resumeText })
            .eq("id", candidate.id);
        }
      }
      if (resumeText.trim().length < 80) {
        throw new Error("Unable to extract readable text from resume.");
      }

      const outcome = await evaluateResume(job as never, resumeText);
      await saveEvaluation(
        context.supabase,
        candidate.id,
        candidate.job_id,
        outcome,
        context.userId,
      );
      return { score: outcome.result.atsScore, category: outcome.result.atsCategory };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "ATS processing failed.";
      await saveEvaluationFailure(context.supabase, candidate.id, candidate.job_id, message);
      throw new Error(message);
    }
  });

/** HR only: previous ATS runs for a candidate. */
export const getAtsHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("ats_evaluations")
      .select(
        "id, ats_score, ats_category, status, error, created_at, scoring_version, summary, result",
      )
      .eq("candidate_id", data.candidateId)
      .order("created_at", { ascending: false })
      .limit(10);
    return rows ?? [];
  });

export type ComparisonCandidate = {
  id: string;
  job_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  applied_role: string | null;
  ats_score: number | null;
  ats_category: string | null;
  ats_summary: string | null;
  scoring_version: string | null;
  ats_scored_at: string | null;
  stage: string;
  application_status: string;
  auto_shortlisted: boolean;
  matched_required_skills: string[];
  missing_required_skills: string[];
  matched_preferred_skills: string[];
  missing_preferred_skills: string[];
  total_experience_years: number | null;
  relevant_experience_years: number | null;
  experience_match: string | null;
  education_match: string | null;
  keyword_score: number | null;
  ats_breakdown: Array<{
    key: string;
    label: string;
    weight: number;
    score: number;
    reason: string;
  }> | null;
  resume_parsed: {
    skills: string[];
    total_experience_years: number | null;
    experience: Array<{ title: string; company: string; duration: string }>;
    education: Array<{ qualification: string; institution: string; year: string }>;
    certifications: string[];
    dates_uncertain?: boolean | undefined;
  } | null;
  created_at: string;
  latestEvaluation?:
    | {
        summary: string | null;
        result: Json;
        created_at: string;
      }
    | null
    | undefined;
};

export type ComparisonResult = {
  job: PublicJob;
  candidates: ComparisonCandidate[];
};

export const MAX_COMPARISON_CANDIDATES = 5;

/** HR only: retrieves side-by-side ATS comparison data for candidates of the SAME job opening. */
export const compareCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        candidateIds: z
          .array(z.string().uuid())
          .min(2, "Select at least 2 candidates to compare.")
          .max(
            MAX_COMPARISON_CANDIDATES,
            `A maximum of ${MAX_COMPARISON_CANDIDATES} candidates can be compared at once.`,
          ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ComparisonResult> => {
    // 1. Query candidate records with staff RLS enforcement
    const { data: candidates, error: candError } = await context.supabase
      .from("candidates")
      .select(
        `id, job_id, full_name, email, phone, location, applied_role,
        ats_score, ats_category, ats_summary, scoring_version, ats_scored_at,
        stage, application_status, auto_shortlisted,
        matched_required_skills, missing_required_skills,
        matched_preferred_skills, missing_preferred_skills,
        total_experience_years, relevant_experience_years,
        experience_match, education_match, keyword_score,
        ats_breakdown, resume_parsed, created_at`,
      )
      .in("id", data.candidateIds);

    if (candError || !candidates || candidates.length === 0) {
      throw new Error("Unable to load candidates for comparison.");
    }

    if (candidates.length < 2) {
      throw new Error("Select at least 2 candidates to compare.");
    }

    // 2. Enforce same-job validation on the backend
    const firstCand = candidates[0];
    if (!firstCand?.job_id) {
      throw new Error("Candidates must belong to a job opening to be compared.");
    }

    const firstJobId = firstCand.job_id;
    const sameJob = candidates.every((c) => c.job_id === firstJobId);
    if (!sameJob) {
      throw new Error("Candidates must belong to the same job opening.");
    }

    // 3. Query the linked job opening
    const { data: job, error: jobError } = await context.supabase
      .from("jobs")
      .select(PUBLIC_JOB_COLUMNS)
      .eq("id", firstJobId)
      .single();

    if (jobError || !job) {
      throw new Error("The associated job opening could not be found.");
    }

    // 4. Fetch the latest ATS evaluations for skill evidence and detailed breakdown
    const { data: evaluations } = await context.supabase
      .from("ats_evaluations")
      .select("candidate_id, summary, result, created_at")
      .in("candidate_id", data.candidateIds)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    const evalMap = new Map<
      string,
      {
        summary: string | null;
        result: Json;
        created_at: string;
      }
    >();

    for (const ev of evaluations ?? []) {
      if (!evalMap.has(ev.candidate_id)) {
        evalMap.set(ev.candidate_id, {
          summary: ev.summary,
          result: (ev.result as Json) ?? null,
          created_at: ev.created_at,
        });
      }
    }

    // 5. Preserve the exact user selection order without any ranking or score sorting
    const candMap = new Map(candidates.map((c) => [c.id, c]));
    const orderedCandidates: ComparisonCandidate[] = data.candidateIds
      .map((id) => candMap.get(id))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .map((c) => ({
        ...(c as unknown as ComparisonCandidate),
        latestEvaluation: evalMap.get(c.id) ?? null,
      }));

    return {
      job: job as unknown as PublicJob,
      candidates: orderedCandidates,
    };
  });
