import { createFileRoute } from "@tanstack/react-router";
import {
  resolveInvite,
  loadAppointmentType,
  loadSettings,
} from "@/lib/scheduling/availability.server";

/**
 * Public: resolves a candidate scheduling token into the minimum context the
 * booking page needs. Never exposes HR calendar data or other candidates.
 */
export const Route = createFileRoute("/api/public/scheduling/invite")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const invite = await resolveInvite(supabaseAdmin, token);
        if (!invite.ok) {
          return Response.json(
            { error: invite.reason },
            { status: 404, headers: { "Cache-Control": "no-store" } },
          );
        }

        const { context } = invite;
        const type = await loadAppointmentType(supabaseAdmin, context.appointmentType);
        if (!type || !type.active) {
          return Response.json(
            { error: "This appointment type is not available." },
            { status: 404, headers: { "Cache-Control": "no-store" } },
          );
        }

        const settings = await loadSettings(supabaseAdmin);

        const { data: appointment } = await supabaseAdmin
          .from("appointments")
          .select(
            "id, appointment_type, start_at, end_at, timezone, status, meeting_url, interviewer, duration_minutes",
          )
          .eq("candidate_id", context.candidate.id)
          .eq("appointment_type", context.appointmentType)
          .eq("status", "BOOKED")
          .maybeSingle();

        return Response.json(
          {
            appointmentType: context.appointmentType,
            title: type.title,
            description: type.description,
            durationMinutes: type.duration_minutes,
            jobTitle: context.jobTitle,
            candidate: {
              fullName: context.candidate.full_name,
              email: context.candidate.email,
              phone: context.candidate.phone,
              applicationCode: context.candidate.application_code,
            },
            scheduling: {
              timezone: settings.timezone,
              workingDays: settings.working_days,
              allowReschedule: settings.allow_candidate_reschedule,
              bookingHorizonDays: settings.booking_horizon_days,
              interviewerName: settings.interviewer_name,
            },
            appointment: appointment ?? null,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
