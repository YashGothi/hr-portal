import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INTERVIEW_ELIGIBLE_STATUSES, SHORTLIST_THRESHOLD } from "@/lib/ats/weights";

/**
 * HR only: prepares (or reuses) the secure interview scheduling invitation for
 * a shortlisted applicant and returns everything the preview panel needs.
 * Applicants below the ATS threshold never get a link.
 */
export const previewInterviewInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ candidateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select("id, full_name, applied_role, job_id, ats_score, application_status")
      .eq("id", data.candidateId)
      .single();
    if (error || !candidate) throw new Error("Applicant not found.");

    const score = candidate.ats_score;
    const eligible =
      (score ?? -1) >= SHORTLIST_THRESHOLD ||
      (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(candidate.application_status);
    if (!eligible) {
      throw new Error(
        `Interview invitations are only available for applicants scoring ${SHORTLIST_THRESHOLD} or above.`,
      );
    }

    let jobTitle: string | null = candidate.applied_role ?? null;
    if (candidate.job_id) {
      const { data: job } = await context.supabase
        .from("jobs")
        .select("title")
        .eq("id", candidate.job_id)
        .maybeSingle();
      jobTitle = job?.title ?? jobTitle;
    }

    const { applyShortlistDecision } = await import("@/lib/ats/shortlist.server");
    let token: string | null = null;

    const { data: existing } = await context.supabase
      .from("scheduling_invites")
      .select("token, revoked_at, expires_at")
      .eq("candidate_id", candidate.id)
      .eq("appointment_type", "INTERVIEW")
      .maybeSingle();

    const usable =
      existing &&
      !existing.revoked_at &&
      (!existing.expires_at || new Date(existing.expires_at) > new Date());

    if (usable) {
      token = existing.token;
    } else {
      const outcome = await applyShortlistDecision(context.supabase, candidate.id, score);
      token = outcome.interviewToken;
    }

    if (!token) throw new Error("Could not prepare the interview scheduling link.");

    return {
      candidateName: candidate.full_name,
      jobTitle,
      token,
      atsScore: score,
    };
  });
