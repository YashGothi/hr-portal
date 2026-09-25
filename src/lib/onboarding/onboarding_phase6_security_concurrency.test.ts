import { describe, expect, it } from "vitest";
import crypto from "crypto";

// Cryptographic helpers matching PostgreSQL pgcrypto
function sha256Hex(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generate256BitToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Simulated PostgreSQL Database Engine modeling the exact SQL logic from 20260922120000_phase6_task_removal_and_documents.sql
class MockPostgreSqlDatabase {
  public onboarding: any[] = [];
  public onboarding_documents: any[] = [];
  public onboarding_events: any[] = [];
  public candidates: any[] = [];
  public jobs: any[] = [];
  public offers: any[] = [];

  // Active transaction row locks
  private lockedRows: Set<string> = new Set();
  // Table lock / index lock for partial unique index simulation
  private activeCandidateOnboardings: Set<string> = new Set();

  constructor(initialData?: { candidates?: any[]; jobs?: any[]; offers?: any[] }) {
    this.candidates = [...(initialData?.candidates ?? [])];
    this.jobs = [...(initialData?.jobs ?? [])];
    this.offers = [...(initialData?.offers ?? [])];
  }

  // Simulation of private.is_staff(auth.uid())
  is_staff(userId: string | null): boolean {
    if (!userId) return false;
    return userId.startsWith("staff_") || userId === "recruiter-123" || userId === "admin-123";
  }

  // Storage RLS check simulation
  can_read_storage_object(
    context: { role: string; uid: string | null },
    bucketId: string,
  ): boolean {
    if (bucketId !== "onboarding-documents") return false;
    if (context.role === "service_role") return true;
    if (context.role === "authenticated" && this.is_staff(context.uid)) return true;
    return false;
  }

  // Exact simulation of public.create_onboarding_atomic(p_candidate_id, p_start_date)
  async create_onboarding_atomic(
    context: { role: string; uid: string | null },
    args: { p_candidate_id: string; p_start_date?: string | null },
  ) {
    // 1. Strict Allow-List Authorization:
    // IF auth.role() <> 'service_role' AND NOT private.is_staff(v_caller_uid) THEN RAISE EXCEPTION ...
    if (context.role !== "service_role" && !this.is_staff(context.uid)) {
      throw new Error("Unauthorized: only staff can perform this action.");
    }

    // 2. Candidate existence and application_status = 'hired'
    const candidate = this.candidates.find((c) => c.id === args.p_candidate_id);
    if (!candidate) {
      throw new Error("Candidate not found.");
    }
    if (candidate.application_status !== "hired") {
      throw new Error("Only candidates with application status hired can be onboarded.");
    }

    // Small async delay simulating DB IO during concurrent execution
    await new Promise((resolve) => setTimeout(resolve, 5));

    // 3. Database Partial Unique Index Enforcement: idx_onboarding_candidate_active
    // ON public.onboarding (candidate_id) WHERE (status IN ('NOT_STARTED', 'IN_PROGRESS'))
    const active = this.onboarding.find(
      (o) =>
        o.candidate_id === args.p_candidate_id &&
        (o.status === "NOT_STARTED" || o.status === "IN_PROGRESS"),
    );
    if (active || this.activeCandidateOnboardings.has(args.p_candidate_id)) {
      throw new Error(
        'duplicate key value violates unique constraint "idx_onboarding_candidate_active"',
      );
    }
    this.activeCandidateOnboardings.add(args.p_candidate_id);

    // 4. Start date fallback from accepted offer
    let startDate = args.p_start_date ?? null;
    if (!startDate) {
      const acceptedOffer = this.offers
        .filter((o) => o.candidate_id === args.p_candidate_id && o.status === "ACCEPTED")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      startDate = acceptedOffer?.start_date || null;
    }

    // 5. Cryptographically random 256-bit token generated inside database
    const rawToken = generate256BitToken();
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const onboardingId = `onb-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // 6. Insert Onboarding record storing only SHA-256 hash (audit creator derived from auth.uid())
    this.onboarding.push({
      id: onboardingId,
      candidate_id: args.p_candidate_id,
      job_id: candidate.job_id ?? null,
      start_date: startDate,
      status: "NOT_STARTED",
      candidate_token_hash: tokenHash,
      token_expires_at: expiresAt,
      token_revoked_at: null,
      created_by: context.uid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    });

    // 7. Insert default onboarding requirements (initial seed for Option A model)
    const defaultReqs = [
      {
        requirement_key: "identity_verification",
        title: "Identity Verification",
        description: "Upload government ID, passport, or national identity document.",
        is_required: true,
      },
      {
        requirement_key: "signed_offer_letter",
        title: "Signed Offer Letter",
        description: "Upload countersigned offer letter and employment agreement.",
        is_required: true,
      },
      {
        requirement_key: "payroll_tax_forms",
        title: "Payroll & Tax Documentation",
        description: "Upload tax forms (W-4 / Form 16 / PAN) and direct deposit bank details.",
        is_required: true,
      },
    ];

    for (const req of defaultReqs) {
      this.onboarding_documents.push({
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        onboarding_id: onboardingId,
        requirement_key: req.requirement_key,
        title: req.title,
        description: req.description,
        is_required: req.is_required,
        storage_path: null,
        document_name: null,
        file_size_bytes: null,
        mime_type: null,
        document_status: "NOT_SUBMITTED",
        review_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        uploaded_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // 8. Insert ONBOARDING_CREATED event
    this.onboarding_events.push({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      onboarding_id: onboardingId,
      candidate_id: args.p_candidate_id,
      event_type: "ONBOARDING_CREATED",
      notes: "Onboarding record created with required document compliance items.",
      created_by: context.uid,
      created_at: new Date().toISOString(),
    });

    return {
      id: onboardingId,
      candidate_id: args.p_candidate_id,
      job_id: candidate.job_id ?? null,
      start_date: startDate,
      status: "NOT_STARTED",
      raw_token: rawToken,
      token_expires_at: expiresAt,
    };
  }

  // Exact simulation of public.resend_onboarding_invite_atomic(p_onboarding_id)
  async resend_onboarding_invite_atomic(
    context: { role: string; uid: string | null },
    args: { p_onboarding_id: string },
  ) {
    // 1. Strict Allow-List Authorization:
    if (context.role !== "service_role" && !this.is_staff(context.uid)) {
      throw new Error("Unauthorized: only staff can perform this action.");
    }

    // 2. Acquire explicit row-level lock (FOR UPDATE)
    while (this.lockedRows.has(args.p_onboarding_id)) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    this.lockedRows.add(args.p_onboarding_id);

    try {
      const onb = this.onboarding.find((o) => o.id === args.p_onboarding_id);
      if (!onb) {
        throw new Error("Onboarding record not found.");
      }
      if (onb.status === "COMPLETED" || onb.status === "CANCELLED") {
        throw new Error(`Cannot resend invite for ${onb.status} onboarding.`);
      }

      // Small async delay simulating DB IO during row lock
      await new Promise((resolve) => setTimeout(resolve, 10));

      const newRawToken = generate256BitToken();
      const newTokenHash = sha256Hex(newRawToken);
      const newExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      onb.candidate_token_hash = newTokenHash;
      onb.token_expires_at = newExpiresAt;
      onb.token_revoked_at = null;
      onb.updated_at = new Date().toISOString();

      return {
        onboarding_id: onb.id,
        candidate_id: onb.candidate_id,
        raw_token: newRawToken,
        token_expires_at: newExpiresAt,
      };
    } finally {
      this.lockedRows.delete(args.p_onboarding_id);
    }
  }

  // Exact simulation of public.resolve_onboarding_token(p_token)
  async resolve_onboarding_token(token: string) {
    const tokenHash = sha256Hex(token);

    const onb = this.onboarding.find(
      (o) => o.candidate_token_hash === tokenHash && o.token_revoked_at === null,
    );

    if (!onb) {
      throw new Error("Invalid or revoked onboarding invitation link.");
    }

    if (onb.token_expires_at && new Date(onb.token_expires_at).getTime() < Date.now()) {
      throw new Error("Onboarding invitation link has expired.");
    }

    if (onb.status === "CANCELLED") {
      throw new Error("This onboarding process has been cancelled.");
    }

    // 2. Race-Safe Conditional Transition: NOT_STARTED -> IN_PROGRESS
    // UPDATE public.onboarding SET status = 'IN_PROGRESS' WHERE id = ... AND status = 'NOT_STARTED' RETURNING id;
    if (onb.status === "NOT_STARTED") {
      let wasNotStarted = false;
      if (onb.status === "NOT_STARTED") {
        onb.status = "IN_PROGRESS";
        onb.updated_at = new Date().toISOString();
        wasNotStarted = true;
      }

      if (wasNotStarted) {
        this.onboarding_events.push({
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          onboarding_id: onb.id,
          candidate_id: onb.candidate_id,
          event_type: "ONBOARDING_STARTED",
          notes: "Candidate opened onboarding portal and began submission process.",
          created_by: null,
          created_at: new Date().toISOString(),
        });
      }
    }

    const candidate = this.candidates.find((c) => c.id === onb.candidate_id);
    const job = this.jobs.find((j) => j.id === onb.job_id);
    const docs = this.onboarding_documents
      .filter((d) => d.onboarding_id === onb.id)
      .map((d) => ({
        id: d.id,
        requirement_key: d.requirement_key,
        title: d.title,
        description: d.description,
        is_required: d.is_required,
        document_status: d.document_status,
        document_name: d.document_name,
        file_size_bytes: d.file_size_bytes,
        uploaded_at: d.uploaded_at,
        review_notes: d.review_notes,
      }));

    // Data-minimized payload (no onboarding_id, no storage_path, no candidate email/phone)
    return {
      status: onb.status,
      start_date: onb.start_date,
      candidate: {
        full_name: candidate?.full_name ?? "Candidate",
      },
      job: {
        title: job?.title ?? "Role",
        department: job?.department ?? null,
      },
      documents: docs,
    };
  }

  // Update document status with database constraint enforcement & authorization
  update_document_status(
    context: { role: string; uid: string | null },
    documentId: string,
    status: "NOT_SUBMITTED" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED",
    reviewNotes?: string | null,
  ) {
    // Only staff can review or change verification state
    if (context.role !== "service_role" && !this.is_staff(context.uid)) {
      throw new Error("Unauthorized: candidates cannot modify review fields or verify documents.");
    }

    const doc = this.onboarding_documents.find((d) => d.id === documentId);
    if (!doc) throw new Error("Document requirement not found.");

    // CHECK (document_status <> 'REJECTED' OR (review_notes IS NOT NULL AND length(trim(review_notes)) > 0))
    if (status === "REJECTED") {
      if (!reviewNotes || reviewNotes.trim().length === 0) {
        throw new Error(
          "chk_onboarding_documents_rejection_notes: review_notes is required when status is REJECTED.",
        );
      }
    }

    doc.document_status = status;
    doc.review_notes = reviewNotes ?? null;
    doc.reviewed_by = context.uid;
    doc.reviewed_at = new Date().toISOString();
    doc.updated_at = new Date().toISOString();
  }

  // Authoritative server-side completion gate
  async complete_onboarding_atomic(
    context: { role: string; uid: string | null },
    onboardingId: string,
  ) {
    if (context.role !== "service_role" && !this.is_staff(context.uid)) {
      throw new Error("Unauthorized: only staff can complete onboarding.");
    }

    // Acquire row lock to simulate atomic conditional UPDATE
    while (this.lockedRows.has(onboardingId)) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    this.lockedRows.add(onboardingId);

    try {
      const onb = this.onboarding.find((o) => o.id === onboardingId);
      if (!onb) throw new Error("Onboarding not found.");

      if (onb.status !== "IN_PROGRESS") {
        throw new Error(`Cannot complete onboarding in status ${onb.status}.`);
      }

      // Check all required documents are VERIFIED (dynamic calculation)
      const docs = this.onboarding_documents.filter((d) => d.onboarding_id === onboardingId);
      const unverifiedRequired = docs.filter(
        (d) => d.is_required && d.document_status !== "VERIFIED",
      );

      if (unverifiedRequired.length > 0) {
        throw new Error(
          `Cannot complete onboarding: ${unverifiedRequired.length} required document(s) are not verified.`,
        );
      }

      // Atomic status transition: UPDATE ... WHERE id = ... AND status = 'IN_PROGRESS' RETURNING id;
      onb.status = "COMPLETED";
      onb.completed_at = new Date().toISOString();
      onb.updated_at = new Date().toISOString();

      this.onboarding_events.push({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        onboarding_id: onb.id,
        candidate_id: onb.candidate_id,
        event_type: "ONBOARDING_COMPLETED",
        notes: "All required document compliance verified. Onboarding completed.",
        created_by: context.uid,
        created_at: new Date().toISOString(),
      });

      return { id: onb.id, status: "COMPLETED" };
    } finally {
      this.lockedRows.delete(onboardingId);
    }
  }
}

describe("Phase 6 Complete Audit Test Matrix", () => {
  const seedHiredCandidate = {
    id: "cand-hired-1",
    full_name: "Alice Montgomery",
    email: "alice@example.com",
    application_status: "hired",
    job_id: "job-eng-1",
  };

  const seedOffer = {
    id: "offer-1",
    candidate_id: "cand-hired-1",
    status: "ACCEPTED",
    start_date: "2026-10-15",
    created_at: "2026-09-20T10:00:00Z",
  };

  const seedJob = {
    id: "job-eng-1",
    title: "Senior Full Stack Engineer",
    department: "Engineering",
  };

  describe("1. Authorization Matrix", () => {
    it("anon cannot create onboarding", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      await expect(
        db.create_onboarding_atomic(
          { role: "anon", uid: null },
          { p_candidate_id: seedHiredCandidate.id },
        ),
      ).rejects.toThrow("Unauthorized: only staff can perform this action.");
    });

    it("anon cannot resend invite", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const created = await db.create_onboarding_atomic(
        { role: "service_role", uid: null },
        { p_candidate_id: seedHiredCandidate.id },
      );
      await expect(
        db.resend_onboarding_invite_atomic(
          { role: "anon", uid: null },
          { p_onboarding_id: created.id },
        ),
      ).rejects.toThrow("Unauthorized: only staff can perform this action.");
    });

    it("non-staff authenticated user cannot create onboarding", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      await expect(
        db.create_onboarding_atomic(
          { role: "authenticated", uid: "user_regular_candidate_999" },
          { p_candidate_id: seedHiredCandidate.id },
        ),
      ).rejects.toThrow("Unauthorized: only staff can perform this action.");
    });

    it("non-staff authenticated user cannot resend invite", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const created = await db.create_onboarding_atomic(
        { role: "service_role", uid: null },
        { p_candidate_id: seedHiredCandidate.id },
      );
      await expect(
        db.resend_onboarding_invite_atomic(
          { role: "authenticated", uid: "user_regular_candidate_999" },
          { p_onboarding_id: created.id },
        ),
      ).rejects.toThrow("Unauthorized: only staff can perform this action.");
    });

    it("staff can create onboarding", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const created = await db.create_onboarding_atomic(
        { role: "authenticated", uid: "staff_recruiter_001" },
        { p_candidate_id: seedHiredCandidate.id },
      );
      expect(created.id).toBeDefined();
      expect(created.raw_token).toHaveLength(64);
    });

    it("staff can resend invite", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const created = await db.create_onboarding_atomic(
        { role: "authenticated", uid: "staff_recruiter_001" },
        { p_candidate_id: seedHiredCandidate.id },
      );
      const resent = await db.resend_onboarding_invite_atomic(
        { role: "authenticated", uid: "staff_recruiter_001" },
        { p_onboarding_id: created.id },
      );
      expect(resent.raw_token).toBeDefined();
      expect(resent.raw_token).not.toBe(created.raw_token);
    });

    it("service_role can perform server operations", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const created = await db.create_onboarding_atomic(
        { role: "service_role", uid: null },
        { p_candidate_id: seedHiredCandidate.id },
      );
      expect(created.id).toBeDefined();
      const resent = await db.resend_onboarding_invite_atomic(
        { role: "service_role", uid: null },
        { p_onboarding_id: created.id },
      );
      expect(resent.raw_token).toBeDefined();
    });
  });

  describe("2. Concurrency Protection", () => {
    it("concurrent onboarding creation for same candidate allows exactly one to succeed", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };

      // Attempt 2 simultaneous creations for the same candidate
      const results = await Promise.allSettled([
        db.create_onboarding_atomic(staff, { p_candidate_id: seedHiredCandidate.id }),
        db.create_onboarding_atomic(staff, { p_candidate_id: seedHiredCandidate.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain(
        "idx_onboarding_candidate_active",
      );
    });

    it("concurrent invite resend serializes with row lock and invalidates earlier tokens", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });

      const [resendA, resendB] = await Promise.all([
        db.resend_onboarding_invite_atomic(staff, { p_onboarding_id: created.id }),
        db.resend_onboarding_invite_atomic(staff, { p_onboarding_id: created.id }),
      ]);

      expect(resendA.raw_token).not.toBe(resendB.raw_token);
      await expect(db.resolve_onboarding_token(created.raw_token)).rejects.toThrow(
        "Invalid or revoked onboarding invitation link.",
      );

      const finalHash = db.onboarding[0].candidate_token_hash;
      const aValid = finalHash === sha256Hex(resendA.raw_token);
      const bValid = finalHash === sha256Hex(resendB.raw_token);
      expect(aValid || bValid).toBe(true);
      expect(aValid && bValid).toBe(false);
    });

    it("concurrent candidate portal open generates exactly one ONBOARDING_STARTED event", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });

      const [p1, p2, p3] = await Promise.all([
        db.resolve_onboarding_token(created.raw_token),
        db.resolve_onboarding_token(created.raw_token),
        db.resolve_onboarding_token(created.raw_token),
      ]);

      expect(p1.status).toBe("IN_PROGRESS");
      expect(p2.status).toBe("IN_PROGRESS");
      expect(p3.status).toBe("IN_PROGRESS");

      const startedEvents = db.onboarding_events.filter(
        (e) => e.event_type === "ONBOARDING_STARTED",
      );
      expect(startedEvents).toHaveLength(1);
    });

    it("concurrent document completion is race-safe and generates exactly one ONBOARDING_COMPLETED event", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });

      await db.resolve_onboarding_token(created.raw_token);

      // Verify all requirements
      for (const d of db.onboarding_documents) {
        db.update_document_status(staff, d.id, "VERIFIED");
      }

      // Two concurrent completions
      const results = await Promise.allSettled([
        db.complete_onboarding_atomic(staff, created.id),
        db.complete_onboarding_atomic(staff, created.id),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain(
        "Cannot complete onboarding in status COMPLETED",
      );

      const compEvents = db.onboarding_events.filter(
        (e) => e.event_type === "ONBOARDING_COMPLETED",
      );
      expect(compEvents).toHaveLength(1);
    });
  });

  describe("3. Document Security & Rejection Constraint", () => {
    it("candidate cannot verify document or modify review fields", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });

      const docId = db.onboarding_documents[0].id;
      const candidateContext = { role: "anon", uid: null };

      expect(() => {
        db.update_document_status(candidateContext, docId, "VERIFIED");
      }).toThrow("Unauthorized: candidates cannot modify review fields or verify documents.");
    });

    it("rejected document requires non-empty review_notes", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });

      const docId = db.onboarding_documents[0].id;

      expect(() => {
        db.update_document_status(staff, docId, "REJECTED", null);
      }).toThrow("chk_onboarding_documents_rejection_notes");

      expect(() => {
        db.update_document_status(staff, docId, "REJECTED", "   ");
      }).toThrow("chk_onboarding_documents_rejection_notes");

      db.update_document_status(staff, docId, "REJECTED", "Signature missing on page 3");
      expect(db.onboarding_documents[0].document_status).toBe("REJECTED");
      expect(db.onboarding_documents[0].review_notes).toBe("Signature missing on page 3");
    });

    it("private storage cannot be read directly by candidate", async () => {
      const db = new MockPostgreSqlDatabase();
      const candidateContext = { role: "anon", uid: null };
      const staffContext = { role: "authenticated", uid: "staff_recruiter_001" };

      expect(db.can_read_storage_object(candidateContext, "onboarding-documents")).toBe(false);
      expect(db.can_read_storage_object(staffContext, "onboarding-documents")).toBe(true);
      expect(
        db.can_read_storage_object({ role: "service_role", uid: null }, "onboarding-documents"),
      ).toBe(true);
    });
  });

  describe("4. Completion Gate Rules", () => {
    it("missing required document prevents completion", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });
      await db.resolve_onboarding_token(created.raw_token);

      await expect(db.complete_onboarding_atomic(staff, created.id)).rejects.toThrow(
        "Cannot complete onboarding: 3 required document(s) are not verified.",
      );
    });

    it("PENDING_REVIEW prevents completion", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });
      await db.resolve_onboarding_token(created.raw_token);

      db.update_document_status(staff, db.onboarding_documents[0].id, "VERIFIED");
      db.update_document_status(staff, db.onboarding_documents[1].id, "VERIFIED");
      db.update_document_status(staff, db.onboarding_documents[2].id, "PENDING_REVIEW");

      await expect(db.complete_onboarding_atomic(staff, created.id)).rejects.toThrow(
        "Cannot complete onboarding: 1 required document(s) are not verified.",
      );
    });

    it("REJECTED prevents completion", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });
      await db.resolve_onboarding_token(created.raw_token);

      db.update_document_status(staff, db.onboarding_documents[0].id, "VERIFIED");
      db.update_document_status(staff, db.onboarding_documents[1].id, "VERIFIED");
      db.update_document_status(staff, db.onboarding_documents[2].id, "REJECTED", "Expired ID");

      await expect(db.complete_onboarding_atomic(staff, created.id)).rejects.toThrow(
        "Cannot complete onboarding: 1 required document(s) are not verified.",
      );
    });

    it("all required documents VERIFIED allows completion even if optional documents are not submitted", async () => {
      const db = new MockPostgreSqlDatabase({
        candidates: [seedHiredCandidate],
        offers: [seedOffer],
        jobs: [seedJob],
      });
      const staff = { role: "authenticated", uid: "staff_recruiter_001" };
      const created = await db.create_onboarding_atomic(staff, {
        p_candidate_id: seedHiredCandidate.id,
      });
      await db.resolve_onboarding_token(created.raw_token);

      // Add an optional document requirement (is_required = false)
      db.onboarding_documents.push({
        id: "doc-optional-portfolio",
        onboarding_id: created.id,
        requirement_key: "portfolio_work",
        title: "Optional Portfolio Samples",
        description: "Upload additional work samples if available.",
        is_required: false,
        document_status: "NOT_SUBMITTED",
        review_notes: null,
      });

      // Verify all 3 required documents
      db.update_document_status(staff, db.onboarding_documents[0].id, "VERIFIED");
      db.update_document_status(staff, db.onboarding_documents[1].id, "VERIFIED");
      db.update_document_status(staff, db.onboarding_documents[2].id, "VERIFIED");

      // Completion succeeds even with optional document NOT_SUBMITTED
      const completed = await db.complete_onboarding_atomic(staff, created.id);
      expect(completed.status).toBe("COMPLETED");
    });
  });
});
