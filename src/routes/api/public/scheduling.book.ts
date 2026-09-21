import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkSlot,
  loadAppointmentType,
  loadSettings,
  resolveInvite,
} from "@/lib/scheduling/availability.server";

const BookInput = z.object({
  token: z.string().min(10).max(100),
  startTime: z.string().min(10).max(64),
  timezone: z.string().max(64).optional(),
  candidateName: z.string().trim().min(2).max(120),
  candidateEmail: z.string().trim().email().max(200),
  candidatePhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
  /** Present when the candidate is moving an existing appointment. */
  rescheduleAppointmentId: z.string().uuid().optional(),
});

const SLOT_TAKEN = "This time slot is no longer available. Please select another available time.";

/** Public: POST /api/public/scheduling/book */
export const Route = createFileRoute("/api/public/scheduling/book")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: z.infer<typeof BookInput>;
        try {
          payload = BookInput.parse(await request.json());
        } catch {
          return Response.json({ error: "Please check the details you entered." }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const invite = await resolveInvite(supabaseAdmin, payload.token);
        if (!invite.ok) return Response.json({ error: invite.reason }, { status: 404 });
        const { context } = invite;

        const type = await loadAppointmentType(supabaseAdmin, context.appointmentType);
        if (!type || !type.active) {
          return Response.json(
            { error: "This appointment type is not available." },
            { status: 404 },
          );
        }
        const settings = await loadSettings(supabaseAdmin);

        // Reschedule: the old appointment is only released after the new one
        // is confirmed, so an abandoned reschedule loses nothing.
        let previous: { id: string } | null = null;
        if (payload.rescheduleAppointmentId) {
          if (!settings.allow_candidate_reschedule) {
            return Response.json(
              { error: "Rescheduling is not available. Please contact the team." },
              { status: 403 },
            );
          }
          const { data } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("id", payload.rescheduleAppointmentId)
            .eq("candidate_id", context.candidate.id)
            .eq("appointment_type", context.appointmentType)
            .eq("status", "BOOKED")
            .maybeSingle();
          if (!data)
            return Response.json(
              { error: "This appointment can no longer be changed." },
              { status: 404 },
            );
          previous = data;
        } else {
          const { data: existing } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("candidate_id", context.candidate.id)
            .eq("appointment_type", context.appointmentType)
            .eq("status", "BOOKED")
            .maybeSingle();
          if (existing) {
            return Response.json(
              {
                error:
                  "You already have this appointment booked. Please use the reschedule option.",
              },
              { status: 409 },
            );
          }
        }

        // Independent server-side validation: working hours, lunch, blocked
        // time, duration, past times and existing appointments.
        const slot = await checkSlot(supabaseAdmin, {
          startIso: payload.startTime,
          durationMinutes: type.duration_minutes,
          settings,
          excludeAppointmentId: previous?.id ?? null,
        });
        if (!slot.ok) return Response.json({ error: slot.reason }, { status: 409 });

        const { data: created, error } = await supabaseAdmin
          .from("appointments")
          .insert({
            candidate_id: context.candidate.id,
            job_id: context.candidate.job_id,
            application_code: context.candidate.application_code,
            candidate_name: payload.candidateName,
            candidate_email: payload.candidateEmail,
            candidate_phone: payload.candidatePhone ?? context.candidate.phone,
            appointment_type: context.appointmentType,
            duration_minutes: type.duration_minutes,
            start_at: slot.startAt,
            end_at: slot.endAt,
            timezone: settings.timezone,
            status: "BOOKED",
            meeting_url: settings.default_meeting_url,
            interviewer: settings.interviewer_name,
            notes: payload.notes ?? null,
            booked_by: "candidate",
            rescheduled_from: previous?.id ?? null,
          })
          .select("id, start_at, end_at, timezone, meeting_url, interviewer, duration_minutes")
          .single();

        if (error || !created) {
          // 23P01 = the database-level overlap guard rejected a concurrent booking.
          const status = error?.code === "23P01" ? 409 : 500;
          return Response.json(
            {
              error:
                status === 409
                  ? SLOT_TAKEN
                  : "We could not complete the booking. Please try again.",
            },
            { status },
          );
        }

        if (previous) {
          await supabaseAdmin
            .from("appointments")
            .update({ status: "RESCHEDULED", rescheduled_to: created.id })
            .eq("id", previous.id);
        }

        await supabaseAdmin
          .from("scheduling_invites")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", context.inviteId);

        // Keep the existing pipeline in step with the booking.
        if (context.appointmentType === "INTERVIEW") {
          await supabaseAdmin
            .from("candidates")
            .update({
              interview_at: created.start_at,
              interviewer: created.interviewer,
              interview_location: created.meeting_url,
              stage: "interview",
              application_status: "interview_scheduled",
            })
            .eq("id", context.candidate.id);

          if (context.candidate.stage !== "interview") {
            await supabaseAdmin.from("stage_history").insert({
              candidate_id: context.candidate.id,
              from_stage: context.candidate.stage ?? null,
              to_stage: "interview",
            });
          }
        }

        const { notifyBooking } = await import("@/lib/scheduling/notify.server");
        const notified = await notifyBooking({
          appointmentId: created.id,
          appointmentTitle: type.title,
          candidateName: payload.candidateName,
          candidateEmail: payload.candidateEmail,
          candidatePhone: payload.candidatePhone ?? context.candidate.phone,
          role: context.jobTitle,
          startAt: created.start_at,
          endAt: created.end_at,
          timezone: created.timezone,
          durationMinutes: created.duration_minutes,
          meetingUrl: created.meeting_url,
          interviewer: created.interviewer,
        });

        await supabaseAdmin
          .from("appointments")
          .update({
            candidate_notified: notified.candidateNotified,
            hr_notified: notified.hrNotified,
          })
          .eq("id", created.id);

        await supabaseAdmin.from("alerts").insert({
          candidate_id: context.candidate.id,
          title: `Interview scheduled: ${payload.candidateName}`,
          body: `${payload.candidateName} scheduled an interview for ${context.jobTitle ?? "the opening"} on ${new Date(created.start_at).toLocaleDateString()}.`,
          read: false,
        });

        return Response.json({
          appointmentId: created.id,
          appointmentType: context.appointmentType,
          title: type.title,
          durationMinutes: created.duration_minutes,
          startAt: created.start_at,
          endAt: created.end_at,
          timezone: created.timezone,
          meetingUrl: created.meeting_url,
          interviewer: created.interviewer,
          jobTitle: context.jobTitle,
          candidateName: payload.candidateName,
          emailDelivered: notified.candidateNotified,
          stage: context.appointmentType === "INTERVIEW" ? "interview" : context.candidate.stage,
          applicationStatus:
            context.appointmentType === "INTERVIEW"
              ? "interview_scheduled"
              : context.candidate.application_status,
          statusLabel: context.appointmentType === "INTERVIEW" ? "Interview Sent" : undefined,
        });
      },
    },
  },
});
