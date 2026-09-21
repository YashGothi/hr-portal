import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppointmentType } from "@/lib/scheduling/core";
import { INTERVIEW_ELIGIBLE_STATUSES, SHORTLIST_THRESHOLD } from "@/lib/ats/weights";

/**
 * HR-side scheduling actions. Every function is authenticated; availability is
 * recomputed on the server with the same engine the candidate pages use.
 */

const TypeEnum = z.enum(["SCREENING", "INTERVIEW"]);

/** Creates (or returns) the secure scheduling link for a candidate + type. */
export const ensureSchedulingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        candidateId: z.string().uuid(),
        appointmentType: TypeEnum,
        expiresInDays: z.number().int().min(1).max(365).optional(),
        regenerate: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select("id, full_name, email, ats_score, application_status")
      .eq("id", data.candidateId)
      .single();
    if (error || !candidate) throw new Error("Candidate not found");

    if (data.appointmentType === "INTERVIEW") {
      const eligible =
        (candidate.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
        (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(candidate.application_status);
      if (!eligible) {
        throw new Error("Interview invitations are only available for shortlisted applicants.");
      }
    }

    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86400000).toISOString()
      : null;

    const { data: existing } = await context.supabase
      .from("scheduling_invites")
      .select("id, token, expires_at, revoked_at")
      .eq("candidate_id", data.candidateId)
      .eq("appointment_type", data.appointmentType)
      .maybeSingle();

    if (existing && !data.regenerate) {
      if (
        existing.revoked_at ||
        (existing.expires_at && new Date(existing.expires_at) < new Date())
      ) {
        const { data: revived, error: reviveError } = await context.supabase
          .from("scheduling_invites")
          .update({ revoked_at: null, expires_at: expiresAt })
          .eq("id", existing.id)
          .select("token")
          .single();
        if (reviveError) {
          throw new Error(`Could not refresh the scheduling link: ${reviveError.message}`);
        }
        return { token: revived.token, appointmentType: data.appointmentType };
      }
      return { token: existing.token, appointmentType: data.appointmentType };
    }

    if (existing) {
      const { data: rotated, error: rotateError } = await context.supabase
        .from("scheduling_invites")
        .update({ token: crypto.randomUUID(), revoked_at: null, expires_at: expiresAt })
        .eq("id", existing.id)
        .select("token")
        .single();
      if (rotateError) {
        throw new Error(`Could not refresh the scheduling link: ${rotateError.message}`);
      }
      return { token: rotated.token, appointmentType: data.appointmentType };
    }

    const { data: created, error: createError } = await context.supabase
      .from("scheduling_invites")
      .insert({
        candidate_id: data.candidateId,
        appointment_type: data.appointmentType,
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("token")
      .single();
    if (createError || !created) {
      throw new Error(
        `Could not create the scheduling link${createError?.message ? `: ${createError.message}` : ""}`,
      );
    }
    return { token: created.token, appointmentType: data.appointmentType };
  });

/** Slots HR can pick from when booking or moving an appointment. */
export const hrAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        appointmentType: TypeEnum,
        excludeAppointmentId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { availabilityForDay, loadAppointmentType, loadSettings } =
      await import("@/lib/scheduling/availability.server");
    const settings = await loadSettings(supabaseAdmin);
    const type = await loadAppointmentType(supabaseAdmin, data.appointmentType);
    if (!type) throw new Error("Unknown appointment type");
    return availabilityForDay(supabaseAdmin, {
      dateKey: data.date,
      appointmentType: data.appointmentType,
      durationMinutes: type.duration_minutes,
      settings,
      excludeAppointmentId: data.excludeAppointmentId ?? null,
    });
  });

export type BookResult =
  | {
      ok: true;
      appointmentId: string;
      startAt: string;
      endAt: string;
      emailDelivered: boolean;
      stage?: string;
      applicationStatus?: string;
      statusLabel?: string;
    }
  | { ok: false; error: string };

/** HR books or moves an appointment on the candidate's behalf. */
export const hrBookAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        candidateId: z.string().uuid(),
        appointmentType: TypeEnum,
        startTime: z.string().min(10).max(64),
        meetingUrl: z.string().trim().max(500).optional(),
        notes: z.string().trim().max(1000).optional(),
        rescheduleAppointmentId: z.string().uuid().optional(),
        notify: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<BookResult> => {
    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select(
        "id, full_name, email, phone, job_id, application_code, applied_role, stage, ats_score, application_status",
      )
      .eq("id", data.candidateId)
      .single();
    if (error || !candidate) return { ok: false, error: "Candidate not found." };
    if (!candidate.email) return { ok: false, error: "This candidate has no email address." };

    if (data.appointmentType === "INTERVIEW") {
      const eligible =
        (candidate.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
        (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(candidate.application_status);
      if (!eligible) {
        return {
          ok: false,
          error: "Interview appointments are only available for shortlisted applicants.",
        };
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkSlot, loadAppointmentType, loadSettings } =
      await import("@/lib/scheduling/availability.server");

    const settings = await loadSettings(supabaseAdmin);
    const type = await loadAppointmentType(supabaseAdmin, data.appointmentType);
    if (!type || !type.active)
      return { ok: false, error: "This appointment type is not available." };

    let previousId: string | null = null;
    if (data.rescheduleAppointmentId) {
      const { data: previous } = await context.supabase
        .from("appointments")
        .select("id")
        .eq("id", data.rescheduleAppointmentId)
        .eq("candidate_id", data.candidateId)
        .eq("status", "BOOKED")
        .maybeSingle();
      if (!previous) return { ok: false, error: "That appointment can no longer be changed." };
      previousId = previous.id;
    }

    const slot = await checkSlot(supabaseAdmin, {
      startIso: data.startTime,
      durationMinutes: type.duration_minutes,
      settings,
      excludeAppointmentId: previousId,
    });
    if (!slot.ok) return { ok: false, error: slot.reason };

    const { data: created, error: insertError } = await context.supabase
      .from("appointments")
      .insert({
        candidate_id: candidate.id,
        job_id: candidate.job_id,
        application_code: candidate.application_code,
        candidate_name: candidate.full_name,
        candidate_email: candidate.email,
        candidate_phone: candidate.phone,
        appointment_type: data.appointmentType,
        duration_minutes: type.duration_minutes,
        start_at: slot.startAt,
        end_at: slot.endAt,
        timezone: settings.timezone,
        status: "BOOKED",
        meeting_url: data.meetingUrl?.trim() || settings.default_meeting_url,
        interviewer: settings.interviewer_name,
        notes: data.notes ?? null,
        booked_by: "hr",
        rescheduled_from: previousId,
      })
      .select("id, start_at, end_at, timezone, meeting_url, interviewer")
      .single();

    if (insertError || !created) {
      const conflict = insertError?.code === "23P01";
      return {
        ok: false,
        error: conflict
          ? "That slot was just taken. Please pick another time."
          : "Could not create the appointment.",
      };
    }

    if (previousId) {
      await context.supabase
        .from("appointments")
        .update({ status: "RESCHEDULED", rescheduled_to: created.id })
        .eq("id", previousId);
    }

    if (data.appointmentType === "INTERVIEW") {
      await context.supabase
        .from("candidates")
        .update({
          interview_at: created.start_at,
          interviewer: created.interviewer,
          interview_location: created.meeting_url,
          stage: "interview",
          application_status: "interview_scheduled",
        })
        .eq("id", candidate.id);

      if (candidate.stage !== "interview") {
        await context.supabase.from("stage_history").insert({
          candidate_id: candidate.id,
          from_stage: candidate.stage ?? null,
          to_stage: "interview",
          changed_by: context.userId ?? null,
        });
      }
    }

    let emailDelivered = false;
    if (data.notify !== false) {
      const { notifyBooking } = await import("@/lib/scheduling/notify.server");
      const notified = await notifyBooking({
        appointmentId: created.id,
        appointmentTitle: type.title,
        candidateName: candidate.full_name,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        role: candidate.applied_role,
        startAt: created.start_at,
        endAt: created.end_at,
        timezone: created.timezone,
        meetingUrl: created.meeting_url,
        interviewer: created.interviewer,
      });
      emailDelivered = notified.candidateNotified;
      await context.supabase
        .from("appointments")
        .update({
          candidate_notified: notified.candidateNotified,
          hr_notified: notified.hrNotified,
        })
        .eq("id", created.id);
    }

    return {
      ok: true,
      appointmentId: created.id,
      startAt: created.start_at,
      endAt: created.end_at,
      emailDelivered,
      ...(data.appointmentType === "INTERVIEW"
        ? {
            stage: "interview",
            applicationStatus: "interview_scheduled",
            statusLabel: "Interview Sent",
          }
        : {
            ...(candidate.stage ? { stage: candidate.stage } : {}),
            applicationStatus: candidate.application_status,
          }),
    };
  });

/** Cancels an appointment, keeping the record and releasing the slot. */
export const hrCancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        appointmentId: z.string().uuid(),
        reason: z.string().trim().max(500).optional(),
        notify: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: appointment, error } = await context.supabase
      .from("appointments")
      .select(
        "id, candidate_id, appointment_type, candidate_name, candidate_email, candidate_phone, start_at, end_at, timezone, meeting_url",
      )
      .eq("id", data.appointmentId)
      .single();
    if (error || !appointment) throw new Error("Appointment not found");

    const { error: updateError } = await context.supabase
      .from("appointments")
      .update({
        status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: data.reason ?? "Cancelled by the talent acquisition team",
      })
      .eq("id", appointment.id)
      .eq("status", "BOOKED");
    if (updateError) throw new Error("Could not cancel the appointment");

    let role: string | null = null;
    if (appointment.candidate_id) {
      const { data: candidate } = await context.supabase
        .from("candidates")
        .select("applied_role")
        .eq("id", appointment.candidate_id)
        .maybeSingle();
      role = candidate?.applied_role ?? null;
    }

    if (appointment.appointment_type === "INTERVIEW") {
      await context.supabase
        .from("candidates")
        .update({ interview_at: null, interview_confirmed_at: null })
        .eq("id", appointment.candidate_id);
    }

    if (data.notify !== false) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { loadAppointmentType } = await import("@/lib/scheduling/availability.server");
      const type = await loadAppointmentType(
        supabaseAdmin,
        appointment.appointment_type as AppointmentType,
      );
      const { notifyBooking } = await import("@/lib/scheduling/notify.server");
      await notifyBooking({
        appointmentId: appointment.id,
        appointmentTitle: type?.title ?? "Appointment",
        candidateName: appointment.candidate_name,
        candidateEmail: appointment.candidate_email,
        candidatePhone: appointment.candidate_phone,
        role,
        startAt: appointment.start_at,
        endAt: appointment.end_at,
        timezone: appointment.timezone,
        meetingUrl: appointment.meeting_url,
        cancelled: true,
      });
    }

    return { cancelled: true };
  });

/** Marks an active booked appointment as completed by the recruiter. */
export const hrCompleteAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        appointmentId: z.string().uuid(),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: appointment, error } = await context.supabase
      .from("appointments")
      .select("id, candidate_id, appointment_type, status")
      .eq("id", data.appointmentId)
      .single();
    if (error || !appointment) throw new Error("Appointment not found");
    if (appointment.status !== "BOOKED") {
      throw new Error("Only booked appointments can be marked as completed");
    }

    const { error: updateError } = await context.supabase
      .from("appointments")
      .update({
        status: "COMPLETED",
        ...(data.notes ? { notes: data.notes } : {}),
      })
      .eq("id", appointment.id)
      .eq("status", "BOOKED");
    if (updateError) throw new Error("Could not complete the appointment");

    if (appointment.appointment_type === "INTERVIEW") {
      await context.supabase
        .from("candidates")
        .update({
          application_status: "interview_completed",
        })
        .eq("id", appointment.candidate_id);
    }

    return { completed: true, appointmentId: appointment.id };
  });

/** Prepares and dispatches an interview invitation email to a shortlisted candidate. */
export const sendInterviewInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        candidateId: z.string().uuid(),
        origin: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select(
        "id, full_name, email, applied_role, job_id, ats_score, application_status, interview_invited_at",
      )
      .eq("id", data.candidateId)
      .single();
    if (error || !candidate) throw new Error("Candidate not found");
    if (!candidate.email) throw new Error("This candidate has no email address.");

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

    const origin = data.origin || process.env["APP_URL"] || "https://hr.seceon.com";
    const schedulingUrl = `${origin}/schedule/${token}?type=interview`;

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    let sent = false;
    let reason: string | undefined;

    try {
      const result = await sendTemplateEmail("interview-invitation", candidate.email, {
        templateData: {
          candidateName: candidate.full_name,
          role: jobTitle ?? "the position",
          schedulingUrl,
        },
        idempotencyKey: `invite-${candidate.id}-${token}`,
        replyTo: "hr.apac@seceon.com",
      });
      sent = result.sent;
      if (!result.sent) reason = result.reason;
    } catch (cause) {
      reason = cause instanceof Error ? cause.message : "Email delivery is not available.";
    }

    const nowIso = new Date().toISOString();
    await context.supabase
      .from("candidates")
      .update({
        interview_email_sent_at: sent ? nowIso : null,
        interview_email_status: sent ? "sent" : "failed",
        interview_invited_at: candidate.interview_invited_at ?? nowIso,
        application_status: "interview_invited",
      })
      .eq("id", candidate.id);

    return {
      sent,
      token,
      schedulingUrl,
      ...(reason ? { reason } : {}),
    };
  });

/** Re-sends the confirmation email for a booked appointment. */
export const hrResendSchedulingEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ appointmentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: appointment, error } = await context.supabase
      .from("appointments")
      .select(
        "id, appointment_type, candidate_name, candidate_email, candidate_phone, start_at, end_at, timezone, meeting_url, interviewer, status",
      )
      .eq("id", data.appointmentId)
      .single();
    if (error || !appointment) throw new Error("Appointment not found");
    if (appointment.status !== "BOOKED") throw new Error("This appointment is no longer booked");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAppointmentType } = await import("@/lib/scheduling/availability.server");
    const type = await loadAppointmentType(
      supabaseAdmin,
      appointment.appointment_type as AppointmentType,
    );

    const { notifyBooking } = await import("@/lib/scheduling/notify.server");
    const notified = await notifyBooking({
      appointmentId: appointment.id,
      appointmentTitle: type?.title ?? "Appointment",
      candidateName: appointment.candidate_name,
      candidateEmail: appointment.candidate_email,
      candidatePhone: appointment.candidate_phone,
      role: null,
      startAt: appointment.start_at,
      endAt: appointment.end_at,
      timezone: appointment.timezone,
      meetingUrl: appointment.meeting_url,
      interviewer: appointment.interviewer,
      // A resend is a deliberate new send, so it must not be de-duplicated.
      keySuffix: `resend-${Date.now()}`,
    });

    await context.supabase
      .from("appointments")
      .update({
        candidate_notified: notified.candidateNotified,
        hr_notified: notified.hrNotified,
      })
      .eq("id", appointment.id);

    return {
      sent: notified.candidateNotified,
      ...(notified.reason ? { reason: notified.reason } : {}),
    };
  });
