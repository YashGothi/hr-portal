/**
 * Pure scheduling logic shared by the server (source of truth) and the UI.
 * No database, no browser APIs — safe to import anywhere.
 */

export const APPOINTMENT_TYPES = ["SCREENING", "INTERVIEW"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_STATUSES = [
  "BOOKED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
  "RESCHEDULED",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  BOOKED: "Scheduled",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No show",
  RESCHEDULED: "Rescheduled",
};

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type SchedulingSettings = {
  timezone: string;
  working_days: number[];
  work_start: string;
  work_end: string;
  break_start: string;
  break_end: string;
  allow_candidate_reschedule: boolean;
  min_notice_minutes: number;
  booking_horizon_days: number;
  default_meeting_url: string | null;
  interviewer_name: string | null;
};

export type BlockedTime = {
  block_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type BusyInterval = { startMs: number; endMs: number };

export type Slot = {
  /** ISO instant with the HR timezone offset, e.g. 2026-09-18T11:00:00+05:30 */
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  available: true;
};

/* ------------------------------------------------------------------ *
 * Timezone helpers (no dependencies — Intl is the source of offsets)
 * ------------------------------------------------------------------ */

function tzParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `timeZone` from UTC, in minutes, at the given instant (IST = +330). */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const p = tzParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Converts a wall-clock time in `timeZone` to the matching UTC instant. */
export function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  minutesOfDay: number,
  timeZone: string,
): Date {
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ms = guess - tzOffsetMinutes(new Date(guess), timeZone) * 60000;
  // Second pass settles DST boundaries for zones that observe it.
  ms = guess - tzOffsetMinutes(new Date(ms), timeZone) * 60000;
  return new Date(ms);
}

/** Wall-clock date parts (plus weekday 0-6) for an instant in `timeZone`. */
export function wallParts(instant: Date, timeZone: string) {
  const p = tzParts(instant, timeZone);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { ...p, weekday, minutesOfDay: p.hour * 60 + p.minute };
}

/** "2026-09-18" for an instant, in the given timezone. */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const p = tzParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Weekday (0 = Sunday) of a plain calendar date. */
export function dateKeyWeekday(dateKey: string): number | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

/** "11:00:00" or "11:00" -> minutes since midnight. */
export function timeToMinutes(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** ISO string carrying the zone offset, e.g. 2026-09-18T11:20:00+05:30 */
export function isoWithOffset(instant: Date, timeZone: string): string {
  const p = tzParts(instant, timeZone);
  const offset = tzOffsetMinutes(instant, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Formats an instant as a time in the given timezone, e.g. "3:20 PM". */
export function formatTimeIn(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
}

/** Formats an instant as a long date, e.g. "September 18, 2026". */
export function formatDateIn(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(instant));
}

/** Zones whose common abbreviation Intl reports only as a GMT offset. */
const ZONE_ABBREVIATIONS: Record<string, string> = {
  "Asia/Kolkata": "IST",
  "Asia/Calcutta": "IST",
  "Asia/Dubai": "GST",
};

/** Short zone name, e.g. "IST" — falls back to the identifier. */
export function timezoneAbbreviation(timeZone: string, instant: Date = new Date()): string {
  const known = ZONE_ABBREVIATIONS[timeZone];
  if (known) return known;
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/* ------------------------------------------------------------------ *
 * Availability
 * ------------------------------------------------------------------ */

export type BookableWindow = { startMin: number; endMin: number };

/**
 * The bookable windows of a working day: working hours minus the break.
 * Slots may never cross a window edge, so nothing can overlap lunch.
 */
export function bookableWindows(settings: SchedulingSettings): BookableWindow[] {
  const workStart = timeToMinutes(settings.work_start);
  const workEnd = timeToMinutes(settings.work_end);
  const breakStart = timeToMinutes(settings.break_start);
  const breakEnd = timeToMinutes(settings.break_end);

  if (workEnd <= workStart) return [];
  if (breakEnd <= breakStart || breakEnd <= workStart || breakStart >= workEnd) {
    return [{ startMin: workStart, endMin: workEnd }];
  }

  const windows: BookableWindow[] = [];
  if (breakStart > workStart)
    windows.push({ startMin: workStart, endMin: Math.min(breakStart, workEnd) });
  if (breakEnd < workEnd)
    windows.push({ startMin: Math.max(breakEnd, workStart), endMin: workEnd });
  return windows.filter((w) => w.endMin > w.startMin);
}

export function isWorkingDay(dateKey: string, settings: SchedulingSettings): boolean {
  const weekday = dateKeyWeekday(dateKey);
  if (weekday == null) return false;
  return settings.working_days.includes(weekday);
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type SlotInput = {
  dateKey: string;
  durationMinutes: number;
  settings: SchedulingSettings;
  blocks: BlockedTime[];
  busy: BusyInterval[];
  nowMs: number;
};

/**
 * Availability = working hours − lunch − blocked time − existing
 * appointments − past times, then chunked by appointment duration.
 */
export function generateSlots(input: SlotInput): Slot[] {
  const { dateKey, durationMinutes, settings, blocks, busy, nowMs } = input;
  const parsed = parseDateKey(dateKey);
  if (!parsed || durationMinutes <= 0) return [];
  if (!isWorkingDay(dateKey, settings)) return [];

  const tz = settings.timezone;
  const dayBlocks = blocks.filter((b) => b.block_date === dateKey);
  if (dayBlocks.some((b) => b.all_day)) return [];

  const earliestMs = nowMs + Math.max(0, settings.min_notice_minutes) * 60000;
  const slots: Slot[] = [];

  for (const window of bookableWindows(settings)) {
    for (
      let startMin = window.startMin;
      startMin + durationMinutes <= window.endMin;
      startMin += durationMinutes
    ) {
      const endMin = startMin + durationMinutes;

      const blocked = dayBlocks.some((b) =>
        b.start_time && b.end_time
          ? overlaps(startMin, endMin, timeToMinutes(b.start_time), timeToMinutes(b.end_time))
          : false,
      );
      if (blocked) continue;

      const start = zonedWallToUtc(parsed.year, parsed.month, parsed.day, startMin, tz);
      const end = zonedWallToUtc(parsed.year, parsed.month, parsed.day, endMin, tz);
      const startMs = start.getTime();
      const endMs = end.getTime();

      if (startMs < earliestMs) continue;
      if (busy.some((b) => overlaps(startMs, endMs, b.startMs, b.endMs))) continue;

      slots.push({
        start: isoWithOffset(start, tz),
        end: isoWithOffset(end, tz),
        startMs,
        endMs,
        available: true,
      });
    }
  }

  return slots.sort((a, b) => a.startMs - b.startMs);
}

export type ValidationFailure = { ok: false; reason: string };
export type ValidationSuccess = { ok: true; startMs: number; endMs: number };

/**
 * Server-side guard: a requested start instant must land exactly on a
 * generated slot. Availability sent by the client is never trusted.
 */
export function validateRequestedSlot(
  startIso: string,
  input: Omit<SlotInput, "dateKey"> & { dateKey?: string },
): ValidationFailure | ValidationSuccess {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "That time is not a valid slot." };

  const dateKey = zonedDateKey(start, input.settings.timezone);
  const slots = generateSlots({ ...input, dateKey });
  const match = slots.find((slot) => slot.startMs === start.getTime());
  if (!match) {
    return {
      ok: false,
      reason: "This time slot is no longer available. Please select another time.",
    };
  }
  return { ok: true, startMs: match.startMs, endMs: match.endMs };
}

/** Latest booking date candidates may pick. */
export function bookingHorizonDateKey(settings: SchedulingSettings, nowMs = Date.now()): string {
  const horizon = new Date(nowMs + Math.max(1, settings.booking_horizon_days) * 86400000);
  return zonedDateKey(horizon, settings.timezone);
}
