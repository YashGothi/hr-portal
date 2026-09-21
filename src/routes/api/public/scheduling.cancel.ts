import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  loadAppointmentType,
  loadSettings,
  resolveInvite,
} from "@/lib/scheduling/availability.server";

const CancelInput = z.object({
  token: z.string().min(10).max(100),
  appointmentId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Public: POST /api/public/scheduling/cancel — releases the slot while
 * keeping the appointment record for history.
 */
export const Route = createFileRoute("/api/public/scheduling/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: z.infer<typeof CancelInput>;
        try {
          payload = CancelInput.parse(await request.json());
        } catch {
          return Response.json({ error: "Please check the request." }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const invite = await resolveInvite(supabaseAdmin, payload.token);
        if (!invite.ok) return Response.json({ error: invite.reason }, { status: 404 });

        const settings = await loadSettings(supabaseAdmin);
        if (!settings.allow_candidate_reschedule) {
          return Response.json(
            { error: "Please contact the team to change this appointment." },
            { status: 403 },
          );
        }

        const { data: appointment } = await supabaseAdmin
          .from("appointments")
          .select(
            "id, start_at, end_at, timezone, candidate_email, candidate_name, candidate_phone, meeting_url",
          )
          .eq("id", payload.appointmentId)
          .eq("candidate_id", invite.context.candidate.id)
          .eq("appointment_type", invite.context.appointmentType)
          .eq("status", "BOOKED")
          .maybeSingle();
        if (!appointment) {
          return Response.json(
            { error: "This appointment can no longer be changed." },
            { status: 404 },
          );
        }

        const { error } = await supabaseAdmin
          .from("appointments")
          .update({
            status: "CANCELLED",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: payload.reason ?? "Cancelled by candidate",
          })
          .eq("id", appointment.id)
          .eq("status", "BOOKED");
        if (error)
          return Response.json({ error: "We could not cancel the appointment." }, { status: 500 });

        if (invite.context.appointmentType === "INTERVIEW") {
          await supabaseAdmin
            .from("candidates")
            .update({
              interview_at: null,
              interview_confirmed_at: null,
              application_status: "interview_invited",
            })
            .eq("id", invite.context.candidate.id);
        }

        const type = await loadAppointmentType(supabaseAdmin, invite.context.appointmentType);
        const { notifyBooking } = await import("@/lib/scheduling/notify.server");
        await notifyBooking({
          appointmentId: appointment.id,
          appointmentTitle: type?.title ?? "Appointment",
          candidateName: appointment.candidate_name,
          candidateEmail: appointment.candidate_email,
          candidatePhone: appointment.candidate_phone,
          role: invite.context.jobTitle,
          startAt: appointment.start_at,
          endAt: appointment.end_at,
          timezone: appointment.timezone,
          meetingUrl: appointment.meeting_url,
          cancelled: true,
        });

        return Response.json({ cancelled: true });
      },
    },
  },
});
