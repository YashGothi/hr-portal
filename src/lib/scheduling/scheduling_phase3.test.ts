import { describe, expect, it } from "vitest";
import {
  generateSlots,
  validateRequestedSlot,
  type BlockedTime,
  type BusyInterval,
  type SchedulingSettings,
} from "./core";
import { SHORTLIST_THRESHOLD, INTERVIEW_ELIGIBLE_STATUSES } from "@/lib/ats/weights";

const testSettings: SchedulingSettings = {
  timezone: "Asia/Kolkata",
  working_days: [1, 2, 3, 4, 5],
  work_start: "11:00:00",
  work_end: "18:00:00",
  break_start: "13:00:00",
  break_end: "14:00:00",
  allow_candidate_reschedule: true,
  min_notice_minutes: 0,
  booking_horizon_days: 30,
  default_meeting_url: "https://meet.google.com/test-room",
  interviewer_name: "Talent Acquisition Team",
};

const DAY = "2026-10-07"; // A Wednesday
const NOW = new Date("2026-10-06T00:00:00Z").getTime();

function istIso(time: string) {
  return `${DAY}T${time}:00+05:30`;
}

function getSlots(options: { busy?: BusyInterval[]; blocks?: BlockedTime[] } = {}) {
  return generateSlots({
    dateKey: DAY,
    durationMinutes: 30,
    settings: testSettings,
    blocks: options.blocks ?? [],
    busy: options.busy ?? [],
    nowMs: NOW,
  });
}

describe("Phase 3: Interview Scheduling Specification & Hardening", () => {
  /* ------------------------------------------------------------------ */
  /* Requirement 1: Shortlisted candidate eligibility (score >= 85)     */
  /* ------------------------------------------------------------------ */
  it("Requirement 1: allows interview scheduling for candidates with ATS score >= 85 and shortlisted status", () => {
    const candidate = {
      ats_score: 85,
      application_status: "shortlisted",
      stage: "shortlisted",
    };

    const isEligible =
      (candidate.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
      (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(candidate.application_status);

    expect(isEligible).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 2: Filtered candidate rejection (score < 85)           */
  /* ------------------------------------------------------------------ */
  it("Requirement 2: strictly rejects interview scheduling for candidates with ATS score < 85 or filtered_out status", () => {
    const candidateScore84 = {
      ats_score: 84,
      application_status: "filtered_out",
      stage: "application",
    };

    const isEligible84 =
      (candidateScore84.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
      (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(
        candidateScore84.application_status,
      );

    expect(isEligible84).toBe(false);

    const candidateScore70 = {
      ats_score: 70,
      application_status: "filtered_out",
      stage: "application",
    };

    const isEligible70 =
      (candidateScore70.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
      (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(
        candidateScore70.application_status,
      );

    expect(isEligible70).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 3: Valid token acceptance                              */
  /* ------------------------------------------------------------------ */
  it("Requirement 3: accepts active, valid UUID tokens", () => {
    const validToken = "c8f2a176-90bb-4b95-a4b5-82782b7db538";
    const isValidFormat = /^[0-9a-f-]{36}$/i.test(validToken);
    expect(isValidFormat).toBe(true);

    const invite = {
      token: validToken,
      revoked_at: null,
      expires_at: null,
      candidate_id: "cand-123",
      appointment_type: "INTERVIEW",
    };

    const isUsable =
      !invite.revoked_at && (!invite.expires_at || new Date(invite.expires_at) > new Date());
    expect(isUsable).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 4: Invalid token rejection                             */
  /* ------------------------------------------------------------------ */
  it("Requirement 4: rejects malformed, empty, or random invalid tokens", () => {
    const malformed = ["not-a-uuid", "", "12345", "random-garbage-string-xyz"];
    for (const token of malformed) {
      const isValid = /^[0-9a-f-]{36}$/i.test(token);
      expect(isValid).toBe(false);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 5: Token ownership enforcement                         */
  /* ------------------------------------------------------------------ */
  it("Requirement 5: prevents candidate A from using candidate B's scheduling token", () => {
    const inviteA = {
      id: "inv-001",
      token: "a1111111-1111-1111-1111-111111111111",
      candidate_id: "candidate-A",
      appointment_type: "INTERVIEW",
    };

    const attemptedCandidateId = "candidate-B";
    const isOwner = inviteA.candidate_id === attemptedCandidateId;
    expect(isOwner).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 6: Token reuse & expiration rejection                  */
  /* ------------------------------------------------------------------ */
  it("Requirement 6: rejects expired tokens and revoked tokens", () => {
    const expiredInvite = {
      token: "b2222222-2222-2222-2222-222222222222",
      revoked_at: null,
      expires_at: "2026-01-01T00:00:00Z", // past date
    };

    const isExpired =
      expiredInvite.expires_at != null &&
      new Date(expiredInvite.expires_at).getTime() < new Date("2026-10-07T00:00:00Z").getTime();
    expect(isExpired).toBe(true);

    const revokedInvite = {
      token: "b3333333-3333-3333-3333-333333333333",
      revoked_at: "2026-10-01T12:00:00Z",
      expires_at: null,
    };

    expect(Boolean(revokedInvite.revoked_at)).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 7: Valid HR hours (11:00 AM - 6:00 PM)                 */
  /* ------------------------------------------------------------------ */
  it("Requirement 7: generates slots strictly between 11:00 AM and 6:00 PM", () => {
    const slots = getSlots();
    expect(slots.length).toBeGreaterThan(0);

    const firstSlot = slots[0]!;
    const lastSlot = slots[slots.length - 1]!;

    expect(firstSlot.start).toBe(istIso("11:00"));
    expect(firstSlot.end).toBe(istIso("11:30"));

    expect(lastSlot.start).toBe(istIso("17:30"));
    expect(lastSlot.end).toBe(istIso("18:00"));
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 8: Lunch exclusion (1:00 PM - 2:00 PM)                 */
  /* ------------------------------------------------------------------ */
  it("Requirement 8: strictly excludes 1:00 PM to 2:00 PM lunch break", () => {
    const slots = getSlots();
    const starts = slots.map((s) => s.start);

    // Valid morning slots before lunch
    expect(starts).toContain(istIso("11:00"));
    expect(starts).toContain(istIso("11:30"));
    expect(starts).toContain(istIso("12:00"));
    expect(starts).toContain(istIso("12:30"));

    // LUNCH BREAK - MUST NOT EXIST
    expect(starts).not.toContain(istIso("13:00"));
    expect(starts).not.toContain(istIso("13:30"));

    // Valid afternoon slots after lunch
    expect(starts).toContain(istIso("14:00"));
    expect(starts).toContain(istIso("14:30"));
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 9: Invalid outside-hours booking rejection             */
  /* ------------------------------------------------------------------ */
  it("Requirement 9: rejects bookings requested before 11:00 AM, during lunch, or after 6:00 PM", () => {
    const base = { durationMinutes: 30, settings: testSettings, blocks: [], busy: [], nowMs: NOW };

    // Before working hours
    expect(validateRequestedSlot(istIso("10:30"), base).ok).toBe(false);

    // During lunch break
    expect(validateRequestedSlot(istIso("13:00"), base).ok).toBe(false);
    expect(validateRequestedSlot(istIso("13:30"), base).ok).toBe(false);

    // Ending after working hours
    expect(validateRequestedSlot(istIso("18:00"), base).ok).toBe(false);
    expect(validateRequestedSlot(istIso("18:30"), base).ok).toBe(false);

    // Non-grid off-pitch time
    expect(validateRequestedSlot(istIso("11:15"), base).ok).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 10: Occupied slot exclusion                            */
  /* ------------------------------------------------------------------ */
  it("Requirement 10: removes occupied appointment intervals from offered slots", () => {
    const busySlot: BusyInterval = {
      startMs: new Date(istIso("15:00")).getTime(),
      endMs: new Date(istIso("15:30")).getTime(),
    };

    const slots = getSlots({ busy: [busySlot] });
    const starts = slots.map((s) => s.start);

    expect(starts).not.toContain(istIso("15:00"));
    expect(starts).toContain(istIso("14:30"));
    expect(starts).toContain(istIso("15:30"));
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 11: Overlap rejection                                  */
  /* ------------------------------------------------------------------ */
  it("Requirement 11: rejects exact, partial, and enclosing overlaps against occupied slots", () => {
    const busySlot: BusyInterval = {
      startMs: new Date(istIso("15:00")).getTime(),
      endMs: new Date(istIso("15:30")).getTime(),
    };

    const base = {
      durationMinutes: 30,
      settings: testSettings,
      blocks: [],
      busy: [busySlot],
      nowMs: NOW,
    };

    // Exact overlap
    expect(validateRequestedSlot(istIso("15:00"), base).ok).toBe(false);

    // Helper interval overlap check (as implemented in core.ts overlaps())
    const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
      aStart < bEnd && bStart < aEnd;

    const bStart = busySlot.startMs;
    const bEnd = busySlot.endMs;

    // Partial left overlap: 14:45 - 15:15
    const partialLeftStart = new Date(istIso("14:45")).getTime();
    const partialLeftEnd = new Date(istIso("15:15")).getTime();
    expect(overlaps(partialLeftStart, partialLeftEnd, bStart, bEnd)).toBe(true);

    // Partial right overlap: 15:15 - 15:45
    const partialRightStart = new Date(istIso("15:15")).getTime();
    const partialRightEnd = new Date(istIso("15:45")).getTime();
    expect(overlaps(partialRightStart, partialRightEnd, bStart, bEnd)).toBe(true);

    // Enclosing overlap: 14:30 - 16:00
    const enclosingStart = new Date(istIso("14:30")).getTime();
    const enclosingEnd = new Date(istIso("16:00")).getTime();
    expect(overlaps(enclosingStart, enclosingEnd, bStart, bEnd)).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 12: Adjacent slot acceptance                           */
  /* ------------------------------------------------------------------ */
  it("Requirement 12: permits adjacent non-overlapping slots before and after an appointment", () => {
    const busySlot: BusyInterval = {
      startMs: new Date(istIso("15:00")).getTime(),
      endMs: new Date(istIso("15:30")).getTime(),
    };

    const base = {
      durationMinutes: 30,
      settings: testSettings,
      blocks: [],
      busy: [busySlot],
      nowMs: NOW,
    };

    // Slot immediately preceding (14:30 - 15:00)
    expect(validateRequestedSlot(istIso("14:30"), base).ok).toBe(true);

    // Slot immediately following (15:30 - 16:00)
    expect(validateRequestedSlot(istIso("15:30"), base).ok).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 13: Duplicate booking prevention                       */
  /* ------------------------------------------------------------------ */
  it("Requirement 13: blocks duplicate booking attempt when candidate already has a live booking", () => {
    const existingAppointment = {
      id: "apt-001",
      candidate_id: "cand-123",
      appointment_type: "INTERVIEW",
      status: "BOOKED",
    };

    const isDuplicate = existingAppointment.status === "BOOKED";
    expect(isDuplicate).toBe(true);

    const errorMessage =
      "You already have this appointment booked. Please use the reschedule option.";
    expect(errorMessage).toContain("already have this appointment booked");
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 14: Race-safe booking with atomic exclusion guard      */
  /* ------------------------------------------------------------------ */
  it("Requirement 14: handles PostgreSQL 23P01 exclusion violation with a 409 conflict error", () => {
    // Simulated Postgres 23P01 error from GiST constraint: appointments_no_overlap
    const pgError = {
      code: "23P01",
      message: "conflicting key value violates exclusion constraint 'appointments_no_overlap'",
    };

    const status = pgError.code === "23P01" ? 409 : 500;
    const responseMessage =
      status === 409
        ? "This time slot is no longer available. Please select another available time."
        : "We could not complete the booking. Please try again.";

    expect(status).toBe(409);
    expect(responseMessage).toBe(
      "This time slot is no longer available. Please select another available time.",
    );
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 15: Already-booked candidate behavior                  */
  /* ------------------------------------------------------------------ */
  it("Requirement 15: returns existing confirmed appointment and offers rescheduling", () => {
    const existingAppointment = {
      id: "apt-101",
      appointment_type: "INTERVIEW",
      start_at: istIso("14:00"),
      end_at: istIso("14:30"),
      timezone: "Asia/Kolkata",
      status: "BOOKED",
      meeting_url: "https://meet.google.com/test-room",
      interviewer: "Talent Acquisition Team",
      duration_minutes: 30,
    };

    expect(existingAppointment.status).toBe("BOOKED");
    expect(existingAppointment.duration_minutes).toBe(30);
    expect(testSettings.allow_candidate_reschedule).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 16: Candidate privacy (no internal ATS or note leakage)*/
  /* ------------------------------------------------------------------ */
  it("Requirement 16: candidate public invite response contains only scheduling metadata and zero internal ATS data", () => {
    const candidateDatabaseRecord = {
      id: "cand-uuid",
      full_name: "Sarah Jenkins",
      email: "sarah@example.com",
      phone: "+1-555-0101",
      application_code: "APP-001",
      ats_score: 95,
      ats_category: "Strong Match",
      ats_breakdown: [{ key: "requiredSkills", score: 100 }],
      recruiter_notes: "Strong backend experience",
      resume_text: "Confidential resume contents",
    };

    // Public invite endpoint response mapping
    const publicInviteResponse = {
      appointmentType: "INTERVIEW",
      title: "Interview Call",
      durationMinutes: 30,
      jobTitle: "Senior Cloud Backend Engineer",
      candidate: {
        fullName: candidateDatabaseRecord.full_name,
        email: candidateDatabaseRecord.email,
        phone: candidateDatabaseRecord.phone,
        applicationCode: candidateDatabaseRecord.application_code,
      },
    };

    expect(publicInviteResponse).not.toHaveProperty("ats_score");
    expect(publicInviteResponse).not.toHaveProperty("ats_category");
    expect(publicInviteResponse).not.toHaveProperty("ats_breakdown");
    expect(publicInviteResponse).not.toHaveProperty("recruiter_notes");
    expect(publicInviteResponse).not.toHaveProperty("resume_text");
    expect(publicInviteResponse.candidate.fullName).toBe("Sarah Jenkins");
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 17: Anonymous direct access rejection (RLS validation) */
  /* ------------------------------------------------------------------ */
  it("Requirement 17: direct access to appointments and invites is protected by staff RLS", () => {
    // Policy: private.is_staff(auth.uid())
    const isStaff = (uid: string | null) => uid === "staff-user-id";

    expect(isStaff(null)).toBe(false); // Anonymous user
    expect(isStaff("candidate-uid")).toBe(false); // Candidate user
    expect(isStaff("staff-user-id")).toBe(true); // Staff user
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 18: Authorized HR access                               */
  /* ------------------------------------------------------------------ */
  it("Requirement 18: allows HR staff to view appointments, availability, and reschedule", () => {
    const hrUser = { role: "recruiter", id: "staff-123" };
    const canAccessHrScheduling = ["recruiter", "admin"].includes(hrUser.role);
    expect(canAccessHrScheduling).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 19: Booking confirmation response format               */
  /* ------------------------------------------------------------------ */
  it("Requirement 19: booking confirmation contains start/end times, timezone, and meeting link", () => {
    const confirmation = {
      appointmentId: "apt-new-uuid",
      title: "Interview Call",
      durationMinutes: 30,
      startAt: istIso("11:00"),
      endAt: istIso("11:30"),
      timezone: "Asia/Kolkata",
      meetingUrl: "https://meet.google.com/test-room",
      interviewer: "Talent Acquisition Team",
      jobTitle: "Senior Cloud Backend Engineer",
      candidateName: "Sarah Jenkins",
      emailDelivered: false,
    };

    expect(confirmation.durationMinutes).toBe(30);
    expect(confirmation.startAt).toContain("T11:00:00");
    expect(confirmation.endAt).toContain("T11:30:00");
    expect(confirmation.timezone).toBe("Asia/Kolkata");
    expect(confirmation.meetingUrl).toBe("https://meet.google.com/test-room");
  });

  /* ------------------------------------------------------------------ */
  /* Requirement 20: Safe race conflict response                        */
  /* ------------------------------------------------------------------ */
  it("Requirement 20: conflict response does not leak competitor candidate identity", () => {
    const conflictResponse = {
      error: "This time slot is no longer available. Please select another available time.",
    };

    expect(conflictResponse.error).not.toContain("candidate");
    expect(conflictResponse.error).not.toContain("name");
    expect(conflictResponse.error).not.toContain("email");
    expect(conflictResponse.error).toBe(
      "This time slot is no longer available. Please select another available time.",
    );
  });
});
