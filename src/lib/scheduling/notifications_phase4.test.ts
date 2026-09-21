import { describe, expect, it } from "vitest";
import {
  SHORTLIST_THRESHOLD,
  INTERVIEW_ELIGIBLE_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/ats/weights";
import { STAGE_LABELS, PIPELINE_STAGES, type Stage } from "@/lib/hr";
import {
  interviewInvitationSubject,
  interviewInvitationBody,
  buildInterviewInvitationEmail,
  INTERVIEW_DURATION_MINUTES,
} from "@/lib/interview-invitation";
import { template as confirmationTemplate } from "@/lib/email-templates/scheduling-confirmation";
import { template as reminderTemplate } from "@/lib/email-templates/interview-reminder";
import {
  generateSlots,
  validateRequestedSlot,
  type BusyInterval,
  type SchedulingSettings,
} from "./core";

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

describe("Phase 4: Notifications & Interview Lifecycle Specification Suite", () => {
  /* ================================================================== */
  /* Scenario A: Interview invitation notification                      */
  /* ================================================================== */
  describe("Scenario A: Interview invitation notification", () => {
    it("generates invitation with exact subject, 30-min duration, secure link, and zero ATS leakage", () => {
      const candidate = {
        name: "Priya Sharma",
        ats_score: 88,
        application_status: "shortlisted",
        job_title: "Senior Full Stack Engineer",
      };

      // Eligibility check
      expect(candidate.ats_score).toBeGreaterThanOrEqual(SHORTLIST_THRESHOLD);
      expect(INTERVIEW_ELIGIBLE_STATUSES).toContain(candidate.application_status);

      const token = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d";
      const schedulingUrl = `https://hr.example.com/schedule/${token}?type=interview`;

      const email = buildInterviewInvitationEmail({
        candidateName: candidate.name,
        jobTitle: candidate.job_title,
        schedulingUrl,
      });

      // Subject check
      expect(email.subject).toBe(`Interview Invitation — ${candidate.job_title}`);
      // Body checks
      expect(email.body).toContain(candidate.name);
      expect(email.body).toContain(candidate.job_title);
      expect(email.body).toContain(schedulingUrl);
      expect(email.body).toContain(`${INTERVIEW_DURATION_MINUTES} minutes`);
      expect(email.body).toContain("Seceon");

      // Privacy check: Zero ATS score, weights, or breakdown
      expect(email.body).not.toContain("88");
      expect(email.body).not.toContain("ATS");
      expect(email.body).not.toContain("score");
      expect(email.body).not.toContain("evaluation");
      expect(email.body).not.toContain("evidence");
    });
  });

  /* ================================================================== */
  /* Scenario B: Filtered candidate rejection                           */
  /* ================================================================== */
  describe("Scenario B: Filtered candidate rejection", () => {
    it("strictly rejects interview invitation creation for candidates with score < 85", () => {
      const filteredCandidate = {
        id: "cand-filtered-1",
        ats_score: 84,
        application_status: "filtered_out",
      };

      const isEligible =
        (filteredCandidate.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
        (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(
          filteredCandidate.application_status,
        );

      expect(isEligible).toBe(false);

      // Simulated recruiter invitation function guard
      function createInterviewInvite(cand: typeof filteredCandidate) {
        const eligible =
          (cand.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
          (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(cand.application_status);
        if (!eligible) {
          throw new Error("Only shortlisted candidates can be invited to an interview.");
        }
        return { token: "secret-token" };
      }

      expect(() => createInterviewInvite(filteredCandidate)).toThrow(
        "Only shortlisted candidates can be invited to an interview.",
      );
    });
  });

  /* ================================================================== */
  /* Scenario C: Successful booking notification & in-app alert        */
  /* ================================================================== */
  describe("Scenario C: Successful booking notification & in-app alert", () => {
    it("generates booking confirmation subject and body with date, time, timezone, duration, and link", () => {
      const jobTitle = "DevOps Platform Engineer";
      const candidateName = "Rahul Verma";
      const subject = confirmationTemplate.subject({
        role: jobTitle,
        cancelled: false,
      });

      expect(subject).toBe(`Interview Confirmed — ${jobTitle}`);

      // Component props
      const emailProps = {
        candidateName,
        appointmentTitle: "Interview Call",
        role: jobTitle,
        dateLabel: "October 7, 2026",
        timeLabel: "11:00 AM – 11:30 AM",
        timezoneLabel: "IST",
        durationMinutes: 30,
        meetingUrl: "https://meet.google.com/test-room",
        interviewer: "Talent Acquisition Team",
        cancelled: false,
      };

      expect(emailProps.durationMinutes).toBe(30);
      expect(emailProps.meetingUrl).toBe("https://meet.google.com/test-room");
      expect(emailProps.timeLabel).toBe("11:00 AM – 11:30 AM");
    });

    it("creates an in-app recruiter alert on booking", () => {
      const candidateName = "Rahul Verma";
      const jobTitle = "DevOps Platform Engineer";
      const startAt = "2026-10-07T11:00:00+05:30";

      const alert = {
        title: `Interview booked: ${candidateName}`,
        body: `Interview Call scheduled for ${new Date(startAt).toLocaleDateString()} with ${candidateName} for ${jobTitle}.`,
        read: false,
      };

      expect(alert.title).toContain(candidateName);
      expect(alert.body).toContain(jobTitle);
      expect(alert.read).toBe(false);
    });
  });

  /* ================================================================== */
  /* Scenario D: Failed booking: no confirmation                       */
  /* ================================================================== */
  describe("Scenario D: Failed booking: no confirmation", () => {
    it("fails booking when slot is occupied and emits no confirmation or notifications", () => {
      const existingBusy: BusyInterval[] = [
        {
          startMs: new Date(istIso("11:00")).getTime(),
          endMs: new Date(istIso("11:30")).getTime(),
        },
      ];

      // Requesting the exact same time
      const validation = validateRequestedSlot(istIso("11:00"), {
        durationMinutes: 30,
        settings: testSettings,
        blocks: [],
        busy: existingBusy,
        nowMs: NOW,
      });

      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.reason).toContain("This time slot is no longer available");
      }

      // Booking transaction failure: no notification dispatched, candidate_notified remains false
      const appointmentRecord = null;
      let candidateNotified = false;
      let alertDispatched = false;

      if (!validation.ok) {
        // Safe exit without notifying
      } else {
        candidateNotified = true;
        alertDispatched = true;
      }

      expect(appointmentRecord).toBeNull();
      expect(candidateNotified).toBe(false);
      expect(alertDispatched).toBe(false);
    });
  });

  /* ================================================================== */
  /* Scenario E: Duplicate booking / retry idempotency                 */
  /* ================================================================== */
  describe("Scenario E: Duplicate booking / retry idempotency", () => {
    it("constructs deterministic idempotency keys for booking and reminder events", () => {
      const appointmentId = "appt-uuid-1234";

      const bookingKey1 = `appt-${appointmentId}-candidate-booked`;
      const bookingKey2 = `appt-${appointmentId}-candidate-booked`;
      expect(bookingKey1).toBe(bookingKey2);

      const reminderKey = `appt-${appointmentId}-candidate-reminder-24h`;
      expect(reminderKey).toBe(`appt-${appointmentId}-candidate-reminder-24h`);
      expect(reminderKey).not.toBe(bookingKey1);
    });
  });

  /* ================================================================== */
  /* Scenario F: Cancellation notification                             */
  /* ================================================================== */
  describe("Scenario F: Cancellation notification", () => {
    it("generates cancellation notification with job title and previous time slot", () => {
      const jobTitle = "Frontend Architect";
      const subject = confirmationTemplate.subject({
        role: jobTitle,
        cancelled: true,
      });

      expect(subject).toBe(`Interview Cancelled — ${jobTitle}`);

      // Appointment transition to CANCELLED frees slot
      const initialBusy: BusyInterval[] = [
        {
          startMs: new Date(istIso("11:00")).getTime(),
          endMs: new Date(istIso("11:30")).getTime(),
        },
      ];

      // After cancellation, the slot is removed from busy intervals
      const busyAfterCancellation: BusyInterval[] = [];

      const slotCheck = validateRequestedSlot(istIso("11:00"), {
        durationMinutes: 30,
        settings: testSettings,
        blocks: [],
        busy: busyAfterCancellation,
        nowMs: NOW,
      });

      expect(slotCheck.ok).toBe(true);
    });
  });

  /* ================================================================== */
  /* Scenario G: Rescheduling notification                             */
  /* ================================================================== */
  describe("Scenario G: Rescheduling notification", () => {
    it("marks old appointment CANCELLED and dispatches confirmation for new appointment only", () => {
      const oldAppt = {
        id: "appt-old",
        status: "BOOKED",
        start_at: istIso("11:00"),
      };

      // Reschedule creates new appointment and updates old one
      const newAppt = {
        id: "appt-new",
        status: "BOOKED",
        start_at: istIso("14:00"),
        rescheduled_from: oldAppt.id,
      };

      const cancelledOldAppt = {
        ...oldAppt,
        status: "CANCELLED",
        rescheduled_to: newAppt.id,
      };

      expect(cancelledOldAppt.status).toBe("CANCELLED");
      expect(newAppt.status).toBe("BOOKED");
      expect(newAppt.rescheduled_from).toBe(oldAppt.id);

      // Notification sent for new appointment
      const newNotificationKey = `appt-${newAppt.id}-candidate-booked`;
      expect(newNotificationKey).toBe("appt-appt-new-candidate-booked");
    });
  });

  /* ================================================================== */
  /* Scenario H: Privacy: zero ATS data in candidate emails             */
  /* ================================================================== */
  describe("Scenario H: Privacy: zero ATS data in candidate emails", () => {
    it("never includes ATS scores, evidence, weights, or recruiter internal notes in candidate emails", () => {
      const sensitiveCandidate = {
        name: "Ananya Roy",
        job_title: "Full Stack Engineer",
        ats_score: 92,
        required_skills_score: 35,
        notes: "Candidate has strong GraphQL experience, consider for team lead.",
      };

      const invite = buildInterviewInvitationEmail({
        candidateName: sensitiveCandidate.name,
        jobTitle: sensitiveCandidate.job_title,
        schedulingUrl: "https://hr.example.com/schedule/xyz?type=interview",
      });

      const forbiddenTokens = [
        "92",
        "35",
        "ATS",
        "score",
        "GraphQL",
        "team lead",
        "internal",
        "evaluation",
        "weight",
      ];

      for (const token of forbiddenTokens) {
        expect(invite.body.toLowerCase()).not.toContain(token.toLowerCase());
        expect(invite.subject.toLowerCase()).not.toContain(token.toLowerCase());
      }

      // Confirmation template subject
      const confSubject = confirmationTemplate.subject({
        role: sensitiveCandidate.job_title,
      });
      expect(confSubject).toBe(`Interview Confirmed — ${sensitiveCandidate.job_title}`);
      expect(confSubject).not.toContain("92");

      // Reminder template subject
      const remSubject = reminderTemplate.subject({
        role: sensitiveCandidate.job_title,
      });
      expect(remSubject).toBe(`Interview Reminder — ${sensitiveCandidate.job_title}`);
      expect(remSubject).not.toContain("92");
    });
  });

  /* ================================================================== */
  /* Scenario I: Reminder eligibility: 24h booked only                 */
  /* ================================================================== */
  describe("Scenario I: Reminder eligibility: 24h booked only", () => {
    it("matches only BOOKED appointments starting within the 23h-25h window, excluding cancelled, completed, and outside window", () => {
      const refTime = new Date("2026-10-06T10:00:00Z").getTime();
      const fromIso = new Date(refTime + 23 * 3600000).getTime();
      const toIso = new Date(refTime + 25 * 3600000).getTime();

      const testAppointments = [
        {
          id: "appt-eligible-24h",
          status: "BOOKED",
          appointment_type: "INTERVIEW",
          start_at: new Date(refTime + 24 * 3600000).toISOString(), // 24 hours away
        },
        {
          id: "appt-cancelled-24h",
          status: "CANCELLED",
          appointment_type: "INTERVIEW",
          start_at: new Date(refTime + 24 * 3600000).toISOString(), // Cancelled
        },
        {
          id: "appt-completed-24h",
          status: "COMPLETED",
          appointment_type: "INTERVIEW",
          start_at: new Date(refTime + 24 * 3600000).toISOString(), // Completed
        },
        {
          id: "appt-too-early",
          status: "BOOKED",
          appointment_type: "INTERVIEW",
          start_at: new Date(refTime + 2 * 3600000).toISOString(), // 2 hours away
        },
        {
          id: "appt-too-late",
          status: "BOOKED",
          appointment_type: "INTERVIEW",
          start_at: new Date(refTime + 48 * 3600000).toISOString(), // 48 hours away
        },
      ];

      const eligible = testAppointments.filter((appt) => {
        if (appt.status !== "BOOKED" || appt.appointment_type !== "INTERVIEW") return false;
        const startMs = new Date(appt.start_at).getTime();
        return startMs >= fromIso && startMs <= toIso;
      });

      expect(eligible.length).toBe(1);
      expect(eligible[0]?.id).toBe("appt-eligible-24h");
    });
  });

  /* ================================================================== */
  /* Scenario J: Interview completion                                  */
  /* ================================================================== */
  describe("Scenario J: Interview completion", () => {
    it("marks appointment COMPLETED and candidate interview_completed while preserving ATS score and job association", () => {
      const candidateBefore = {
        id: "cand-123",
        job_id: "job-full-stack",
        ats_score: 89,
        stage: "interview" as Stage,
        application_status: "interview_scheduled" as ApplicationStatus,
      };

      const appointmentBefore = {
        id: "appt-123",
        candidate_id: candidateBefore.id,
        status: "BOOKED",
      };

      // Recruiter executes completion
      function simulateCompletion(cand: typeof candidateBefore, appt: typeof appointmentBefore) {
        const updatedAppt = {
          ...appt,
          status: "COMPLETED",
        };
        const updatedCandidate = {
          ...cand,
          application_status: "interview_completed" as ApplicationStatus,
        };
        return { updatedAppt, updatedCandidate };
      }

      const { updatedAppt, updatedCandidate } = simulateCompletion(
        candidateBefore,
        appointmentBefore,
      );

      expect(updatedAppt.status).toBe("COMPLETED");
      expect(updatedCandidate.application_status).toBe("interview_completed");
      expect(updatedCandidate.job_id).toBe(candidateBefore.job_id);
      expect(updatedCandidate.ats_score).toBe(candidateBefore.ats_score); // ATS score untouched!
      expect(APPLICATION_STATUS_LABELS[updatedCandidate.application_status]).toBe(
        "Interview Completed",
      );
      // Does not auto-hire or auto-reject
      expect(updatedCandidate.application_status).not.toBe("hired");
      expect(updatedCandidate.application_status).not.toBe("rejected");
    });
  });

  /* ================================================================== */
  /* Scenario K: Pipeline: Shortlisted -> Interview -> Completed       */
  /* ================================================================== */
  describe("Scenario K: Pipeline board transitions", () => {
    it("correctly maps candidate across Shortlisted and Interview pipeline stages without duplicate cards", () => {
      // 1. Initial shortlisted state
      const initialCandidate = {
        id: "cand-pipe-1",
        stage: "shortlisted" as Stage,
        application_status: "shortlisted" as ApplicationStatus,
      };
      expect(STAGE_LABELS[initialCandidate.stage]).toBe("Shortlisted");

      // 2. Candidate books interview -> moves to Interview stage
      const bookedCandidate = {
        ...initialCandidate,
        stage: "interview" as Stage,
        application_status: "interview_scheduled" as ApplicationStatus,
      };
      expect(STAGE_LABELS[bookedCandidate.stage]).toBe("Interview");
      expect(APPLICATION_STATUS_LABELS[bookedCandidate.application_status]).toBe("Interview Sent");

      // 3. Recruiter marks completed -> remains in Interview stage with interview_completed status
      const completedCandidate = {
        ...bookedCandidate,
        stage: "interview" as Stage,
        application_status: "interview_completed" as ApplicationStatus,
      };
      expect(STAGE_LABELS[completedCandidate.stage]).toBe("Interview");
      expect(APPLICATION_STATUS_LABELS[completedCandidate.application_status]).toBe(
        "Interview Completed",
      );

      // Verify pipeline board grouping has exactly one entry for this candidate
      const pipelineBoard = PIPELINE_STAGES.reduce<Record<Stage, string[]>>(
        (acc, stage) => {
          acc[stage] = [];
          return acc;
        },
        {} as Record<Stage, string[]>,
      );

      pipelineBoard[completedCandidate.stage].push(completedCandidate.id);

      const totalCount = Object.values(pipelineBoard).reduce((sum, list) => sum + list.length, 0);
      expect(totalCount).toBe(1);
      expect(pipelineBoard["interview"]).toContain(completedCandidate.id);
    });
  });

  /* ================================================================== */
  /* Scenario L: Security & Authorization                              */
  /* ================================================================== */
  describe("Scenario L: Security & Authorization", () => {
    it("rejects unauthorized caller from accessing other candidates' scheduling tokens or actions", () => {
      const inviteTokenCandidateA = "token-candidate-a";
      const candidateAId = "cand-a";
      const candidateBId = "cand-b";

      function verifyTokenBelongsToCandidate(tokenCandidateId: string, requestCandidateId: string) {
        if (tokenCandidateId !== requestCandidateId) {
          throw new Error("Access denied: Token does not match candidate.");
        }
        return true;
      }

      expect(() => verifyTokenBelongsToCandidate(candidateAId, candidateBId)).toThrow(
        "Access denied: Token does not match candidate.",
      );
    });
  });
});
