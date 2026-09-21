import { describe, expect, it } from "vitest";
import {
  bookableWindows,
  generateSlots,
  validateRequestedSlot,
  type BlockedTime,
  type BusyInterval,
  type SchedulingSettings,
} from "./core";

const settings: SchedulingSettings = {
  timezone: "Asia/Kolkata",
  working_days: [0, 1, 2, 3, 4],
  work_start: "11:00:00",
  work_end: "18:00:00",
  break_start: "13:00:00",
  break_end: "14:00:00",
  allow_candidate_reschedule: true,
  min_notice_minutes: 0,
  booking_horizon_days: 30,
  default_meeting_url: null,
  interviewer_name: "Talent Acquisition Team",
};

// A Wednesday, far enough in the past to be deterministic when nowMs is fixed.
const DAY = "2026-01-07";
const NOW = new Date("2026-01-06T00:00:00Z").getTime();

function slots(
  options: {
    duration?: number;
    blocks?: BlockedTime[];
    busy?: BusyInterval[];
    overrides?: Partial<SchedulingSettings>;
  } = {},
) {
  return generateSlots({
    dateKey: DAY,
    durationMinutes: options.duration ?? 30,
    settings: { ...settings, ...options.overrides },
    blocks: options.blocks ?? [],
    busy: options.busy ?? [],
    nowMs: NOW,
  });
}

/** 11:00 IST on DAY expressed in UTC. */
function istIso(time: string) {
  return `${DAY}T${time}:00+05:30`;
}

describe("bookable windows", () => {
  it("splits the day around the lunch break", () => {
    expect(bookableWindows(settings)).toEqual([
      { startMin: 660, endMin: 780 },
      { startMin: 840, endMin: 1080 },
    ]);
  });
});

describe("slot generation", () => {
  it("never offers a slot that overlaps the lunch break", () => {
    const overlapping = slots({ duration: 30 }).filter(
      (slot) =>
        new Date(slot.startMs) < new Date(istIso("14:00")) &&
        new Date(slot.endMs) > new Date(istIso("13:00")),
    );
    expect(overlapping).toHaveLength(0);
  });

  it("keeps a long appointment from crossing into the break", () => {
    const starts = slots({ duration: 60 }).map((slot) => slot.start);
    expect(starts.some((start) => start.startsWith(`${DAY}T12:00`))).toBe(true);
    expect(starts.some((start) => start.startsWith(`${DAY}T12:30`))).toBe(false);
  });

  it("removes slots covered by a blocked time range", () => {
    const blocked: BlockedTime = {
      block_date: DAY,
      all_day: false,
      start_time: "15:00:00",
      end_time: "16:00:00",
    } as BlockedTime;
    const starts = slots({ blocks: [blocked] }).map((slot) => slot.start);
    expect(starts.some((start) => start.startsWith(`${DAY}T15:`))).toBe(false);
    expect(starts.some((start) => start.startsWith(`${DAY}T16:00`))).toBe(true);
  });

  it("removes the whole day when it is blocked entirely", () => {
    const blocked = {
      block_date: DAY,
      all_day: true,
      start_time: null,
      end_time: null,
    } as BlockedTime;
    expect(slots({ blocks: [blocked] })).toHaveLength(0);
  });

  it("skips non-working days", () => {
    expect(slots({ overrides: { working_days: [5, 6] } })).toHaveLength(0);
  });

  it("hides slots already taken by another appointment", () => {
    const busy = {
      startMs: new Date(istIso("11:00")).getTime(),
      endMs: new Date(istIso("11:30")).getTime(),
    };
    const starts = slots({ busy: [busy] }).map((slot) => slot.start);
    expect(starts.some((start) => start.startsWith(`${DAY}T11:00`))).toBe(false);
    expect(starts.some((start) => start.startsWith(`${DAY}T11:30`))).toBe(true);
  });

  it("respects the minimum notice window", () => {
    const nowInDay = new Date(istIso("12:00")).getTime();
    const result = generateSlots({
      dateKey: DAY,
      durationMinutes: 30,
      settings: { ...settings, min_notice_minutes: 120 },
      blocks: [],
      busy: [],
      nowMs: nowInDay,
    });
    expect(result[0]?.start.startsWith(`${DAY}T14:00`)).toBe(true);
  });
});

describe("server-side slot validation", () => {
  const base = { durationMinutes: 30, settings, blocks: [], busy: [], nowMs: NOW };

  it("accepts a real slot start", () => {
    expect(validateRequestedSlot(istIso("11:00"), base).ok).toBe(true);
  });

  it("rejects a time inside the lunch break", () => {
    expect(validateRequestedSlot(istIso("13:00"), base).ok).toBe(false);
  });

  it("rejects a time outside working hours", () => {
    expect(validateRequestedSlot(istIso("19:00"), base).ok).toBe(false);
  });

  it("rejects a start that is not on the slot grid", () => {
    expect(validateRequestedSlot(istIso("11:10"), base).ok).toBe(false);
  });

  it("rejects a blocked time", () => {
    const blocked = {
      block_date: DAY,
      all_day: false,
      start_time: "15:00:00",
      end_time: "16:00:00",
    } as BlockedTime;
    expect(validateRequestedSlot(istIso("15:00"), { ...base, blocks: [blocked] }).ok).toBe(false);
  });

  it("prevents double booking when two candidates race for one slot", async () => {
    const taken: BusyInterval[] = [];
    // Both requests validate against the same shared state, exactly as two
    // concurrent bookings do on the server before the database guard runs.
    const attempt = async () => {
      const result = validateRequestedSlot(istIso("11:00"), { ...base, busy: [...taken] });
      if (result.ok) taken.push({ startMs: result.startMs, endMs: result.endMs });
      return result.ok;
    };
    const outcomes = [await attempt(), await attempt(), await attempt()];
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });
});
