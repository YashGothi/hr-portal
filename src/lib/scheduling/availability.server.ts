/**
 * Server-only scheduling data access. The backend is the single source of
 * truth for availability — nothing here trusts client input.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { INTERVIEW_ELIGIBLE_STATUSES, SHORTLIST_THRESHOLD } from "@/lib/ats/weights";
import {
  DEFAULT_TIMEZONE,
  type AppointmentType,
  type BlockedTime,
  type BusyInterval,
  type SchedulingSettings,
  generateSlots,
  parseDateKey,
  validateRequestedSlot,
  zonedWallToUtc,
} from "./core";

type Admin = SupabaseClient<Database>;

export const FALLBACK_SETTINGS: SchedulingSettings = {
  timezone: DEFAULT_TIMEZONE,
  working_days: [1, 2, 3, 4, 5],
  work_start: "11:00:00",
  work_end: "18:00:00",
  break_start: "13:00:00",
  break_end: "14:00:00",
  allow_candidate_reschedule: true,
  min_notice_minutes: 60,
  booking_horizon_days: 30,
  default_meeting_url: null,
  interviewer_name: null,
};

export async function loadSettings(admin: Admin): Promise<SchedulingSettings> {
  const { data } = await admin
    .from("scheduling_settings")
    .select(
      "timezone, working_days, work_start, work_end, break_start, break_end, allow_candidate_reschedule, min_notice_minutes, booking_horizon_days, default_meeting_url, interviewer_name",
    )
    .eq("id", true)
    .maybeSingle();
  if (!data) return FALLBACK_SETTINGS;
  return {
    ...FALLBACK_SETTINGS,
    ...data,
    working_days: (data.working_days ?? FALLBACK_SETTINGS.working_days).map(Number),
  } as SchedulingSettings;
}

export async function loadAppointmentType(admin: Admin, code: AppointmentType) {
  const { data } = await admin
    .from("appointment_types")
    .select("code, title, description, duration_minutes, active")
    .eq("code", code)
    .maybeSingle();
  return data ?? null;
}

export async function loadBlocks(
  admin: Admin,
  fromDate: string,
  toDate: string,
): Promise<BlockedTime[]> {
  const { data } = await admin
    .from("hr_blocked_times")
    .select("block_date, all_day, start_time, end_time")
    .gte("block_date", fromDate)
    .lte("block_date", toDate);
  return (data ?? []) as BlockedTime[];
}

/**
 * Live appointments overlapping the window. Only start/end are read — a
 * candidate must never learn who occupies a slot.
 */
export async function loadBusy(
  admin: Admin,
  fromMs: number,
  toMs: number,
  excludeAppointmentId?: string | null,
): Promise<BusyInterval[]> {
  let query = admin
    .from("appointments")
    .select("id, start_at, end_at")
    .eq("status", "BOOKED")
    .lt("start_at", new Date(toMs).toISOString())
    .gt("end_at", new Date(fromMs).toISOString());
  if (excludeAppointmentId) query = query.neq("id", excludeAppointmentId);
  const { data } = await query;
  return (data ?? []).map((row) => ({
    startMs: new Date(row.start_at).getTime(),
    endMs: new Date(row.end_at).getTime(),
  }));
}

function dayBoundsMs(dateKey: string, timezone: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const start = zonedWallToUtc(parsed.year, parsed.month, parsed.day, 0, timezone).getTime();
  return { startMs: start, endMs: start + 36 * 3600000 };
}

export type DayAvailability = {
  date: string;
  timezone: string;
  appointmentType: AppointmentType;
  durationMinutes: number;
  slots: { start: string; end: string; available: true }[];
};

export async function availabilityForDay(
  admin: Admin,
  options: {
    dateKey: string;
    appointmentType: AppointmentType;
    durationMinutes: number;
    settings: SchedulingSettings;
    excludeAppointmentId?: string | null;
  },
): Promise<DayAvailability> {
  const { dateKey, appointmentType, durationMinutes, settings } = options;
  const bounds = dayBoundsMs(dateKey, settings.timezone);
  const blocks = bounds ? await loadBlocks(admin, dateKey, dateKey) : [];
  const busy = bounds
    ? await loadBusy(admin, bounds.startMs, bounds.endMs, options.excludeAppointmentId)
    : [];

  const slots = generateSlots({
    dateKey,
    durationMinutes,
    settings,
    blocks,
    busy,
    nowMs: Date.now(),
  });

  return {
    date: dateKey,
    timezone: settings.timezone,
    appointmentType,
    durationMinutes,
    slots: slots.map((slot) => ({ start: slot.start, end: slot.end, available: true })),
  };
}

/** Which dates in a month have at least one slot — powers calendar disabling. */
export async function availableDatesInRange(
  admin: Admin,
  options: {
    fromDateKey: string;
    toDateKey: string;
    durationMinutes: number;
    settings: SchedulingSettings;
    excludeAppointmentId?: string | null;
  },
): Promise<string[]> {
  const { fromDateKey, toDateKey, durationMinutes, settings } = options;
  const from = parseDateKey(fromDateKey);
  const to = parseDateKey(toDateKey);
  if (!from || !to) return [];

  const blocks = await loadBlocks(admin, fromDateKey, toDateKey);
  const fromMs = zonedWallToUtc(from.year, from.month, from.day, 0, settings.timezone).getTime();
  const toMs =
    zonedWallToUtc(to.year, to.month, to.day, 0, settings.timezone).getTime() + 36 * 3600000;
  const busy = await loadBusy(admin, fromMs, toMs, options.excludeAppointmentId);

  const dates: string[] = [];
  const cursor = new Date(Date.UTC(from.year, from.month - 1, from.day));
  const last = Date.UTC(to.year, to.month - 1, to.day);
  const nowMs = Date.now();

  while (cursor.getTime() <= last) {
    const dateKey = cursor.toISOString().slice(0, 10);
    const slots = generateSlots({ dateKey, durationMinutes, settings, blocks, busy, nowMs });
    if (slots.length > 0) dates.push(dateKey);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export type SlotCheck =
  { ok: false; reason: string } | { ok: true; startAt: string; endAt: string };

/** Recomputes availability from scratch and confirms the requested start. */
export async function checkSlot(
  admin: Admin,
  options: {
    startIso: string;
    durationMinutes: number;
    settings: SchedulingSettings;
    excludeAppointmentId?: string | null;
  },
): Promise<SlotCheck> {
  const { startIso, durationMinutes, settings } = options;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "That time is not a valid slot." };

  const fromMs = start.getTime() - 24 * 3600000;
  const toMs = start.getTime() + 24 * 3600000;
  const fromKey = new Date(fromMs).toISOString().slice(0, 10);
  const toKey = new Date(toMs).toISOString().slice(0, 10);

  const blocks = await loadBlocks(admin, fromKey, toKey);
  const busy = await loadBusy(admin, fromMs, toMs, options.excludeAppointmentId);

  const result = validateRequestedSlot(startIso, {
    durationMinutes,
    settings,
    blocks,
    busy,
    nowMs: Date.now(),
  });
  if (!result.ok) return result;

  return {
    ok: true,
    startAt: new Date(result.startMs).toISOString(),
    endAt: new Date(result.endMs).toISOString(),
  };
}

export type InviteContext = {
  inviteId: string;
  appointmentType: AppointmentType;
  candidate: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    application_code: string | null;
    job_id: string | null;
    stage: string | null;
    ats_score?: number | null;
    application_status: string;
  };
  jobTitle: string | null;
};

/** Resolves a candidate scheduling token. Never leaks why a token failed. */
export async function resolveInvite(
  admin: Admin,
  token: string,
): Promise<{ ok: false; reason: string } | { ok: true; context: InviteContext }> {
  if (!/^[0-9a-f-]{36}$/i.test(token))
    return { ok: false, reason: "This scheduling link is not valid." };

  const { data: invite } = await admin
    .from("scheduling_invites")
    .select("id, candidate_id, appointment_type, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.revoked_at)
    return { ok: false, reason: "This scheduling link is not valid." };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "This scheduling link has expired." };
  }

  const { data: candidate } = await admin
    .from("candidates")
    .select(
      "id, full_name, email, phone, application_code, job_id, stage, ats_score, application_status",
    )
    .eq("id", invite.candidate_id)
    .maybeSingle();
  if (!candidate) return { ok: false, reason: "This scheduling link is not valid." };

  // Interview scheduling is only open to applicants the backend shortlisted.
  if (invite.appointment_type === "INTERVIEW") {
    const eligible =
      (candidate.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
      (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(candidate.application_status);
    if (!eligible) {
      return { ok: false, reason: "Interview scheduling is not available for this application." };
    }
  }

  let jobTitle: string | null = null;
  if (candidate.job_id) {
    const { data: job } = await admin
      .from("jobs")
      .select("title")
      .eq("id", candidate.job_id)
      .maybeSingle();
    jobTitle = job?.title ?? null;
  }

  return {
    ok: true,
    context: {
      inviteId: invite.id,
      appointmentType: invite.appointment_type as AppointmentType,
      candidate,
      jobTitle,
    },
  };
}
