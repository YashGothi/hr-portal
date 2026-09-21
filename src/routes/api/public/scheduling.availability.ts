import { createFileRoute } from "@tanstack/react-router";
import {
  availabilityForDay,
  availableDatesInRange,
  loadAppointmentType,
  loadSettings,
  resolveInvite,
} from "@/lib/scheduling/availability.server";
import { bookingHorizonDateKey, parseDateKey, zonedDateKey } from "@/lib/scheduling/core";

/**
 * Public: GET /api/public/scheduling/availability
 * Params: token, date (YYYY-MM-DD), optional month (YYYY-MM), optional timezone.
 * Availability is always recomputed on the server.
 */
export const Route = createFileRoute("/api/public/scheduling/availability")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        const date = url.searchParams.get("date") ?? "";
        const month = url.searchParams.get("month");
        const rescheduleId = url.searchParams.get("rescheduleId");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const invite = await resolveInvite(supabaseAdmin, token);
        if (!invite.ok) return Response.json({ error: invite.reason }, { status: 404 });

        const type = await loadAppointmentType(supabaseAdmin, invite.context.appointmentType);
        if (!type || !type.active) {
          return Response.json(
            { error: "This appointment type is not available." },
            { status: 404 },
          );
        }

        const settings = await loadSettings(supabaseAdmin);
        const todayKey = zonedDateKey(new Date(), settings.timezone);
        const horizonKey = bookingHorizonDateKey(settings);

        // A reschedule may reuse its own current slot.
        let excludeAppointmentId: string | null = null;
        if (rescheduleId) {
          const { data } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("id", rescheduleId)
            .eq("candidate_id", invite.context.candidate.id)
            .eq("status", "BOOKED")
            .maybeSingle();
          excludeAppointmentId = data?.id ?? null;
        }

        const day =
          date && parseDateKey(date) && date >= todayKey && date <= horizonKey
            ? await availabilityForDay(supabaseAdmin, {
                dateKey: date,
                appointmentType: invite.context.appointmentType,
                durationMinutes: type.duration_minutes,
                settings,
                excludeAppointmentId,
              })
            : null;

        let availableDates: string[] = [];
        if (month && /^\d{4}-\d{2}$/.test(month)) {
          const [yearPart, monthPart] = month.split("-");
          const year = Number(yearPart);
          const monthIndex = Number(monthPart);
          const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
          const from = `${month}-01` < todayKey ? todayKey : `${month}-01`;
          const to = `${month}-${String(lastDay).padStart(2, "0")}`;
          if (from <= to && from <= horizonKey) {
            availableDates = await availableDatesInRange(supabaseAdmin, {
              fromDateKey: from,
              toDateKey: to > horizonKey ? horizonKey : to,
              durationMinutes: type.duration_minutes,
              settings,
              excludeAppointmentId,
            });
          }
        }

        return Response.json({
          date: day?.date ?? date,
          timezone: settings.timezone,
          appointmentType: invite.context.appointmentType,
          durationMinutes: type.duration_minutes,
          slots: day?.slots ?? [],
          availableDates,
          today: todayKey,
          maxDate: horizonKey,
          workingDays: settings.working_days,
        });
      },
    },
  },
});
