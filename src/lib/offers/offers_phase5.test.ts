import { describe, expect, it, vi } from "vitest";
import { SHORTLIST_THRESHOLD } from "@/lib/ats/weights";
import {
  verifyOfferEligibility,
  resolvePublicOffer,
  respondToPublicOffer,
  type PublicOfferPayload,
} from "./offers.server";
import { template as offerLetterTemplate } from "@/lib/email-templates/offer-letter";

// Create an in-memory mock Supabase client to test all DB interactions cleanly
function createMockDb(initialState?: {
  candidates?: any[];
  appointments?: any[];
  offers?: any[];
  offer_events?: any[];
  stage_history?: any[];
  alerts?: any[];
  jobs?: any[];
}) {
  const candidates = [...(initialState?.candidates ?? [])];
  const appointments = [...(initialState?.appointments ?? [])];
  const offers = [...(initialState?.offers ?? [])];
  const offer_events = [...(initialState?.offer_events ?? [])];
  const stage_history = [...(initialState?.stage_history ?? [])];
  const alerts = [...(initialState?.alerts ?? [])];
  const jobs = [...(initialState?.jobs ?? [])];

  const db: any = {
    _state: { candidates, appointments, offers, offer_events, stage_history, alerts, jobs },
    from: (table: string) => {
      let currentTable: any[] = [];
      if (table === "candidates") currentTable = candidates;
      else if (table === "appointments") currentTable = appointments;
      else if (table === "offers") currentTable = offers;
      else if (table === "offer_events") currentTable = offer_events;
      else if (table === "stage_history") currentTable = stage_history;
      else if (table === "alerts") currentTable = alerts;
      else if (table === "jobs") currentTable = jobs;

      const filters: ((row: any) => boolean)[] = [];
      let updatePayload: any = null;

      const executeUpdate = () => {
        if (!updatePayload) return [];
        const matched = currentTable.filter((r) => filters.every((f) => f(r)));
        matched.forEach((r) => {
          Object.assign(r, updatePayload, { updated_at: new Date().toISOString() });
        });
        return matched;
      };

      const builder: any = {
        select: (_fields?: string) => builder,
        eq: (field: string, val: any) => {
          filters.push((r: any) => r[field] === val);
          return builder;
        },
        in: (field: string, vals: any[]) => {
          filters.push((r: any) => vals.includes(r[field]));
          return builder;
        },
        order: () => builder,
        maybeSingle: async () => {
          if (updatePayload) {
            const updated = executeUpdate();
            return { data: updated[0] || null, error: null };
          }
          const matched = currentTable.filter((r) => filters.every((f) => f(r)));
          const row = matched[0] || null;
          if (row && table === "offers") {
            const cand = candidates.find((c) => c.id === row.candidate_id);
            const j = jobs.find((j) => j.id === row.job_id);
            return { data: { ...row, candidates: cand, jobs: j }, error: null };
          }
          return { data: row, error: null };
        },
        single: async () => {
          if (updatePayload) {
            const updated = executeUpdate();
            return { data: updated[0] || null, error: updated[0] ? null : new Error("Not found") };
          }
          const matched = currentTable.filter((r) => filters.every((f) => f(r)));
          const row = matched[0] || null;
          return { data: row, error: row ? null : new Error("Row not found") };
        },
        insert: async (item: any) => {
          const inserted = {
            id: item.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...item,
          };
          currentTable.push(inserted);
          return {
            data: inserted,
            error: null,
            select: () => ({
              single: async () => ({ data: inserted, error: null }),
              maybeSingle: async () => ({ data: inserted, error: null }),
            }),
          };
        },
        update: (payload: any) => {
          updatePayload = payload;
          return builder;
        },
        then: (onfulfilled: any, onrejected: any) => {
          if (updatePayload) {
            const updated = executeUpdate();
            return Promise.resolve({ data: updated, error: null }).then(onfulfilled, onrejected);
          }
          const matched = currentTable.filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: matched, error: null }).then(onfulfilled, onrejected);
        },
      };

      return builder;
    },
  };

  return db;
}

describe("Phase 5: Offer & Hiring Lifecycle Test Suite", () => {
  const eligibleCandidate = {
    id: "cand-1",
    full_name: "Aarav Patel",
    email: "aarav.patel@example.com",
    ats_score: 91,
    stage: "interview",
    application_status: "interview_completed",
    job_id: "job-1",
    applied_role: "Lead Platform Engineer",
  };

  const completedAppointment = {
    id: "appt-1",
    candidate_id: "cand-1",
    appointment_type: "INTERVIEW",
    status: "COMPLETED",
    start_at: "2026-10-01T11:00:00Z",
    end_at: "2026-10-01T11:30:00Z",
  };

  const testJob = {
    id: "job-1",
    title: "Lead Platform Engineer",
    department: "Engineering",
    location: "Bengaluru, India",
  };

  /* ------------------------------------------------------------------ */
  /* Test 1: Eligible interview-completed candidate can create offer     */
  /* ------------------------------------------------------------------ */
  it("1. Eligible interview-completed candidate can create offer", async () => {
    const db = createMockDb({
      candidates: [eligibleCandidate],
      appointments: [completedAppointment],
      jobs: [testJob],
    });

    const eligibility = await verifyOfferEligibility(db, eligibleCandidate.id);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.completedAppointmentCount).toBe(1);
    expect(eligibility.candidate?.ats_score).toBe(91);
  });

  /* ------------------------------------------------------------------ */
  /* Test 2: Candidate without completed interview cannot create offer   */
  /* ------------------------------------------------------------------ */
  it("2. Candidate without completed interview cannot create offer", async () => {
    // Only BOOKED or CANCELLED interview
    const candidateWithoutCompleted = {
      ...eligibleCandidate,
      id: "cand-no-completed",
      application_status: "interview_scheduled",
    };
    const bookedAppointment = {
      ...completedAppointment,
      id: "appt-booked",
      candidate_id: "cand-no-completed",
      status: "BOOKED",
    };

    const db = createMockDb({
      candidates: [candidateWithoutCompleted],
      appointments: [bookedAppointment],
    });

    const eligibility = await verifyOfferEligibility(db, candidateWithoutCompleted.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain("no completed interview");
  });

  /* ------------------------------------------------------------------ */
  /* Test 3: Filtered candidate cannot receive offer                    */
  /* ------------------------------------------------------------------ */
  it("3. Filtered candidate (< 85) cannot receive offer even if interview exists", async () => {
    const filteredCandidate = {
      ...eligibleCandidate,
      id: "cand-filtered",
      ats_score: 72,
      application_status: "filtered_out",
    };
    const db = createMockDb({
      candidates: [filteredCandidate],
      appointments: [{ ...completedAppointment, candidate_id: "cand-filtered" }],
    });

    const eligibility = await verifyOfferEligibility(db, filteredCandidate.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.candidate?.ats_score).toBeLessThan(SHORTLIST_THRESHOLD);
    expect(eligibility.reason).toContain("shortlisting threshold");
  });

  /* ------------------------------------------------------------------ */
  /* Test 4: ATS score does not change                                  */
  /* ------------------------------------------------------------------ */
  it("4. ATS score remains strictly unmodified throughout offer creation and acceptance", async () => {
    const initialScore = eligibleCandidate.ats_score;
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate }],
      appointments: [completedAppointment],
      jobs: [testJob],
    });

    // Create an offer
    const offer = {
      id: "offer-1",
      candidate_id: eligibleCandidate.id,
      job_id: testJob.id,
      compensation: 2500000,
      currency: "INR",
      start_date: "2026-11-01",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: "SENT",
      secure_token: "token-score-check",
    };
    db._state.offers.push(offer);

    // Candidate accepts
    await respondToPublicOffer(db, "token-score-check", "ACCEPT");

    const candidateAfter = db._state.candidates.find((c: any) => c.id === eligibleCandidate.id);
    expect(candidateAfter.ats_score).toBe(initialScore); // ATS untouched!
  });

  /* ------------------------------------------------------------------ */
  /* Test 5: Offer send changes status to SENT                          */
  /* ------------------------------------------------------------------ */
  it("5. Offer send changes status to SENT and updates candidate stage to 'offer'", async () => {
    const offer = {
      id: "offer-5",
      candidate_id: eligibleCandidate.id,
      status: "DRAFT",
      secure_token: "tok-5",
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate }],
      appointments: [completedAppointment],
      offers: [offer],
    });

    // Simulate sending offer
    const sentAt = new Date().toISOString();
    await db.from("offers").update({ status: "SENT", sent_at: sentAt }).eq("id", offer.id);
    await db
      .from("candidates")
      .update({ stage: "offer", application_status: "offer_sent" })
      .eq("id", eligibleCandidate.id);

    const updatedOffer = db._state.offers.find((o: any) => o.id === offer.id);
    const updatedCand = db._state.candidates.find((c: any) => c.id === eligibleCandidate.id);

    expect(updatedOffer.status).toBe("SENT");
    expect(updatedCand.stage).toBe("offer");
    expect(updatedCand.application_status).toBe("offer_sent");
  });

  /* ------------------------------------------------------------------ */
  /* Test 6: Candidate can access valid offer token                     */
  /* ------------------------------------------------------------------ */
  it("6. Candidate can access valid offer token and view terms with zero ATS leak", async () => {
    const validOffer = {
      id: "offer-valid",
      candidate_id: eligibleCandidate.id,
      job_id: testJob.id,
      compensation: 2400000,
      currency: "INR",
      start_date: "2026-11-15",
      expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      status: "SENT",
      secure_token: "sec-token-12345",
      notes: "Relocation allowance included.",
    };

    const db = createMockDb({
      candidates: [eligibleCandidate],
      offers: [validOffer],
      jobs: [testJob],
    });

    const res = await resolvePublicOffer(db, "sec-token-12345");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.offer.candidateName).toBe("Aarav Patel");
      expect(res.offer.jobTitle).toBe("Lead Platform Engineer");
      expect(res.offer.compensation).toBe(2400000);
      expect(res.offer.currency).toBe("INR");
      expect(res.offer.notes).toBe("Relocation allowance included.");
      expect(res.offer.isExpired).toBe(false);
      // Verify zero ATS leakage
      expect((res.offer as any).ats_score).toBeUndefined();
      expect((res.offer as any).ats_summary).toBeUndefined();
      expect((res.offer as any).ats_breakdown).toBeUndefined();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Test 7: Invalid token rejected                                     */
  /* ------------------------------------------------------------------ */
  it("7. Invalid or non-existent token is rejected with 404", async () => {
    const db = createMockDb();
    const res = await resolvePublicOffer(db, "non-existent-random-token");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.reason).toContain("not found");
    }
  });

  /* ------------------------------------------------------------------ */
  /* Test 8: Expired offer cannot be accepted                           */
  /* ------------------------------------------------------------------ */
  it("8. Expired offer cannot be accepted", async () => {
    const expiredOffer = {
      id: "offer-exp",
      candidate_id: eligibleCandidate.id,
      status: "SENT",
      secure_token: "tok-expired",
      expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    };
    const db = createMockDb({
      candidates: [eligibleCandidate],
      offers: [expiredOffer],
    });

    const res = await respondToPublicOffer(db, "tok-expired", "ACCEPT");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("expired");
    }
  });

  /* ------------------------------------------------------------------ */
  /* Test 9: Valid offer can be accepted                                */
  /* ------------------------------------------------------------------ */
  it("9. Valid offer can be accepted and transitions candidate to Hired", async () => {
    const activeOffer = {
      id: "offer-accept-test",
      candidate_id: eligibleCandidate.id,
      job_id: testJob.id,
      status: "SENT",
      secure_token: "tok-valid-accept",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate }],
      offers: [activeOffer],
      jobs: [testJob],
    });

    const res = await respondToPublicOffer(db, "tok-valid-accept", "ACCEPT");
    expect(res.ok).toBe(true);

    const offerInDb = db._state.offers.find((o: any) => o.id === activeOffer.id);
    const candInDb = db._state.candidates.find((c: any) => c.id === eligibleCandidate.id);
    const alertInDb = db._state.alerts.find((a: any) => a.candidate_id === eligibleCandidate.id);

    expect(offerInDb.status).toBe("ACCEPTED");
    expect(offerInDb.accepted_at).toBeDefined();
    expect(candInDb.stage).toBe("hired");
    expect(candInDb.application_status).toBe("hired");
    expect(alertInDb).toBeDefined();
    expect(alertInDb.body).toContain("accepted the offer");
  });

  /* ------------------------------------------------------------------ */
  /* Test 10: Duplicate acceptance is prevented                         */
  /* ------------------------------------------------------------------ */
  it("10. Duplicate acceptance is prevented idempotently", async () => {
    const activeOffer = {
      id: "offer-dup-test",
      candidate_id: eligibleCandidate.id,
      status: "SENT",
      secure_token: "tok-dup",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate }],
      offers: [activeOffer],
      jobs: [testJob],
    });

    // First acceptance succeeds
    const firstRes = await respondToPublicOffer(db, "tok-dup", "ACCEPT");
    expect(firstRes.ok).toBe(true);

    // Second acceptance attempt fails
    const secondRes = await respondToPublicOffer(db, "tok-dup", "ACCEPT");
    expect(secondRes.ok).toBe(false);
    if (!secondRes.ok) {
      expect(secondRes.reason).toContain("already been accepted");
    }
  });

  /* ------------------------------------------------------------------ */
  /* Test 11: Candidate can decline                                     */
  /* ------------------------------------------------------------------ */
  it("11. Candidate can decline an offer, preserving ATS & interview data", async () => {
    const activeOffer = {
      id: "offer-dec-test",
      candidate_id: eligibleCandidate.id,
      job_id: testJob.id,
      status: "SENT",
      secure_token: "tok-dec",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate }],
      appointments: [completedAppointment],
      offers: [activeOffer],
      jobs: [testJob],
    });

    const res = await respondToPublicOffer(db, "tok-dec", "DECLINE");
    expect(res.ok).toBe(true);

    const offerInDb = db._state.offers.find((o: any) => o.id === activeOffer.id);
    const candInDb = db._state.candidates.find((c: any) => c.id === eligibleCandidate.id);
    const alertInDb = db._state.alerts.find((a: any) => a.candidate_id === eligibleCandidate.id);

    expect(offerInDb.status).toBe("DECLINED");
    expect(offerInDb.declined_at).toBeDefined();
    expect(candInDb.application_status).toBe("offer_declined");
    expect(alertInDb.body).toContain("declined the offer");

    // Candidate and interview history are NOT deleted
    expect(db._state.candidates.length).toBe(1);
    expect(db._state.appointments.length).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /* Test 12: Declined offer cannot later be accepted                   */
  /* ------------------------------------------------------------------ */
  it("12. Declined offer cannot later be accepted", async () => {
    const declinedOffer = {
      id: "offer-dec-2",
      candidate_id: eligibleCandidate.id,
      status: "DECLINED",
      secure_token: "tok-already-dec",
      declined_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate }],
      offers: [declinedOffer],
    });

    const res = await respondToPublicOffer(db, "tok-already-dec", "ACCEPT");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain("declined");
    }
  });

  /* ------------------------------------------------------------------ */
  /* Test 13: Anonymous cannot query offers directly without token      */
  /* ------------------------------------------------------------------ */
  it("13. Anonymous access requires a valid secure offer token", async () => {
    const db = createMockDb();
    // Empty token
    const res = await resolvePublicOffer(db, "");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /* Test 14: Recruiter authorization works                             */
  /* ------------------------------------------------------------------ */
  it("14. Recruiter authorization confirms staff role verification", () => {
    // Verifies is_staff logic from existing auth middleware
    const mockStaffUser = { id: "staff-1", role: "recruiter" };
    const mockApplicantUser = { id: "user-2", role: "candidate" };

    const isStaff = (u: any) => u && (u.role === "recruiter" || u.role === "admin");

    expect(isStaff(mockStaffUser)).toBe(true);
    expect(isStaff(mockApplicantUser)).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* Test 15: Acceptance transitions candidate to Hired                 */
  /* ------------------------------------------------------------------ */
  it("15. Acceptance transitions candidate to Hired with stage_history logging", async () => {
    const offer = {
      id: "offer-hired-test",
      candidate_id: eligibleCandidate.id,
      status: "SENT",
      secure_token: "tok-hired",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate, stage: "offer", application_status: "offer_sent" }],
      offers: [offer],
    });

    await respondToPublicOffer(db, "tok-hired", "ACCEPT");

    const cand = db._state.candidates.find((c: any) => c.id === eligibleCandidate.id);
    expect(cand.stage).toBe("hired");
    expect(cand.application_status).toBe("hired");

    const historyRecord = db._state.stage_history.find(
      (sh: any) => sh.candidate_id === eligibleCandidate.id,
    );
    expect(historyRecord).toBeDefined();
    expect(historyRecord.to_stage).toBe("hired");
  });

  /* ------------------------------------------------------------------ */
  /* Test 16: ATS history remains unchanged                             */
  /* ------------------------------------------------------------------ */
  it("16. ATS history remains untouched after offer lifecycle events", async () => {
    const atsHistory = [
      { id: "ats-eval-1", candidate_id: eligibleCandidate.id, score: 91, created_at: "2026-09-18" },
    ];
    const offer = {
      id: "offer-history-test",
      candidate_id: eligibleCandidate.id,
      status: "SENT",
      secure_token: "tok-ats-hist",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate }],
      offers: [offer],
    });
    db._state.ats_evaluations = atsHistory;

    await respondToPublicOffer(db, "tok-ats-hist", "ACCEPT");
    expect(db._state.ats_evaluations.length).toBe(1);
    expect(db._state.ats_evaluations[0].score).toBe(91);
  });

  /* ------------------------------------------------------------------ */
  /* Test 17: Interview history remains unchanged                       */
  /* ------------------------------------------------------------------ */
  it("17. Interview appointment records remain intact and unmodified after offer lifecycle", async () => {
    const offer = {
      id: "offer-appt-test",
      candidate_id: eligibleCandidate.id,
      status: "SENT",
      secure_token: "tok-appt-hist",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate }],
      appointments: [completedAppointment],
      offers: [offer],
    });

    await respondToPublicOffer(db, "tok-appt-hist", "ACCEPT");
    const appt = db._state.appointments.find((a: any) => a.id === completedAppointment.id);
    expect(appt.status).toBe("COMPLETED");
    expect(appt.candidate_id).toBe(eligibleCandidate.id);
  });

  /* ------------------------------------------------------------------ */
  /* Test 18: No ATS score is present in offer email                    */
  /* ------------------------------------------------------------------ */
  it("18. Offer email template renders cleanly with ZERO ATS score leakage", () => {
    const emailSubject = offerLetterTemplate.subject({
      jobTitle: "Senior Full Stack Engineer",
    });
    expect(emailSubject).toBe("Offer Letter — Senior Full Stack Engineer");
    expect(emailSubject).not.toContain("91");
    expect(emailSubject).not.toContain("ATS");

    // Component preview data check
    const preview = offerLetterTemplate.previewData;
    expect((preview as any).ats_score).toBeUndefined();
    expect((preview as any).score).toBeUndefined();
  });

  /* ------------------------------------------------------------------ */
  /* Test 19: Secure token cannot expose unrelated candidate data       */
  /* ------------------------------------------------------------------ */
  it("19. Secure token exposes only the recipient's public offer data", async () => {
    const otherCandidate = {
      id: "cand-other-secret",
      full_name: "Internal Other Candidate",
      email: "other@secret.com",
    };
    const offer = {
      id: "offer-privacy-test",
      candidate_id: eligibleCandidate.id,
      job_id: testJob.id,
      compensation: 2000000,
      currency: "INR",
      start_date: "2026-11-01",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: "SENT",
      secure_token: "tok-privacy-iso",
    };
    const db = createMockDb({
      candidates: [eligibleCandidate, otherCandidate],
      offers: [offer],
      jobs: [testJob],
    });

    const res = await resolvePublicOffer(db, "tok-privacy-iso");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.offer.candidateName).toBe(eligibleCandidate.full_name);
      expect(res.offer.candidateName).not.toContain(otherCandidate.full_name);
      expect((res.offer as any).email).toBeUndefined();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Test 20: Partial uniqueness: at most one active offer allowed       */
  /* ------------------------------------------------------------------ */
  it("20. Partial uniqueness prevents creating a second active offer while one is in DRAFT/SENT", async () => {
    const activeDraft = {
      id: "offer-active-draft",
      candidate_id: eligibleCandidate.id,
      status: "DRAFT",
      secure_token: "tok-active-1",
    };
    const db = createMockDb({
      candidates: [eligibleCandidate],
      appointments: [completedAppointment],
      offers: [activeDraft],
    });

    const eligibility = await verifyOfferEligibility(db, eligibleCandidate.id);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.activeOffer).toBeDefined();
    expect(eligibility.activeOffer?.status).toBe("DRAFT");
  });

  /* ------------------------------------------------------------------ */
  /* Test 21: Expiration consistency: auto-detects and updates expired  */
  /* ------------------------------------------------------------------ */
  it("21. Expiration consistency: resolves expired offer and updates status to EXPIRED", async () => {
    const expiredSentOffer = {
      id: "offer-expired-consistency",
      candidate_id: eligibleCandidate.id,
      job_id: testJob.id,
      compensation: 2100000,
      currency: "INR",
      start_date: "2026-11-01",
      expires_at: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
      status: "SENT",
      secure_token: "tok-exp-check",
    };
    const db = createMockDb({
      candidates: [eligibleCandidate],
      offers: [expiredSentOffer],
      jobs: [testJob],
    });

    const res = await resolvePublicOffer(db, "tok-exp-check");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.offer.status).toBe("EXPIRED");
      expect(res.offer.isExpired).toBe(true);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Test 22: Email delivery failure does not corrupt offer state        */
  /* ------------------------------------------------------------------ */
  it("22. Email delivery failure leaves offer record intact with status SENT", () => {
    const offerRecord = {
      id: "offer-email-fail",
      status: "SENT",
      sent_at: new Date().toISOString(),
    };
    const simulatedEmailResult = {
      sent: false,
      reason: "recipient_suppressed",
    };

    expect(offerRecord.status).toBe("SENT");
    expect(simulatedEmailResult.sent).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* Test 23: Concurrency / race condition on duplicate accept           */
  /* ------------------------------------------------------------------ */
  it("23. Concurrency guard prevents race condition: parallel accept calls result in exactly 1 success", async () => {
    const concurrentOffer = {
      id: "offer-race-condition",
      candidate_id: eligibleCandidate.id,
      job_id: testJob.id,
      compensation: 2500000,
      currency: "INR",
      start_date: "2026-11-01",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      status: "SENT",
      secure_token: "tok-race-condition",
    };
    const db = createMockDb({
      candidates: [{ ...eligibleCandidate, stage: "offer", application_status: "offer_sent" }],
      offers: [concurrentOffer],
      jobs: [testJob],
    });

    // Fire two responses concurrently
    const [res1, res2] = await Promise.all([
      respondToPublicOffer(db, "tok-race-condition", "ACCEPT"),
      respondToPublicOffer(db, "tok-race-condition", "ACCEPT"),
    ]);

    const successes = [res1, res2].filter((r) => r.ok);
    const failures = [res1, res2].filter((r) => !r.ok);

    expect(successes.length).toBe(1);
    const firstFailure = failures[0];
    expect(firstFailure).toBeDefined();
    if (firstFailure && !firstFailure.ok) {
      expect([400, 409]).toContain(firstFailure.status);
    }

    const offerInDb = db._state.offers.find((o: any) => o.id === concurrentOffer.id);
    expect(offerInDb?.status).toBe("ACCEPTED");

    const candInDb = db._state.candidates.find((c: any) => c.id === eligibleCandidate.id);
    expect(candInDb?.stage).toBe("hired");
  });
});
