import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SHORTLIST_THRESHOLD } from "@/lib/ats/weights";

export type OfferStatus = Database["public"]["Tables"]["offers"]["Row"]["status"];
export type OfferEventType = Database["public"]["Tables"]["offer_events"]["Row"]["event_type"];

export interface EligibilityResult {
  eligible: boolean;
  reason?: string | undefined;
  candidate?: Database["public"]["Tables"]["candidates"]["Row"] | undefined;
  completedAppointmentCount?: number | undefined;
  activeOffer?: Database["public"]["Tables"]["offers"]["Row"] | null | undefined;
}

/**
 * Backend Authoritative Eligibility Check for Offers.
 *
 * Rules:
 * 1. Candidate must exist.
 * 2. ATS score >= 85 (SHORTLIST_THRESHOLD).
 * 3. Candidate is not filtered_out or rejected.
 * 4. Candidate must have at least one COMPLETED interview appointment.
 */
export async function verifyOfferEligibility(
  supabase: SupabaseClient<Database>,
  candidateId: string,
): Promise<EligibilityResult> {
  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();

  if (candError || !candidate) {
    return { eligible: false, reason: "Candidate not found." };
  }

  // 1. ATS Score Threshold Check
  if (candidate.ats_score == null || candidate.ats_score < SHORTLIST_THRESHOLD) {
    return {
      eligible: false,
      reason: `Candidate ATS score (${candidate.ats_score ?? "none"}) is below the shortlisting threshold of ${SHORTLIST_THRESHOLD}.`,
      candidate,
    };
  }

  // 2. Application Status Check
  if (candidate.application_status === "filtered_out") {
    return {
      eligible: false,
      reason: "Filtered-out candidates cannot receive an offer.",
      candidate,
    };
  }

  if (candidate.application_status === "rejected") {
    return {
      eligible: false,
      reason: "Rejected candidates cannot receive an offer.",
      candidate,
    };
  }

  // 3. Completed Interview Appointment Check
  const { data: appointments, error: apptError } = await supabase
    .from("appointments")
    .select("id, appointment_type, status, start_at")
    .eq("candidate_id", candidateId)
    .eq("appointment_type", "INTERVIEW")
    .eq("status", "COMPLETED");

  if (apptError) {
    return { eligible: false, reason: "Could not verify interview completion records." };
  }

  const completedCount = appointments?.length ?? 0;
  if (completedCount === 0) {
    return {
      eligible: false,
      reason:
        "Candidate has no completed interview record. Candidates must complete an interview before an offer can be extended.",
      candidate,
      completedAppointmentCount: 0,
    };
  }

  // 4. Check for currently active offer (DRAFT or SENT)
  const { data: activeOffers } = await supabase
    .from("offers")
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["DRAFT", "SENT"]);

  const activeOffer = activeOffers && activeOffers.length > 0 ? activeOffers[0] : null;

  return {
    eligible: true,
    candidate,
    completedAppointmentCount: completedCount,
    activeOffer,
  };
}

/**
 * Record an audit event in offer_events.
 */
export async function recordOfferEvent(
  supabase: SupabaseClient<Database>,
  input: {
    offerId: string;
    candidateId: string;
    eventType: OfferEventType;
    notes?: string | null;
    createdBy?: string | null;
  },
): Promise<void> {
  await supabase.from("offer_events").insert({
    offer_id: input.offerId,
    candidate_id: input.candidateId,
    event_type: input.eventType,
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  });
}

export interface PublicOfferPayload {
  token: string;
  status: OfferStatus;
  compensation: number;
  currency: string;
  startDate: string;
  expiresAt: string;
  notes: string | null;
  candidateName: string;
  jobTitle: string;
  department: string | null;
  location: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  isExpired: boolean;
}

export type ResolvePublicOfferResult =
  { ok: true; offer: PublicOfferPayload } | { ok: false; status: number; reason: string };

/**
 * Public candidate-facing offer resolver by secure token.
 * Strictly guarantees ZERO ATS leakage and ZERO recruiter-only data leakage.
 * Automatically checks and updates expired status.
 */
export async function resolvePublicOffer(
  supabaseAdmin: SupabaseClient<Database>,
  token: string,
): Promise<ResolvePublicOfferResult> {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { ok: false, status: 400, reason: "Invalid offer token." };
  }

  const { data: offer, error: offerError } = await supabaseAdmin
    .from("offers")
    .select("*")
    .eq("secure_token", token)
    .maybeSingle();

  if (offerError || !offer) {
    return { ok: false, status: 404, reason: "Offer not found or invalid link." };
  }

  // Check expiration consistency
  const now = new Date();
  const expiresAt = new Date(offer.expires_at);
  let currentStatus = offer.status;

  if (currentStatus === "SENT" && now > expiresAt) {
    currentStatus = "EXPIRED";
    await supabaseAdmin
      .from("offers")
      .update({ status: "EXPIRED" })
      .eq("id", offer.id)
      .eq("status", "SENT");

    await recordOfferEvent(supabaseAdmin, {
      offerId: offer.id,
      candidateId: offer.candidate_id,
      eventType: "OFFER_EXPIRED",
      notes: "Offer expired based on deadline timestamp.",
    });
  }

  // Load candidate name
  const { data: candidate } = await supabaseAdmin
    .from("candidates")
    .select("full_name")
    .eq("id", offer.candidate_id)
    .maybeSingle();

  // Load job metadata (public fields only)
  let jobTitle = "Position";
  let department: string | null = null;
  let location: string | null = null;

  if (offer.job_id) {
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("title, department, location")
      .eq("id", offer.job_id)
      .maybeSingle();
    if (job) {
      jobTitle = job.title;
      department = job.department;
      location = job.location;
    }
  }

  return {
    ok: true,
    offer: {
      token: offer.secure_token,
      status: currentStatus,
      compensation: Number(offer.compensation),
      currency: offer.currency,
      startDate: offer.start_date,
      expiresAt: offer.expires_at,
      notes: offer.notes,
      candidateName: candidate?.full_name ?? "Candidate",
      jobTitle,
      department,
      location,
      sentAt: offer.sent_at,
      acceptedAt: offer.accepted_at,
      declinedAt: offer.declined_at,
      isExpired: currentStatus === "EXPIRED" || now > expiresAt,
    },
  };
}

export type OfferActionResponse =
  | { ok: true; status: "ACCEPTED" | "DECLINED"; timestamp: string }
  | { ok: false; status: number; reason: string };

/**
 * Atomic Offer Response Handler (ACCEPT or DECLINE).
 * Strictly enforces:
 * - Token existence & valid SENT status
 * - Expiration validation (rejects expired offers)
 * - Atomic single update (prevents duplicate acceptance / race conditions)
 * - Stage & application status transition to Hired / Offer Declined
 * - Stage history recording
 * - In-app recruiter alert creation
 */
export async function respondToPublicOffer(
  supabaseAdmin: SupabaseClient<Database>,
  token: string,
  action: "ACCEPT" | "DECLINE",
): Promise<OfferActionResponse> {
  if (!token) return { ok: false, status: 400, reason: "Missing offer token." };

  const { data: offer, error } = await supabaseAdmin
    .from("offers")
    .select("*, candidates(id, full_name, stage, application_status), jobs(id, title)")
    .eq("secure_token", token)
    .maybeSingle();

  if (error || !offer) {
    return { ok: false, status: 404, reason: "Offer not found." };
  }

  if (offer.status === "ACCEPTED") {
    return { ok: false, status: 400, reason: "This offer has already been accepted." };
  }

  if (offer.status === "DECLINED") {
    return {
      ok: false,
      status: 400,
      reason: "This offer was previously declined and cannot be modified.",
    };
  }

  if (offer.status === "REVOKED") {
    return { ok: false, status: 400, reason: "This offer has been revoked." };
  }

  if (offer.status === "DRAFT") {
    return { ok: false, status: 400, reason: "This offer has not been officially sent yet." };
  }

  // Check expiration
  const now = new Date();
  const expiresAt = new Date(offer.expires_at);
  if (now > expiresAt || offer.status === "EXPIRED") {
    if (offer.status === "SENT") {
      await supabaseAdmin
        .from("offers")
        .update({ status: "EXPIRED" })
        .eq("id", offer.id)
        .eq("status", "SENT");

      await recordOfferEvent(supabaseAdmin, {
        offerId: offer.id,
        candidateId: offer.candidate_id,
        eventType: "OFFER_EXPIRED",
        notes: "Offer expired on response attempt.",
      });
    }
    return {
      ok: false,
      status: 400,
      reason: "This offer has expired and can no longer be accepted.",
    };
  }

  const timestamp = now.toISOString();
  const offerWithRelations = offer as unknown as {
    candidates?: {
      id: string;
      full_name: string;
      stage: string;
      application_status: string;
    } | null;
    jobs?: { id: string; title: string } | null;
  };
  const candidate = offerWithRelations.candidates;
  const candidateName = candidate?.full_name || "Candidate";
  const jobTitle = offerWithRelations.jobs?.title || "the position";

  if (action === "ACCEPT") {
    // Atomic update with status condition guard
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("offers")
      .update({
        status: "ACCEPTED",
        accepted_at: timestamp,
      })
      .eq("id", offer.id)
      .eq("status", "SENT")
      .select()
      .maybeSingle();

    if (updateError || !updated) {
      return {
        ok: false,
        status: 409,
        reason: "Offer could not be accepted. It may have already been accepted or updated.",
      };
    }

    // Candidate transitions to Hired
    const prevStage = candidate?.stage || "offer";
    await supabaseAdmin
      .from("candidates")
      .update({
        stage: "hired",
        application_status: "hired",
      })
      .eq("id", offer.candidate_id);

    // Stage history record
    await supabaseAdmin.from("stage_history").insert({
      candidate_id: offer.candidate_id,
      from_stage: prevStage,
      to_stage: "hired",
    });

    // Offer event
    await recordOfferEvent(supabaseAdmin, {
      offerId: offer.id,
      candidateId: offer.candidate_id,
      eventType: "OFFER_ACCEPTED",
      notes: `Accepted by candidate via public link on ${timestamp}`,
    });

    // In-app recruiter alert
    await supabaseAdmin.from("alerts").insert({
      candidate_id: offer.candidate_id,
      title: `Offer accepted: ${candidateName}`,
      body: `${candidateName} accepted the offer for ${jobTitle}`,
      read: false,
    });

    return { ok: true, status: "ACCEPTED", timestamp };
  }

  if (action === "DECLINE") {
    // Atomic update with status condition guard
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("offers")
      .update({
        status: "DECLINED",
        declined_at: timestamp,
      })
      .eq("id", offer.id)
      .eq("status", "SENT")
      .select()
      .maybeSingle();

    if (updateError || !updated) {
      return {
        ok: false,
        status: 409,
        reason: "Offer could not be declined. It may have already been processed.",
      };
    }

    // Candidate transitions to offer_declined
    await supabaseAdmin
      .from("candidates")
      .update({
        application_status: "offer_declined",
      })
      .eq("id", offer.candidate_id);

    // Offer event
    await recordOfferEvent(supabaseAdmin, {
      offerId: offer.id,
      candidateId: offer.candidate_id,
      eventType: "OFFER_DECLINED",
      notes: `Declined by candidate via public link on ${timestamp}`,
    });

    // In-app recruiter alert
    await supabaseAdmin.from("alerts").insert({
      candidate_id: offer.candidate_id,
      title: `Offer declined: ${candidateName}`,
      body: `${candidateName} declined the offer for ${jobTitle}`,
      read: false,
    });

    return { ok: true, status: "DECLINED", timestamp };
  }

  return { ok: false, status: 400, reason: "Invalid action." };
}
