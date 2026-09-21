import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordOfferEvent, verifyOfferEligibility } from "./offers/offers.server";

/**
 * Loads offers and eligibility details for a candidate.
 */
export const getCandidateOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { candidateId: string }) => {
    return z.object({ candidateId: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const eligibility = await verifyOfferEligibility(context.supabase, data.candidateId);

    const { data: offers, error: offersError } = await context.supabase
      .from("offers")
      .select("*, jobs(id, title, department)")
      .eq("candidate_id", data.candidateId)
      .order("created_at", { ascending: false });

    if (offersError) throw new Error("Could not load offers for this candidate.");

    const offerIds = (offers ?? []).map((o) => o.id);
    let events: Database["public"]["Tables"]["offer_events"]["Row"][] = [];
    if (offerIds.length > 0) {
      const { data: eventsData } = await context.supabase
        .from("offer_events")
        .select("*")
        .in("offer_id", offerIds)
        .order("created_at", { ascending: true });
      events = eventsData ?? [];
    }

    return {
      eligibility,
      offers: offers ?? [],
      events,
    };
  });

/**
 * Creates a new offer in DRAFT status for an eligible candidate.
 * Strictly verifies that the candidate has completed an interview.
 * Enforces that no more than one active (DRAFT or SENT) offer exists at a time.
 */
export const createOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      candidateId: string;
      jobId?: string | null;
      compensation: number;
      currency?: string;
      startDate: string;
      expiresAt: string;
      notes?: string | null;
    }) =>
      z
        .object({
          candidateId: z.string().uuid(),
          jobId: z.string().uuid().nullable().optional(),
          compensation: z.number().positive("Compensation must be greater than 0"),
          currency: z.string().min(1).default("INR"),
          startDate: z.string().min(1, "Start date is required"),
          expiresAt: z.string().min(1, "Expiration date is required"),
          notes: z.string().nullable().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    // 1. Authoritative Backend Eligibility Check
    const eligibility = await verifyOfferEligibility(context.supabase, data.candidateId);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || "Candidate is not eligible for an offer.");
    }

    // 2. Partial Uniqueness Check for Active Offers
    if (eligibility.activeOffer) {
      throw new Error(
        `Candidate already has an active offer in ${eligibility.activeOffer.status} status. Revoke or update it before creating a new one.`,
      );
    }

    // 3. Insert Offer
    const candidate = eligibility.candidate!;
    const jobId = data.jobId || candidate.job_id || null;

    const { data: created, error: insertError } = await context.supabase
      .from("offers")
      .insert({
        candidate_id: data.candidateId,
        job_id: jobId,
        compensation: data.compensation,
        currency: data.currency || "INR",
        start_date: data.startDate,
        expires_at: data.expiresAt,
        notes: data.notes ?? null,
        status: "DRAFT",
      })
      .select()
      .single();

    if (insertError || !created) {
      throw new Error(insertError?.message || "Could not create offer record.");
    }

    // 4. Record Audit Event
    await recordOfferEvent(context.supabase, {
      offerId: created.id,
      candidateId: data.candidateId,
      eventType: "OFFER_CREATED",
      notes: `Offer created with compensation ${data.currency || "INR"} ${data.compensation}`,
    });

    return { offer: created };
  });

/**
 * Sends an offer letter to the candidate.
 * Sets offer status to SENT, candidate stage to "offer", candidate application_status to "offer_sent",
 * logs audit event, and delivers email via sendTemplateEmail.
 */
export const sendOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { offerId: string; origin?: string }) =>
    z
      .object({
        offerId: z.string().uuid(),
        origin: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // 1. Load Offer
    const { data: offer, error: offerError } = await context.supabase
      .from("offers")
      .select("*, candidates(*), jobs(id, title)")
      .eq("id", data.offerId)
      .maybeSingle();

    if (offerError || !offer) {
      throw new Error("Offer not found.");
    }

    if (offer.status === "ACCEPTED") {
      throw new Error("Cannot send an offer that has already been accepted.");
    }
    if (offer.status === "DECLINED") {
      throw new Error("Cannot send an offer that has already been declined.");
    }
    if (offer.status === "REVOKED") {
      throw new Error("Cannot send a revoked offer.");
    }

    // 2. Authoritative Eligibility Check
    const eligibility = await verifyOfferEligibility(context.supabase, offer.candidate_id);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || "Candidate is not eligible to receive an offer.");
    }

    const offerRelations = offer as unknown as {
      candidates?: {
        full_name?: string;
        email?: string;
        applied_role?: string | null;
        stage?: string | null;
      } | null;
      jobs?: { title?: string | null } | null;
    };
    const candidate = offerRelations.candidates;
    const job = offerRelations.jobs;
    const jobTitle = job?.title || candidate?.applied_role || "the position";
    const origin = data.origin || (typeof window !== "undefined" ? window.location.origin : "");
    const offerUrl = origin
      ? `${origin}/offer/${offer.secure_token}`
      : `/offer/${offer.secure_token}`;

    const sentAt = new Date().toISOString();

    // 3. Update Offer Status to SENT
    const { data: updatedOffer, error: updateError } = await context.supabase
      .from("offers")
      .update({
        status: "SENT",
        sent_at: sentAt,
      })
      .eq("id", offer.id)
      .select()
      .single();

    if (updateError || !updatedOffer) {
      throw new Error("Could not update offer status to SENT.");
    }

    // 4. Update Candidate Stage & Application Status
    const prevStage = candidate?.stage || "interview";
    await context.supabase
      .from("candidates")
      .update({
        stage: "offer",
        application_status: "offer_sent",
      })
      .eq("id", offer.candidate_id);

    // 5. Stage History Record
    await context.supabase.from("stage_history").insert({
      candidate_id: offer.candidate_id,
      from_stage: prevStage,
      to_stage: "offer",
    });

    // 6. Record Audit Event
    await recordOfferEvent(context.supabase, {
      offerId: offer.id,
      candidateId: offer.candidate_id,
      eventType: "OFFER_SENT",
      notes: `Offer sent to ${candidate?.email || "candidate"} on ${sentAt}`,
    });

    // 7. Dispatch Offer Email
    let emailSent = false;
    let emailError: string | undefined;

    try {
      const { sendTemplateEmail } = await import("./email-templates/send-email");
      if (!candidate?.email) {
        throw new Error("Candidate has no email address.");
      }
      const emailResult = await sendTemplateEmail("offer-letter", candidate.email, {
        templateData: {
          candidateName: candidate?.full_name || "Candidate",
          jobTitle,
          compensation: offer.compensation,
          currency: offer.currency,
          startDate: offer.start_date,
          expiresAt: offer.expires_at,
          offerUrl,
          notes: offer.notes,
        },
        idempotencyKey: `offer-${offer.id}-${offer.secure_token}`,
      });
      emailSent = emailResult.sent;
      if (!emailResult.sent) {
        emailError = "Recipient email address suppressed or delivery unavailable.";
      }
    } catch (cause) {
      console.error("Offer email delivery failed:", cause);
      emailError = cause instanceof Error ? cause.message : "Email delivery failed.";
    }

    return {
      sent: true,
      emailSent,
      emailError,
      offer: updatedOffer,
      offerUrl,
    };
  });

/**
 * Revokes an offer that is in DRAFT or SENT status.
 */
export const revokeOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { offerId: string; reason?: string }) =>
    z
      .object({
        offerId: z.string().uuid(),
        reason: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: offer, error } = await context.supabase
      .from("offers")
      .select("*")
      .eq("id", data.offerId)
      .maybeSingle();

    if (error || !offer) throw new Error("Offer not found.");

    if (offer.status === "ACCEPTED") {
      throw new Error("Cannot revoke an offer that has already been accepted.");
    }

    const { error: updateError } = await context.supabase
      .from("offers")
      .update({ status: "REVOKED" })
      .eq("id", offer.id);

    if (updateError) throw new Error("Could not revoke offer.");

    await recordOfferEvent(context.supabase, {
      offerId: offer.id,
      candidateId: offer.candidate_id,
      eventType: "OFFER_REVOKED",
      notes: data.reason || "Offer revoked by recruiter.",
    });

    return { revoked: true, offerId: offer.id };
  });
