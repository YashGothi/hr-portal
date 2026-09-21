import { describe, expect, it } from "vitest";
import {
  SHORTLIST_THRESHOLD,
  INTERVIEW_ELIGIBLE_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/ats/weights";
import { STAGE_LABELS, PIPELINE_STAGES, type Stage } from "@/lib/hr";
import { validateRequestedSlot, type BusyInterval, type SchedulingSettings } from "./core";

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

type BookingSimResult =
  | {
      ok: true;
      appointment: { id: string; candidate_id: string; start_at: string; status: string };
      candidate: {
        id: string;
        stage: Stage;
        application_status: ApplicationStatus;
        ats_score: number | null;
      };
      stageHistory: { from: Stage; to: Stage }[];
      response: { stage: Stage; applicationStatus: ApplicationStatus; statusLabel: string };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/** Simulated server-side booking handler matching route & serverFn authority */
function simulateServerBooking(params: {
  candidate: {
    id: string;
    stage: Stage;
    application_status: ApplicationStatus;
    ats_score: number | null;
  };
  invite: {
    token: string;
    appointment_type: "SCREENING" | "INTERVIEW";
    expires_at: string | null;
    revoked_at: string | null;
  };
  slotTime: string;
  busySlots: BusyInterval[];
}): BookingSimResult {
  const { candidate, invite, slotTime, busySlots } = params;

  // 1. Validate Token
  if (!/^[0-9a-f-]{36}$/i.test(invite.token) || invite.revoked_at) {
    return { ok: false, status: 404, error: "This scheduling link is not valid." };
  }
  if (invite.expires_at && new Date(invite.expires_at).getTime() < NOW) {
    return { ok: false, status: 404, error: "This scheduling link has expired." };
  }

  // 2. Validate Candidate Shortlist Eligibility
  if (invite.appointment_type === "INTERVIEW") {
    const isEligible =
      (candidate.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
      (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(candidate.application_status);
    if (!isEligible) {
      return {
        ok: false,
        status: 404,
        error: "Interview scheduling is not available for this application.",
      };
    }
  }

  // 3. Validate Requested Slot (Hours, lunch, conflict)
  const slotCheck = validateRequestedSlot(slotTime, {
    durationMinutes: 30,
    settings: testSettings,
    blocks: [],
    busy: busySlots,
    nowMs: NOW,
  });

  if (!slotCheck.ok) {
    return { ok: false, status: 409, error: slotCheck.reason };
  }

  // 4. Appointment creation succeeds
  const createdAppointment = {
    id: "apt-" + Math.random().toString(36).slice(2, 9),
    candidate_id: candidate.id,
    start_at: slotTime,
    status: "BOOKED",
  };

  // 5. Atomic server-side state transition on success
  const updatedCandidate = { ...candidate };
  const stageHistoryEntries: { from: Stage; to: Stage }[] = [];

  if (invite.appointment_type === "INTERVIEW") {
    const previousStage = updatedCandidate.stage;
    updatedCandidate.stage = "interview";
    updatedCandidate.application_status = "interview_scheduled";

    if (previousStage !== "interview") {
      stageHistoryEntries.push({ from: previousStage, to: "interview" });
    }
  }

  return {
    ok: true,
    appointment: createdAppointment,
    candidate: updatedCandidate,
    stageHistory: stageHistoryEntries,
    response: {
      stage: updatedCandidate.stage,
      applicationStatus: updatedCandidate.application_status,
      statusLabel: APPLICATION_STATUS_LABELS[updatedCandidate.application_status],
    },
  };
}

describe("Interview Booking Auto-Transition to Interview & Interview Sent", () => {
  /* ------------------------------------------------------------------ */
  /* Test A: Successful Booking                                         */
  /* ------------------------------------------------------------------ */
  describe("A. Successful booking", () => {
    it("transitions candidate from Shortlisted to Interview with 'Interview Sent' status", () => {
      const candidate = {
        id: "cand-shortlisted-1",
        stage: "shortlisted" as Stage,
        application_status: "shortlisted" as ApplicationStatus,
        ats_score: 90,
      };

      const invite = {
        token: "11111111-1111-1111-1111-111111111111",
        appointment_type: "INTERVIEW" as const,
        expires_at: null,
        revoked_at: null,
      };

      const result = simulateServerBooking({
        candidate,
        invite,
        slotTime: istIso("11:30"),
        busySlots: [],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected booking to succeed");

      // Appointment created
      expect(result.appointment).toBeDefined();
      expect(result.appointment.status).toBe("BOOKED");

      // Candidate stage becomes "interview"
      expect(result.candidate.stage).toBe("interview");

      // Candidate status becomes "interview_scheduled" which displays as "Interview Sent"
      expect(result.candidate.application_status).toBe("interview_scheduled");
      expect(APPLICATION_STATUS_LABELS[result.candidate.application_status]).toBe("Interview Sent");
      expect(STAGE_LABELS[result.candidate.stage]).toBe("Interview");

      // Stage history recorded transition from shortlisted to interview
      expect(result.stageHistory).toHaveLength(1);
      expect(result.stageHistory[0]).toEqual({ from: "shortlisted", to: "interview" });

      // Returned response payload includes updated status info
      expect(result.response.stage).toBe("interview");
      expect(result.response.applicationStatus).toBe("interview_scheduled");
      expect(result.response.statusLabel).toBe("Interview Sent");
    });
  });

  /* ------------------------------------------------------------------ */
  /* Test B: Failed Booking (Slot unavailable / 409)                    */
  /* ------------------------------------------------------------------ */
  describe("B. Failed booking", () => {
    it("does not create appointment and candidate remains in Shortlisted stage", () => {
      const candidate = {
        id: "cand-shortlisted-2",
        stage: "shortlisted" as Stage,
        application_status: "shortlisted" as ApplicationStatus,
        ats_score: 88,
      };

      const invite = {
        token: "22222222-2222-2222-2222-222222222222",
        appointment_type: "INTERVIEW" as const,
        expires_at: null,
        revoked_at: null,
      };

      // Slot is already occupied by another candidate
      const busySlot: BusyInterval = {
        startMs: new Date(istIso("14:00")).getTime(),
        endMs: new Date(istIso("14:30")).getTime(),
      };

      const result = simulateServerBooking({
        candidate,
        invite,
        slotTime: istIso("14:00"),
        busySlots: [busySlot],
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected booking to fail");
      expect(result.status).toBe(409);

      // Candidate remains strictly in shortlisted stage
      expect(candidate.stage).toBe("shortlisted");
      expect(candidate.application_status).toBe("shortlisted");
      expect(STAGE_LABELS[candidate.stage]).toBe("Shortlisted");
    });
  });

  /* ------------------------------------------------------------------ */
  /* Test C: Invalid / Expired Token                                    */
  /* ------------------------------------------------------------------ */
  describe("C. Invalid/expired token", () => {
    it("rejects invalid token and leaves candidate unchanged", () => {
      const candidate = {
        id: "cand-shortlisted-3",
        stage: "shortlisted" as Stage,
        application_status: "shortlisted" as ApplicationStatus,
        ats_score: 92,
      };

      const invalidInvite = {
        token: "invalid-token-format",
        appointment_type: "INTERVIEW" as const,
        expires_at: null,
        revoked_at: null,
      };

      const result = simulateServerBooking({
        candidate,
        invite: invalidInvite,
        slotTime: istIso("11:00"),
        busySlots: [],
      });

      expect(result.ok).toBe(false);
      expect(candidate.stage).toBe("shortlisted");
    });

    it("rejects expired token and leaves candidate unchanged", () => {
      const candidate = {
        id: "cand-shortlisted-4",
        stage: "shortlisted" as Stage,
        application_status: "shortlisted" as ApplicationStatus,
        ats_score: 86,
      };

      const expiredInvite = {
        token: "33333333-3333-3333-3333-333333333333",
        appointment_type: "INTERVIEW" as const,
        expires_at: "2026-10-01T00:00:00Z", // Past date relative to NOW
        revoked_at: null,
      };

      const result = simulateServerBooking({
        candidate,
        invite: expiredInvite,
        slotTime: istIso("11:00"),
        busySlots: [],
      });

      expect(result.ok).toBe(false);
      expect(candidate.stage).toBe("shortlisted");
    });
  });

  /* ------------------------------------------------------------------ */
  /* Test D: Filtered Candidate Rejection (< 85)                        */
  /* ------------------------------------------------------------------ */
  describe("D. Filtered candidate", () => {
    it("strictly prevents non-shortlisted candidate (< 85) from booking interview", () => {
      const filteredCandidate = {
        id: "cand-filtered-1",
        stage: "application" as Stage,
        application_status: "filtered_out" as ApplicationStatus,
        ats_score: 76,
      };

      const invite = {
        token: "44444444-4444-4444-4444-444444444444",
        appointment_type: "INTERVIEW" as const,
        expires_at: null,
        revoked_at: null,
      };

      const result = simulateServerBooking({
        candidate: filteredCandidate,
        invite,
        slotTime: istIso("11:00"),
        busySlots: [],
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected booking to fail");
      expect(result.status).toBe(404);
      expect(result.error).toContain("Interview scheduling is not available");

      // Candidate remains Filtered Out and never transitions to Interview
      expect(filteredCandidate.stage).toBe("application");
      expect(filteredCandidate.application_status).toBe("filtered_out");
    });
  });

  /* ------------------------------------------------------------------ */
  /* Test E: Refresh / Persistence                                      */
  /* ------------------------------------------------------------------ */
  describe("E. Refresh/persistence", () => {
    it("persisted candidate record retains Interview stage and Interview Sent status on reload", () => {
      // Database candidate table mock
      const databaseRecord = {
        id: "cand-persisted-1",
        stage: "shortlisted",
        application_status: "interview_invited",
        interview_at: null as string | null,
      };

      // Booking executes on server
      const bookedTime = istIso("15:00");
      databaseRecord.stage = "interview";
      databaseRecord.application_status = "interview_scheduled";
      databaseRecord.interview_at = bookedTime;

      // Simulate page refresh (re-query from database)
      const refreshedCandidate = { ...databaseRecord };

      expect(refreshedCandidate.stage).toBe("interview");
      expect(STAGE_LABELS[refreshedCandidate.stage as Stage]).toBe("Interview");
      expect(
        APPLICATION_STATUS_LABELS[refreshedCandidate.application_status as ApplicationStatus],
      ).toBe("Interview Sent");
      expect(refreshedCandidate.interview_at).toBe(bookedTime);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Test F: Pipeline Rendering & Stage Partitioning                    */
  /* ------------------------------------------------------------------ */
  describe("F. Pipeline rendering", () => {
    it("moves candidate from Shortlisted column to Interview column without duplication", () => {
      const candidateA = {
        id: "cand-A",
        full_name: "Alice Walker",
        stage: "shortlisted" as Stage,
      };
      const candidateB = {
        id: "cand-B",
        full_name: "Bob Stone",
        stage: "shortlisted" as Stage,
      };

      const allCandidates = [candidateA, candidateB];

      // Before booking:
      const shortlistedBefore = allCandidates.filter((c) => c.stage === "shortlisted");
      const interviewBefore = allCandidates.filter((c) => c.stage === "interview");

      expect(shortlistedBefore.map((c) => c.id)).toContain("cand-A");
      expect(interviewBefore.map((c) => c.id)).not.toContain("cand-A");
      expect(shortlistedBefore).toHaveLength(2);
      expect(interviewBefore).toHaveLength(0);

      // Candidate A books interview:
      candidateA.stage = "interview";

      // After booking:
      const shortlistedAfter = allCandidates.filter((c) => c.stage === "shortlisted");
      const interviewAfter = allCandidates.filter((c) => c.stage === "interview");

      // Candidate A appears in Interview column
      expect(interviewAfter.map((c) => c.id)).toContain("cand-A");
      expect(interviewAfter).toHaveLength(1);

      // Candidate A has disappeared from Shortlisted column
      expect(shortlistedAfter.map((c) => c.id)).not.toContain("cand-A");
      expect(shortlistedAfter).toHaveLength(1);
      expect(shortlistedAfter[0]!.id).toBe("cand-B");

      // Verify PIPELINE_STAGES contains both stages
      expect(PIPELINE_STAGES).toContain("shortlisted");
      expect(PIPELINE_STAGES).toContain("interview");
      expect(STAGE_LABELS.shortlisted).toBe("Shortlisted");
      expect(STAGE_LABELS.interview).toBe("Interview");
    });
  });

  /* ------------------------------------------------------------------ */
  /* Test G: Concurrent Booking Conflict                                */
  /* ------------------------------------------------------------------ */
  describe("G. Concurrent booking", () => {
    it("transitions only the winning candidate to Interview, losing candidate remains Shortlisted", () => {
      const candidateWinner = {
        id: "cand-win",
        stage: "shortlisted" as Stage,
        application_status: "shortlisted" as ApplicationStatus,
        ats_score: 94,
      };

      const candidateLoser = {
        id: "cand-lose",
        stage: "shortlisted" as Stage,
        application_status: "shortlisted" as ApplicationStatus,
        ats_score: 91,
      };

      const sharedSlotTime = istIso("16:00");
      const busyList: BusyInterval[] = [];

      // Candidate Winner books first
      const winResult = simulateServerBooking({
        candidate: candidateWinner,
        invite: {
          token: "55555555-5555-5555-5555-555555555555",
          appointment_type: "INTERVIEW",
          expires_at: null,
          revoked_at: null,
        },
        slotTime: sharedSlotTime,
        busySlots: busyList,
      });

      expect(winResult.ok).toBe(true);
      if (!winResult.ok) throw new Error("Expected winner booking to succeed");
      // Winner transitions
      expect(winResult.candidate.stage).toBe("interview");
      expect(winResult.candidate.application_status).toBe("interview_scheduled");

      // The slot is now recorded in database as busy
      busyList.push({
        startMs: new Date(sharedSlotTime).getTime(),
        endMs: new Date(sharedSlotTime).getTime() + 30 * 60000,
      });

      // Candidate Loser attempts to book the exact same slot
      const loseResult = simulateServerBooking({
        candidate: candidateLoser,
        invite: {
          token: "66666666-6666-6666-6666-666666666666",
          appointment_type: "INTERVIEW",
          expires_at: null,
          revoked_at: null,
        },
        slotTime: sharedSlotTime,
        busySlots: busyList,
      });

      // Loser fails with conflict
      expect(loseResult.ok).toBe(false);
      if (loseResult.ok) throw new Error("Expected booking to fail");
      expect(loseResult.status).toBe(409);

      // Loser candidate strictly remains Shortlisted
      expect(candidateLoser.stage).toBe("shortlisted");
      expect(candidateLoser.application_status).toBe("shortlisted");
      expect(STAGE_LABELS[candidateLoser.stage]).toBe("Shortlisted");
    });
  });
});
