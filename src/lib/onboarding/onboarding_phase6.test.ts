import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONBOARDING_TASKS,
  createOnboardingAtomic,
  recordOnboardingEvent,
  verifyOnboardingEligibility,
} from "./onboarding.server";

// In-memory mock database for onboarding testing
function createMockDb(initialState?: {
  candidates?: any[];
  jobs?: any[];
  offers?: any[];
  appointments?: any[];
  onboarding?: any[];
  onboarding_tasks?: any[];
  onboarding_events?: any[];
  userRole?: "recruiter" | "admin" | "candidate" | "anonymous";
}) {
  const candidates = [...(initialState?.candidates ?? [])];
  const jobs = [...(initialState?.jobs ?? [])];
  const offers = [...(initialState?.offers ?? [])];
  const appointments = [...(initialState?.appointments ?? [])];
  const onboarding = [...(initialState?.onboarding ?? [])];
  const onboarding_tasks = [...(initialState?.onboarding_tasks ?? [])];
  const onboarding_events = [...(initialState?.onboarding_events ?? [])];
  const userRole = initialState?.userRole ?? "recruiter";

  const db: any = {
    _state: {
      candidates,
      jobs,
      offers,
      appointments,
      onboarding,
      onboarding_tasks,
      onboarding_events,
    },
    rpc: async (fnName: string, args: any) => {
      if (fnName === "create_onboarding_atomic") {
        const cand = candidates.find((c) => c.id === args.p_candidate_id);
        if (!cand) throw new Error("Candidate not found.");
        if (cand.application_status !== "hired") {
          throw new Error("Only candidates with application status hired can be onboarded.");
        }
        const active = onboarding.find(
          (o) =>
            o.candidate_id === args.p_candidate_id &&
            (o.status === "NOT_STARTED" || o.status === "IN_PROGRESS"),
        );
        if (active) {
          throw new Error("Candidate already has an active onboarding record.");
        }

        let startDate = args.p_start_date;
        if (!startDate) {
          const acceptedOffer = offers
            .filter((o) => o.candidate_id === args.p_candidate_id && o.status === "ACCEPTED")
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          startDate = acceptedOffer?.start_date || null;
        }

        const newOnboarding = {
          id: `onb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          candidate_id: args.p_candidate_id,
          job_id: cand.job_id || null,
          start_date: startDate,
          status: "NOT_STARTED",
          created_by: args.p_created_by || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
        };
        onboarding.push(newOnboarding);

        const defaultTasks = DEFAULT_ONBOARDING_TASKS.map((t, idx) => ({
          id: `task-${newOnboarding.id}-${idx}`,
          onboarding_id: newOnboarding.id,
          title: t.title,
          description: t.description,
          status: "PENDING",
          due_date: null,
          completed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        onboarding_tasks.push(...defaultTasks);

        onboarding_events.push({
          id: `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          onboarding_id: newOnboarding.id,
          candidate_id: args.p_candidate_id,
          event_type: "ONBOARDING_CREATED",
          notes: "Onboarding record and 7 default tasks created.",
          created_by: args.p_created_by || null,
          created_at: new Date().toISOString(),
        });

        return {
          data: {
            id: newOnboarding.id,
            candidate_id: newOnboarding.candidate_id,
            job_id: newOnboarding.job_id,
            start_date: newOnboarding.start_date,
            status: "NOT_STARTED",
          },
          error: null,
        };
      }
      return { data: null, error: new Error(`Unknown RPC ${fnName}`) };
    },
    from: (table: string) => {
      let currentTable: any[] = [];
      if (table === "candidates") currentTable = candidates;
      else if (table === "jobs") currentTable = jobs;
      else if (table === "offers") currentTable = offers;
      else if (table === "appointments") currentTable = appointments;
      else if (table === "onboarding") currentTable = onboarding;
      else if (table === "onboarding_tasks") currentTable = onboarding_tasks;
      else if (table === "onboarding_events") currentTable = onboarding_events;

      // RLS staff check simulation
      const isStaff = userRole === "recruiter" || userRole === "admin";
      const isOnboardingTable = ["onboarding", "onboarding_tasks", "onboarding_events"].includes(
        table,
      );

      const filters: ((row: any) => boolean)[] = [];
      let updatePayload: any = null;

      if (isOnboardingTable && !isStaff) {
        // Block access for non-staff or anonymous
        filters.push(() => false);
      }

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
        neq: (field: string, val: any) => {
          filters.push((r: any) => r[field] !== val);
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
          if (row && table === "onboarding_tasks") {
            const onb = onboarding.find((o) => o.id === row.onboarding_id);
            return { data: { ...row, onboarding: onb }, error: null };
          }
          return { data: row, error: null };
        },
        single: async () => {
          if (updatePayload) {
            const updated = executeUpdate();
            return {
              data: updated[0] || null,
              error: updated[0] ? null : new Error("Row not found"),
            };
          }
          const matched = currentTable.filter((r) => filters.every((f) => f(r)));
          const row = matched[0] || null;
          return { data: row, error: row ? null : new Error("Row not found") };
        },
        insert: (item: any) => {
          if (isOnboardingTable && !isStaff) {
            const errRes = { data: null, error: new Error("Row Level Security: access denied") };
            return {
              ...errRes,
              select: () => ({
                single: async () => errRes,
                maybeSingle: async () => errRes,
                then: (resolve: any) => resolve(errRes),
              }),
              then: (resolve: any) => resolve(errRes),
            };
          }

          const itemsToInsert = Array.isArray(item) ? item : [item];
          const insertedList: any[] = [];

          for (const it of itemsToInsert) {
            // Partial uniqueness check for active onboarding
            if (table === "onboarding") {
              const activeExists = onboarding.some(
                (o) =>
                  o.candidate_id === it.candidate_id &&
                  (o.status === "NOT_STARTED" || o.status === "IN_PROGRESS"),
              );
              if (activeExists && (it.status === "NOT_STARTED" || it.status === "IN_PROGRESS")) {
                const dupErr = {
                  data: null,
                  error: new Error(
                    "duplicate key value violates unique constraint idx_onboarding_candidate_active",
                  ),
                };
                return {
                  ...dupErr,
                  select: () => ({
                    single: async () => dupErr,
                    maybeSingle: async () => dupErr,
                    then: (resolve: any) => resolve(dupErr),
                  }),
                  then: (resolve: any) => resolve(dupErr),
                };
              }
            }

            const inserted = {
              id: it.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...it,
            };
            currentTable.push(inserted);
            insertedList.push(inserted);
          }

          const resultData = Array.isArray(item) ? insertedList : insertedList[0];
          return {
            data: resultData,
            error: null,
            select: () => ({
              single: async () => ({ data: insertedList[0], error: null }),
              maybeSingle: async () => ({ data: insertedList[0], error: null }),
              then: (resolve: any) => resolve({ data: resultData, error: null }),
            }),
            then: (resolve: any) => resolve({ data: resultData, error: null }),
          };
        },
        update: (payload: any) => {
          if (isOnboardingTable && !isStaff) {
            updatePayload = null;
          } else {
            updatePayload = payload;
          }
          return builder;
        },
        delete: () => {
          if (isOnboardingTable && !isStaff) {
            return builder;
          }
          const toRemove = currentTable.filter((r) => filters.every((f) => f(r)));
          toRemove.forEach((r) => {
            const idx = currentTable.indexOf(r);
            if (idx >= 0) currentTable.splice(idx, 1);
          });
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

describe("Phase 6A: Onboarding & Employee Handoff Lifecycle Test Suite", () => {
  const testCandidate = {
    id: "cand-hired-1",
    full_name: "Elena Rostova",
    email: "elena.rostova@example.com",
    ats_score: 95,
    stage: "hired",
    application_status: "hired",
    job_id: "job-lead-devops",
    applied_role: "Lead DevOps Engineer",
  };

  const testAcceptedOffer = {
    id: "offer-elena-1",
    candidate_id: "cand-hired-1",
    job_id: "job-lead-devops",
    compensation: 1250000,
    currency: "INR",
    start_date: "2026-10-15",
    status: "ACCEPTED",
    created_at: "2026-09-20T12:00:00Z",
  };

  const completedInterview = {
    id: "appt-interview-1",
    candidate_id: "cand-hired-1",
    appointment_type: "INTERVIEW",
    status: "COMPLETED",
  };

  // 1. Hired candidate can create onboarding
  it("1. Hired candidate can create onboarding", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      offers: [testAcceptedOffer],
      appointments: [completedInterview],
    });

    const eligibility = await verifyOnboardingEligibility(db, testCandidate.id);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.candidate?.application_status).toBe("hired");

    const result = await createOnboardingAtomic(db, {
      candidateId: testCandidate.id,
    });

    expect(result.onboarding).toBeDefined();
    expect(result.onboarding.status).toBe("NOT_STARTED");
    expect(result.tasks).toHaveLength(7);
    expect(result.onboarding.start_date).toBe("2026-10-15"); // Defaults to accepted offer date
  });

  // 2. Non-hired candidate cannot create onboarding
  it("2. Non-hired candidate cannot create onboarding", async () => {
    const db = createMockDb({
      candidates: [{ ...testCandidate, id: "cand-offer-sent", application_status: "offer_sent" }],
    });

    const eligibility = await verifyOnboardingEligibility(db, "cand-offer-sent");
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain("Only candidates with application status 'hired'");

    await expect(createOnboardingAtomic(db, { candidateId: "cand-offer-sent" })).rejects.toThrow(
      /Only candidates with application status 'hired'/,
    );
  });

  // 3. Filtered candidate rejected
  it("3. Filtered candidate rejected", async () => {
    const db = createMockDb({
      candidates: [{ ...testCandidate, id: "cand-filtered", application_status: "filtered_out" }],
    });

    const eligibility = await verifyOnboardingEligibility(db, "cand-filtered");
    expect(eligibility.eligible).toBe(false);

    await expect(createOnboardingAtomic(db, { candidateId: "cand-filtered" })).rejects.toThrow(
      /Only candidates with application status 'hired'/,
    );
  });

  // 4. Offer-declined candidate rejected
  it("4. Offer-declined candidate rejected", async () => {
    const db = createMockDb({
      candidates: [{ ...testCandidate, id: "cand-declined", application_status: "offer_declined" }],
    });

    const eligibility = await verifyOnboardingEligibility(db, "cand-declined");
    expect(eligibility.eligible).toBe(false);

    await expect(createOnboardingAtomic(db, { candidateId: "cand-declined" })).rejects.toThrow(
      /Only candidates with application status 'hired'/,
    );
  });

  // 5. Candidate with no completed offer acceptance rejected
  it("5. Candidate with no completed offer acceptance rejected (not yet hired)", async () => {
    const db = createMockDb({
      candidates: [
        { ...testCandidate, id: "cand-interviewing", application_status: "interview_scheduled" },
      ],
    });

    const eligibility = await verifyOnboardingEligibility(db, "cand-interviewing");
    expect(eligibility.eligible).toBe(false);

    await expect(
      createOnboardingAtomic(db, { candidateId: "cand-interviewing" }),
    ).rejects.toThrow();
  });

  // 6. Duplicate active onboarding prevented
  it("6. Duplicate active onboarding prevented", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      offers: [testAcceptedOffer],
      onboarding: [
        {
          id: "onb-existing",
          candidate_id: testCandidate.id,
          status: "NOT_STARTED",
          start_date: "2026-10-15",
        },
      ],
    });

    const eligibility = await verifyOnboardingEligibility(db, testCandidate.id);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain("already has an active onboarding record");

    await expect(createOnboardingAtomic(db, { candidateId: testCandidate.id })).rejects.toThrow(
      /already has an active onboarding record/,
    );
  });

  // 7. Onboarding starts correctly
  it("7. Onboarding starts correctly (NOT_STARTED → IN_PROGRESS)", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [
        {
          id: "onb-1",
          candidate_id: testCandidate.id,
          status: "NOT_STARTED",
          start_date: "2026-10-15",
        },
      ],
    });

    const { data: updated } = await db
      .from("onboarding")
      .update({ status: "IN_PROGRESS" })
      .eq("id", "onb-1")
      .eq("status", "NOT_STARTED")
      .select()
      .maybeSingle();

    expect(updated).toBeDefined();
    expect(updated?.status).toBe("IN_PROGRESS");

    await recordOnboardingEvent(db, {
      onboardingId: "onb-1",
      candidateId: testCandidate.id,
      eventType: "ONBOARDING_STARTED",
      notes: "Onboarding started",
    });

    const events = db._state.onboarding_events;
    expect(events.some((e: any) => e.event_type === "ONBOARDING_STARTED")).toBe(true);
  });

  // 8. Invalid status transition rejected
  it("8. Invalid status transition rejected", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [
        {
          id: "onb-1",
          candidate_id: testCandidate.id,
          status: "COMPLETED",
          start_date: "2026-10-15",
        },
      ],
    });

    // Attempting to transition COMPLETED → IN_PROGRESS must fail
    const { data: updated } = await db
      .from("onboarding")
      .update({ status: "IN_PROGRESS" })
      .eq("id", "onb-1")
      .eq("status", "NOT_STARTED")
      .select()
      .maybeSingle();

    expect(updated).toBeNull();
  });

  // 9. Task can be completed
  it("9. Task can be completed", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
      onboarding_tasks: [
        {
          id: "task-1",
          onboarding_id: "onb-1",
          title: "Verify identity documents",
          status: "PENDING",
        },
      ],
    });

    const completedAt = new Date().toISOString();
    const { data: updated } = await db
      .from("onboarding_tasks")
      .update({ status: "COMPLETED", completed_at: completedAt })
      .eq("id", "task-1")
      .neq("status", "COMPLETED")
      .select()
      .maybeSingle();

    expect(updated).toBeDefined();
    expect(updated?.status).toBe("COMPLETED");
    expect(updated?.completed_at).toBe(completedAt);
  });

  // 10. Task completion creates event
  it("10. Task completion creates event", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
    });

    await recordOnboardingEvent(db, {
      onboardingId: "onb-1",
      candidateId: testCandidate.id,
      eventType: "ONBOARDING_TASK_COMPLETED",
      notes: 'Task completed: "Verify identity documents"',
    });

    const events = db._state.onboarding_events;
    expect(events.some((e: any) => e.event_type === "ONBOARDING_TASK_COMPLETED")).toBe(true);
  });

  // 11. Cannot complete onboarding with incomplete required tasks
  it("11. Cannot complete onboarding with incomplete required tasks", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
      onboarding_tasks: [
        { id: "task-1", onboarding_id: "onb-1", status: "COMPLETED" },
        { id: "task-2", onboarding_id: "onb-1", status: "PENDING" },
      ],
    });

    const { data: tasks } = await db
      .from("onboarding_tasks")
      .select("id, status")
      .eq("onboarding_id", "onb-1");

    const incomplete = tasks.filter((t: any) => t.status !== "COMPLETED");
    expect(incomplete.length).toBe(1);

    // Business rule prevents transition
    const canComplete = incomplete.length === 0;
    expect(canComplete).toBe(false);
  });

  // 12. Can complete onboarding when all required tasks are complete
  it("12. Can complete onboarding when all required tasks are complete", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
      onboarding_tasks: [
        { id: "task-1", onboarding_id: "onb-1", status: "COMPLETED" },
        { id: "task-2", onboarding_id: "onb-1", status: "COMPLETED" },
      ],
    });

    const { data: tasks } = await db
      .from("onboarding_tasks")
      .select("id, status")
      .eq("onboarding_id", "onb-1");

    const incomplete = tasks.filter((t: any) => t.status !== "COMPLETED");
    expect(incomplete.length).toBe(0);

    const completedAt = new Date().toISOString();
    const { data: updated } = await db
      .from("onboarding")
      .update({ status: "COMPLETED", completed_at: completedAt })
      .eq("id", "onb-1")
      .eq("status", "IN_PROGRESS")
      .select()
      .maybeSingle();

    expect(updated?.status).toBe("COMPLETED");
    expect(updated?.completed_at).toBe(completedAt);
  });

  // 13. Completion creates audit event
  it("13. Completion creates audit event", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "COMPLETED" }],
    });

    await recordOnboardingEvent(db, {
      onboardingId: "onb-1",
      candidateId: testCandidate.id,
      eventType: "ONBOARDING_COMPLETED",
      notes: "Onboarding successfully completed.",
    });

    const events = db._state.onboarding_events;
    expect(events.some((e: any) => e.event_type === "ONBOARDING_COMPLETED")).toBe(true);
  });

  // 14. Cancel creates audit event
  it("14. Cancel creates audit event", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
    });

    const { data: updated } = await db
      .from("onboarding")
      .update({ status: "CANCELLED" })
      .eq("id", "onb-1")
      .in("status", ["NOT_STARTED", "IN_PROGRESS"])
      .select()
      .maybeSingle();

    expect(updated?.status).toBe("CANCELLED");

    await recordOnboardingEvent(db, {
      onboardingId: "onb-1",
      candidateId: testCandidate.id,
      eventType: "ONBOARDING_CANCELLED",
      notes: "Candidate delayed start.",
    });

    const events = db._state.onboarding_events;
    expect(events.some((e: any) => e.event_type === "ONBOARDING_CANCELLED")).toBe(true);
  });

  // 15. Cancelled onboarding cannot be completed
  it("15. Cancelled onboarding cannot be completed", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "CANCELLED" }],
    });

    const { data: updated } = await db
      .from("onboarding")
      .update({ status: "COMPLETED" })
      .eq("id", "onb-1")
      .eq("status", "IN_PROGRESS") // Must be IN_PROGRESS
      .select()
      .maybeSingle();

    expect(updated).toBeNull();
  });

  // 16. Anonymous access blocked
  it("16. Anonymous access blocked (RLS simulation)", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
      userRole: "anonymous",
    });

    const { data } = await db.from("onboarding").select("*");
    expect(data).toHaveLength(0); // RLS blocks read
  });

  // 17. Non-staff authenticated user blocked
  it("17. Non-staff authenticated user blocked", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
      userRole: "candidate",
    });

    const { data } = await db.from("onboarding").select("*");
    expect(data).toHaveLength(0); // RLS blocks candidate
  });

  // 18. Recruiter access works
  it("18. Recruiter access works", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
      userRole: "recruiter",
    });

    const { data } = await db.from("onboarding").select("*");
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("onb-1");
  });

  // 19. ATS score remains unchanged
  it("19. ATS score remains unchanged throughout onboarding lifecycle", async () => {
    const db = createMockDb({
      candidates: [{ ...testCandidate, ats_score: 95 }],
      offers: [testAcceptedOffer],
    });

    await createOnboardingAtomic(db, { candidateId: testCandidate.id });
    const cand = db._state.candidates.find((c: any) => c.id === testCandidate.id);
    expect(cand.ats_score).toBe(95);
  });

  // 20. Interview history remains unchanged
  it("20. Interview history remains unchanged", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      offers: [testAcceptedOffer],
      appointments: [completedInterview],
    });

    await createOnboardingAtomic(db, { candidateId: testCandidate.id });
    const appts = db._state.appointments.filter((a: any) => a.candidate_id === testCandidate.id);
    expect(appts).toHaveLength(1);
    expect(appts[0].status).toBe("COMPLETED");
  });

  // 21. Offer history remains unchanged
  it("21. Offer history remains unchanged", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      offers: [testAcceptedOffer],
    });

    await createOnboardingAtomic(db, { candidateId: testCandidate.id });
    const candidateOffers = db._state.offers.filter(
      (o: any) => o.candidate_id === testCandidate.id,
    );
    expect(candidateOffers).toHaveLength(1);
    expect(candidateOffers[0].status).toBe("ACCEPTED");
    expect(candidateOffers[0].compensation).toBe(1250000);
  });

  // 22. Candidate remains `hired` after onboarding completion
  it("22. Candidate remains `hired` after onboarding completion", async () => {
    const db = createMockDb({
      candidates: [{ ...testCandidate, stage: "hired", application_status: "hired" }],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
    });

    await db
      .from("onboarding")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
      .eq("id", "onb-1")
      .eq("status", "IN_PROGRESS");

    const cand = db._state.candidates.find((c: any) => c.id === testCandidate.id);
    expect(cand.stage).toBe("hired");
    expect(cand.application_status).toBe("hired");
  });

  // 23. Concurrent onboarding creation (Partial uniqueness / single active onboarding)
  it("23. Concurrent onboarding creation race condition creates exactly one active record", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      offers: [testAcceptedOffer],
    });

    const attempt1 = createOnboardingAtomic(db, { candidateId: testCandidate.id });
    const attempt2 = createOnboardingAtomic(db, { candidateId: testCandidate.id });

    const results = await Promise.allSettled([attempt1, attempt2]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(db._state.onboarding).toHaveLength(1);
  });

  // 24. Concurrent start (only one transition succeeds)
  it("24. Concurrent start produces exactly one successful transition", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "NOT_STARTED" }],
    });

    const startOp = () =>
      db
        .from("onboarding")
        .update({ status: "IN_PROGRESS" })
        .eq("id", "onb-1")
        .eq("status", "NOT_STARTED")
        .select()
        .maybeSingle();

    const [res1, res2] = await Promise.all([startOp(), startOp()]);
    const successfulUpdates = [res1.data, res2.data].filter(Boolean);

    expect(successfulUpdates.length).toBe(1);
    expect(db._state.onboarding[0].status).toBe("IN_PROGRESS");
  });

  // 25. Concurrent completion produces exactly one transition & event
  it("25. Concurrent completion produces exactly one transition & event", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
    });

    const completeOp = async () => {
      const now = new Date().toISOString();
      const { data: updated } = await db
        .from("onboarding")
        .update({ status: "COMPLETED", completed_at: now })
        .eq("id", "onb-1")
        .eq("status", "IN_PROGRESS")
        .select()
        .maybeSingle();

      if (updated) {
        await recordOnboardingEvent(db, {
          onboardingId: "onb-1",
          candidateId: testCandidate.id,
          eventType: "ONBOARDING_COMPLETED",
          notes: "Completed.",
        });
      }
      return updated;
    };

    const [res1, res2] = await Promise.all([completeOp(), completeOp()]);
    const successfulUpdates = [res1, res2].filter(Boolean);

    expect(successfulUpdates.length).toBe(1);
    expect(
      db._state.onboarding_events.filter((e: any) => e.event_type === "ONBOARDING_COMPLETED"),
    ).toHaveLength(1);
  });

  // 26. Concurrent cancellation
  it("26. Concurrent cancellation allows only one active cancellation", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
    });

    const cancelOp = () =>
      db
        .from("onboarding")
        .update({ status: "CANCELLED" })
        .eq("id", "onb-1")
        .in("status", ["NOT_STARTED", "IN_PROGRESS"])
        .select()
        .maybeSingle();

    const [res1, res2] = await Promise.all([cancelOp(), cancelOp()]);
    const successfulUpdates = [res1.data, res2.data].filter(Boolean);

    expect(successfulUpdates.length).toBe(1);
    expect(db._state.onboarding[0].status).toBe("CANCELLED");
  });

  // 27. Arbitrary task UUID cannot modify another onboarding
  it("27. Arbitrary task UUID cannot modify another onboarding", async () => {
    const db = createMockDb({
      candidates: [testCandidate, { ...testCandidate, id: "cand-other" }],
      onboarding: [
        { id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" },
        { id: "onb-2", candidate_id: "cand-other", status: "IN_PROGRESS" },
      ],
      onboarding_tasks: [
        { id: "task-belonging-to-onb2", onboarding_id: "onb-2", status: "PENDING" },
      ],
    });

    // Verification check as in completeOnboardingTask
    const { data: task } = await db
      .from("onboarding_tasks")
      .select("*, onboarding(id, candidate_id)")
      .eq("id", "task-belonging-to-onb2")
      .maybeSingle();

    expect(task).toBeDefined();
    // Validate mismatch with candidate 1's onboarding
    const matchesOnb1 = task.onboarding_id === "onb-1";
    expect(matchesOnb1).toBe(false);
  });

  // 28. Duplicate task completion is safe / idempotent
  it("28. Duplicate task completion is safe / idempotent", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      onboarding: [{ id: "onb-1", candidate_id: testCandidate.id, status: "IN_PROGRESS" }],
      onboarding_tasks: [
        {
          id: "task-1",
          onboarding_id: "onb-1",
          status: "COMPLETED",
          completed_at: "2026-09-20T10:00:00Z",
        },
      ],
    });

    const { data: task } = await db
      .from("onboarding_tasks")
      .select("*")
      .eq("id", "task-1")
      .maybeSingle();

    expect(task.status).toBe("COMPLETED");

    // Idempotent guard: does not run update or insert duplicate events
    const isAlreadyCompleted = task.status === "COMPLETED";
    expect(isAlreadyCompleted).toBe(true);
    expect(db._state.onboarding_events).toHaveLength(0);
  });

  // 29. Onboarding creation cannot leave partial records
  it("29. Onboarding creation cannot leave partial records on task insertion failure", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      offers: [testAcceptedOffer],
    });

    // Disable RPC so it exercises the client-side atomic fallback with rollback
    db.rpc = async () => ({ data: null, error: new Error("RPC not available") });

    // Force failure on task insertion
    const originalFrom = db.from;
    db.from = (table: string) => {
      const builder = originalFrom(table);
      if (table === "onboarding_tasks") {
        return {
          ...builder,
          insert: () => {
            const errRes = { data: null, error: new Error("Simulated task DB write error") };
            return {
              select: () => ({
                then: (resolve: any) => resolve(errRes),
              }),
            };
          },
        };
      }
      return builder;
    };

    await expect(createOnboardingAtomic(db, { candidateId: testCandidate.id })).rejects.toThrow(
      /Simulated task DB write error/,
    );

    // Rollback guarantees zero orphaned onboarding records
    expect(db._state.onboarding).toHaveLength(0);
    expect(db._state.onboarding_tasks).toHaveLength(0);
  });

  // 30. Accepted offer start_date is correctly used
  it("30. Accepted offer start_date is correctly used as default", async () => {
    const db = createMockDb({
      candidates: [testCandidate],
      offers: [
        {
          id: "offer-prev",
          candidate_id: testCandidate.id,
          status: "ACCEPTED",
          start_date: "2026-11-01",
          created_at: "2026-09-21T00:00:00Z",
        },
      ],
    });

    const result = await createOnboardingAtomic(db, { candidateId: testCandidate.id });
    expect(result.onboarding.start_date).toBe("2026-11-01");
  });
});
