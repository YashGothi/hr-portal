import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { notifyInterviewReminder } from "./notify.server";

type Admin = SupabaseClient<Database>;

export type UpcomingAppointment = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  job_id: string | null;
  appointment_type: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  timezone: string;
  meeting_url: string | null;
  interviewer: string | null;
  status: string;
  role?: string | null;
};

/**
 * Identifies booked interview appointments scheduled ~24 hours from reference time.
 * Filters strictly for active BOOKED appointments and excludes CANCELLED, COMPLETED, or RESCHEDULED.
 */
export async function getUpcomingAppointmentsForReminder(
  admin: Admin,
  now: Date = new Date(),
): Promise<UpcomingAppointment[]> {
  const fromIso = new Date(now.getTime() + 23 * 3600000).toISOString();
  const toIso = new Date(now.getTime() + 25 * 3600000).toISOString();

  const { data: appointments, error } = await admin
    .from("appointments")
    .select(
      "id, candidate_id, candidate_name, candidate_email, candidate_phone, job_id, appointment_type, start_at, end_at, duration_minutes, timezone, meeting_url, interviewer, status",
    )
    .eq("status", "BOOKED")
    .eq("appointment_type", "INTERVIEW")
    .gte("start_at", fromIso)
    .lte("start_at", toIso);

  if (error || !appointments) return [];

  const results: UpcomingAppointment[] = [];
  for (const appt of appointments) {
    let role: string | null = null;
    if (appt.job_id) {
      const { data: job } = await admin
        .from("jobs")
        .select("title")
        .eq("id", appt.job_id)
        .maybeSingle();
      role = job?.title ?? null;
    }
    results.push({ ...appt, role });
  }

  return results;
}

/**
 * Processes upcoming interview reminders, dispatching provider-agnostic reminders
 * with safe deduplication idempotency keys.
 */
export async function processUpcomingReminders(
  admin: Admin,
  now: Date = new Date(),
): Promise<{ processed: number; sent: number; failed: number }> {
  const upcoming = await getUpcomingAppointmentsForReminder(admin, now);

  let sent = 0;
  let failed = 0;

  for (const appt of upcoming) {
    const outcome = await notifyInterviewReminder({
      appointmentId: appt.id,
      appointmentTitle: "Interview Call",
      candidateName: appt.candidate_name,
      candidateEmail: appt.candidate_email,
      candidatePhone: appt.candidate_phone,
      role: appt.role ?? null,
      startAt: appt.start_at,
      endAt: appt.end_at,
      timezone: appt.timezone,
      durationMinutes: appt.duration_minutes,
      meetingUrl: appt.meeting_url,
      interviewer: appt.interviewer,
    });

    if (outcome.sent) {
      sent += 1;
      await admin.from("alerts").insert({
        candidate_id: appt.candidate_id,
        title: `Interview reminder: ${appt.candidate_name}`,
        body: `24-hour reminder email dispatched for interview on ${new Date(appt.start_at).toLocaleDateString()}.`,
        read: false,
      });
    } else {
      failed += 1;
    }
  }

  return { processed: upcoming.length, sent, failed };
}
