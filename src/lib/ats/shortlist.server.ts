/**
 * Server-only automatic shortlisting. Runs straight after an ATS evaluation
 * completes: the score decides the application status, and shortlisted
 * applicants get a secure interview scheduling invitation prepared for them.
 * Nothing here trusts client input — the threshold lives on the backend.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SHORTLIST_THRESHOLD, shortlistDecision } from "./weights";

type Db = SupabaseClient<Database>;

export type ShortlistOutcome = {
  decision: "shortlisted" | "filtered_out" | null;
  interviewToken: string | null;
};

/** Reuses an existing interview invite, otherwise mints a fresh secure token. */
async function ensureInterviewInvite(db: Db, candidateId: string): Promise<string | null> {
  const { data: existing } = await db
    .from("scheduling_invites")
    .select("id, token, expires_at, revoked_at")
    .eq("candidate_id", candidateId)
    .eq("appointment_type", "INTERVIEW")
    .maybeSingle();

  if (existing) {
    const expired = existing.expires_at && new Date(existing.expires_at) < new Date();
    if (!existing.revoked_at && !expired) return existing.token;
    const { data: revived } = await db
      .from("scheduling_invites")
      .update({ revoked_at: null, expires_at: null })
      .eq("id", existing.id)
      .select("token")
      .single();
    return revived?.token ?? null;
  }

  const { data: created } = await db
    .from("scheduling_invites")
    .insert({
      candidate_id: candidateId,
      appointment_type: "INTERVIEW",
      token: crypto.randomUUID(),
    })
    .select("token")
    .single();
  return created?.token ?? null;
}

/**
 * Applies the ATS threshold rule:
 *   score >= 85 → Shortlisted → interview invitation prepared
 *   score <  85 → Filtered Out (kept in the database, no invitation)
 */
export async function applyShortlistDecision(
  db: Db,
  candidateId: string,
  score: number | null | undefined,
): Promise<ShortlistOutcome> {
  const decision = shortlistDecision(score);
  if (!decision) return { decision: null, interviewToken: null };
  const now = new Date().toISOString();

  if (decision === "filtered_out") {
    await db
      .from("candidates")
      .update({ application_status: "filtered_out", filtered_out_at: now })
      .eq("id", candidateId);
    return { decision, interviewToken: null };
  }

  const { data: candidate } = await db
    .from("candidates")
    .select("stage, full_name, shortlisted_at")
    .eq("id", candidateId)
    .maybeSingle();

  const promoteStage = candidate?.stage === "application" || candidate?.stage === "screening";

  await db
    .from("candidates")
    .update({
      application_status: "shortlisted",
      shortlisted_at: candidate?.shortlisted_at ?? now,
      auto_shortlisted: true,
      ...(promoteStage ? { stage: "shortlisted" } : {}),
    })
    .eq("id", candidateId);

  if (promoteStage) {
    await db.from("stage_history").insert({
      candidate_id: candidateId,
      from_stage: candidate?.stage ?? null,
      to_stage: "shortlisted",
    });
  }

  const token = await ensureInterviewInvite(db, candidateId);

  if (token) {
    await db
      .from("candidates")
      .update({ application_status: "interview_invited", interview_invited_at: now })
      .eq("id", candidateId);
  }

  await db.from("alerts").insert({
    candidate_id: candidateId,
    title: `${candidate?.full_name ?? "Applicant"} auto-shortlisted (${score}/100)`,
    body: token
      ? `Scored at or above ${SHORTLIST_THRESHOLD}. An interview scheduling link is ready to send.`
      : `Scored at or above ${SHORTLIST_THRESHOLD}. Create an interview scheduling link to invite them.`,
    read: false,
  });

  return { decision, interviewToken: token };
}
