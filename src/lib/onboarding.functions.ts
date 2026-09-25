import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  completeOnboardingAtomic,
  createOnboardingAtomic,
  recordOnboardingEvent,
  resendOnboardingInviteAtomic,
  resolveOnboardingToken,
  reviewOnboardingDocument,
  uploadCandidateDocument,
  verifyOnboardingEligibility,
} from "./onboarding/onboarding.server";

export type OnboardingDocumentWithSignedUrl =
  Database["public"]["Tables"]["onboarding_documents"]["Row"] & {
    signedUrl?: string | null;
  };

/**
 * Loads onboarding record, document compliance items (with 15-minute signed URLs for staff),
 * audit events, and eligibility details for a candidate.
 */
export const getCandidateOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { candidateId: string }) => {
    return z.object({ candidateId: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const eligibility = await verifyOnboardingEligibility(context.supabase, data.candidateId);

    // Fetch the most relevant onboarding record (active first, else latest)
    const { data: onboardingList, error: onboardingError } = await context.supabase
      .from("onboarding")
      .select("*, jobs(id, title, department)")
      .eq("candidate_id", data.candidateId)
      .order("created_at", { ascending: false });

    if (onboardingError) {
      throw new Error("Could not load onboarding records for candidate.");
    }

    const currentOnboarding =
      (onboardingList ?? []).find(
        (o) => o.status === "NOT_STARTED" || o.status === "IN_PROGRESS",
      ) ??
      (onboardingList ?? [])[0] ??
      null;

    let documents: OnboardingDocumentWithSignedUrl[] = [];
    let events: Database["public"]["Tables"]["onboarding_events"]["Row"][] = [];

    if (currentOnboarding) {
      const { data: docsData } = await context.supabase
        .from("onboarding_documents")
        .select("*")
        .eq("onboarding_id", currentOnboarding.id)
        .order("created_at", { ascending: true });

      const rawDocs = docsData ?? [];

      // Generate 15-minute secure signed URLs for recruiter document viewing
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      documents = await Promise.all(
        rawDocs.map(async (doc) => {
          let signedUrl: string | null = null;
          if (doc.storage_path) {
            const { data: signedData } = await supabaseAdmin.storage
              .from("onboarding-documents")
              .createSignedUrl(doc.storage_path, 900); // 15 minutes
            signedUrl = signedData?.signedUrl ?? null;
          }
          return {
            ...doc,
            signedUrl,
          };
        }),
      );

      const { data: eventsData } = await context.supabase
        .from("onboarding_events")
        .select("*")
        .eq("onboarding_id", currentOnboarding.id)
        .order("created_at", { ascending: true });
      events = eventsData ?? [];
    }

    return {
      eligibility,
      onboarding: currentOnboarding,
      allOnboardings: onboardingList ?? [],
      documents,
      events,
    };
  });

/**
 * Atomically creates onboarding record, initial document compliance items,
 * generates 256-bit token hash, dispatches onboarding invitation email,
 * and records ONBOARDING_INVITE_SENT event upon confirmed email delivery (Option B).
 */
export const createOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { candidateId: string; startDate?: string | null; origin?: string | undefined }) =>
      z
        .object({
          candidateId: z.string().uuid(),
          startDate: z.string().nullable().optional(),
          origin: z.string().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const result = await createOnboardingAtomic(context.supabase, {
      candidateId: data.candidateId,
      startDate: data.startDate ?? null,
      createdBy: context.userId ?? null,
    });

    const origin = data.origin || (typeof window !== "undefined" ? window.location.origin : "");
    const onboardingUrl = origin
      ? `${origin}/onboarding/${result.rawToken}`
      : `/onboarding/${result.rawToken}`;

    // Look up candidate email and job info for email dispatch
    const { data: candidate } = await context.supabase
      .from("candidates")
      .select("full_name, email, job_id, jobs(title)")
      .eq("id", data.candidateId)
      .single();

    let emailSent = false;
    let emailError: string | undefined;

    if (candidate?.email) {
      try {
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const jobTitle = (candidate.jobs as unknown as { title: string })?.title || "your new role";

        const emailResult = await sendTemplateEmail("onboarding-invitation", candidate.email, {
          templateData: {
            candidateName: candidate.full_name,
            jobTitle,
            startDate: result.onboarding.start_date,
            onboardingUrl,
          },
          idempotencyKey: `onboarding-${result.onboarding.id}-${result.rawToken.slice(0, 16)}`,
        });

        emailSent = emailResult.sent;

        // Option B Audit Semantics: record ONBOARDING_INVITE_SENT only upon confirmed delivery
        if (emailSent) {
          await recordOnboardingEvent(context.supabase, {
            onboardingId: result.onboarding.id,
            candidateId: data.candidateId,
            eventType: "ONBOARDING_INVITE_SENT",
            notes: `Initial onboarding invitation email delivered to ${candidate.email}.`,
            createdBy: context.userId ?? null,
          });
        }
      } catch (err: unknown) {
        console.error("Onboarding invitation email dispatch failed:", err);
        emailError = err instanceof Error ? err.message : "Email dispatch failed";
      }
    }

    return {
      ...result,
      onboardingUrl,
      emailSent,
      emailError,
    };
  });

/**
 * Resends onboarding invitation with new 256-bit token (invalidating prior token),
 * dispatches email, and records ONBOARDING_INVITE_SENT upon confirmed delivery (Option B).
 */
export const resendOnboardingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { onboardingId: string; origin?: string | undefined }) =>
    z
      .object({
        onboardingId: z.string().uuid(),
        origin: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const result = await resendOnboardingInviteAtomic(context.supabase, data.onboardingId);

    const origin = data.origin || (typeof window !== "undefined" ? window.location.origin : "");
    const onboardingUrl = origin
      ? `${origin}/onboarding/${result.rawToken}`
      : `/onboarding/${result.rawToken}`;

    const { data: candidate } = await context.supabase
      .from("candidates")
      .select("full_name, email, job_id, jobs(title)")
      .eq("id", result.candidateId)
      .single();

    let emailSent = false;
    let emailError: string | undefined;

    if (candidate?.email) {
      try {
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const jobTitle = (candidate.jobs as unknown as { title: string })?.title || "your new role";

        const emailResult = await sendTemplateEmail("onboarding-invitation", candidate.email, {
          templateData: {
            candidateName: candidate.full_name,
            jobTitle,
            onboardingUrl,
          },
          idempotencyKey: `onboarding-resend-${data.onboardingId}-${result.rawToken.slice(0, 16)}`,
        });

        emailSent = emailResult.sent;

        // Option B Audit Semantics: record ONBOARDING_INVITE_SENT only upon confirmed delivery
        if (emailSent) {
          await recordOnboardingEvent(context.supabase, {
            onboardingId: data.onboardingId,
            candidateId: result.candidateId,
            eventType: "ONBOARDING_INVITE_SENT",
            notes: `Replacement onboarding invitation email delivered to ${candidate.email}.`,
            createdBy: context.userId ?? null,
          });
        }
      } catch (err: unknown) {
        console.error("Resend onboarding invitation email dispatch failed:", err);
        emailError = err instanceof Error ? err.message : "Email dispatch failed";
      }
    }

    return {
      success: true,
      rawToken: result.rawToken,
      onboardingUrl,
      emailSent,
      emailError,
    };
  });

/**
 * Candidate Portal: Resolves incoming candidate token into minimized portal display payload.
 * Publicly callable without staff authentication.
 */
export const getOnboardingPortalData = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => {
    return z.object({ token: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const portalData = await resolveOnboardingToken(supabaseAdmin, data.token);
    return portalData;
  });

/**
 * Candidate Portal: Uploads candidate compliance document.
 * Authenticated by bearer candidate token, validated with magic bytes and 8 MB limit.
 */
export const uploadCandidateDocumentAction = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      documentId: string;
      fileName: string;
      mimeType: string;
      fileBase64: string;
    }) =>
      z
        .object({
          token: z.string().min(1),
          documentId: z.string().uuid(),
          fileName: z.string().min(1),
          mimeType: z.string().min(1),
          fileBase64: z.string().min(1),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const fileBuffer = Buffer.from(data.fileBase64, "base64");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const result = await uploadCandidateDocument(supabaseAdmin, {
      token: data.token,
      documentId: data.documentId,
      fileBuffer,
      fileName: data.fileName,
      mimeType: data.mimeType,
    });

    return result;
  });

/**
 * Staff Action: Reviews an uploaded onboarding document.
 * Decision: 'VERIFIED' or 'REJECTED' (rejection requires non-empty reviewNotes).
 */
export const reviewOnboardingDocumentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      onboardingId: string;
      documentId: string;
      decision: "VERIFIED" | "REJECTED";
      reviewNotes?: string | null;
    }) =>
      z
        .object({
          onboardingId: z.string().uuid(),
          documentId: z.string().uuid(),
          decision: z.enum(["VERIFIED", "REJECTED"]),
          reviewNotes: z.string().nullable().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!context.userId) {
      throw new Error("Unauthorized: reviewer identification required.");
    }

    const updatedDoc = await reviewOnboardingDocument(context.supabase, {
      onboardingId: data.onboardingId,
      documentId: data.documentId,
      decision: data.decision,
      reviewNotes: data.reviewNotes ?? null,
      reviewerId: context.userId,
    });

    return { success: true, document: updatedDoc };
  });

/**
 * Staff Action: Server-Side Completion Gate.
 * Verifies all required documents are VERIFIED, then transitions IN_PROGRESS -> COMPLETED.
 */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { onboardingId: string }) =>
    z.object({ onboardingId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const completed = await completeOnboardingAtomic(context.supabase, {
      onboardingId: data.onboardingId,
      actorId: context.userId ?? null,
    });

    return { onboarding: completed };
  });

/**
 * Staff Action: Cancels an active onboarding record.
 */
export const cancelOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { onboardingId: string; reason?: string }) =>
    z
      .object({
        onboardingId: z.string().uuid(),
        reason: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("onboarding")
      .update({
        status: "CANCELLED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.onboardingId)
      .in("status", ["NOT_STARTED", "IN_PROGRESS"])
      .select()
      .maybeSingle();

    if (error) throw new Error("Could not cancel onboarding.");
    if (!updated) {
      throw new Error("Cannot cancel onboarding: record is not currently active.");
    }

    await recordOnboardingEvent(context.supabase, {
      onboardingId: updated.id,
      candidateId: updated.candidate_id,
      eventType: "ONBOARDING_CANCELLED",
      notes: data.reason || "Onboarding cancelled by recruiter.",
      createdBy: context.userId ?? null,
    });

    return { cancelled: true, onboarding: updated };
  });
