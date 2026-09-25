import { describe, expect, it } from "vitest";
import {
  completeOnboardingAtomic,
  createOnboardingAtomic,
  recordOnboardingEvent,
  resendOnboardingInviteAtomic,
  resolveOnboardingToken,
  reviewOnboardingDocument,
  uploadCandidateDocument,
  validateFileMagicBytes,
  verifyOnboardingEligibility,
} from "./onboarding.server";
import crypto from "crypto";

// In-memory mock database for Phase 6 document-driven onboarding testing
function createMockDb(initialState?: {
  candidates?: any[];
  jobs?: any[];
  offers?: any[];
  onboarding?: any[];
  onboarding_documents?: any[];
  onboarding_events?: any[];
}) {
  const candidates = [...(initialState?.candidates ?? [])];
  const jobs = [...(initialState?.jobs ?? [])];
  const offers = [...(initialState?.offers ?? [])];
  const onboarding = [...(initialState?.onboarding ?? [])];
  const onboarding_documents = [...(initialState?.onboarding_documents ?? [])];
  const onboarding_events = [...(initialState?.onboarding_events ?? [])];
  const storageBucket: Record<string, { buffer: Buffer; contentType: string }> = {};

  const db: any = {
    _state: {
      candidates,
      jobs,
      offers,
      onboarding,
      onboarding_documents,
      onboarding_events,
      storageBucket,
    },
    rpc: async (fnName: string, args: any) => {
      try {
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
              .sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              )[0];
            startDate = acceptedOffer?.start_date || null;
          }

          const rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          const expiresAt = new Date(Date.now() + 14 * 86400 * 1000).toISOString();

          const onbId = `onb-${Date.now()}-${Math.random()}`;
          const newOnboarding = {
            id: onbId,
            candidate_id: args.p_candidate_id,
            job_id: cand.job_id,
            start_date: startDate,
            status: "NOT_STARTED",
            candidate_token_hash: tokenHash,
            token_expires_at: expiresAt,
            token_revoked_at: null,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          onboarding.push(newOnboarding);

          // Seed 3 default requirements
          const defaultDocs = [
            {
              id: `doc-1-${onbId}`,
              onboarding_id: onbId,
              requirement_key: "identity_verification",
              title: "Identity Verification",
              description: "Upload government ID or passport.",
              is_required: true,
              document_status: "NOT_SUBMITTED",
              storage_path: null,
              document_name: null,
              created_at: new Date().toISOString(),
            },
            {
              id: `doc-2-${onbId}`,
              onboarding_id: onbId,
              requirement_key: "signed_offer_letter",
              title: "Signed Offer Letter",
              description: "Upload countersigned offer letter.",
              is_required: true,
              document_status: "NOT_SUBMITTED",
              storage_path: null,
              document_name: null,
              created_at: new Date().toISOString(),
            },
            {
              id: `doc-3-${onbId}`,
              onboarding_id: onbId,
              requirement_key: "payroll_tax_forms",
              title: "Payroll & Tax Documentation",
              description: "Upload tax forms and bank details.",
              is_required: true,
              document_status: "NOT_SUBMITTED",
              storage_path: null,
              document_name: null,
              created_at: new Date().toISOString(),
            },
          ];
          onboarding_documents.push(...defaultDocs);

          onboarding_events.push({
            id: `ev-${Date.now()}`,
            onboarding_id: onbId,
            candidate_id: args.p_candidate_id,
            event_type: "ONBOARDING_CREATED",
            notes: "Onboarding record created with required document compliance items.",
            created_at: new Date().toISOString(),
          });

          return {
            data: {
              id: onbId,
              candidate_id: args.p_candidate_id,
              job_id: cand.job_id,
              start_date: startDate,
              status: "NOT_STARTED",
              raw_token: rawToken,
              token_expires_at: expiresAt,
            },
            error: null,
          };
        }

        if (fnName === "resend_onboarding_invite_atomic") {
          const onb = onboarding.find((o) => o.id === args.p_onboarding_id);
          if (!onb) throw new Error("Onboarding record not found.");
          if (onb.status === "CANCELLED")
            throw new Error("Cannot resend invitation for cancelled onboarding.");
          if (onb.status === "COMPLETED")
            throw new Error("Cannot resend invitation for already completed onboarding.");

          const rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          const expiresAt = new Date(Date.now() + 14 * 86400 * 1000).toISOString();

          onb.candidate_token_hash = tokenHash;
          onb.token_expires_at = expiresAt;
          onb.token_revoked_at = null;

          return {
            data: {
              id: onb.id,
              candidate_id: onb.candidate_id,
              raw_token: rawToken,
              token_expires_at: expiresAt,
            },
            error: null,
          };
        }

        if (fnName === "resolve_onboarding_token") {
          const tokenHash = crypto.createHash("sha256").update(args.p_token).digest("hex");
          const onb = onboarding.find(
            (o) => o.candidate_token_hash === tokenHash && !o.token_revoked_at,
          );
          if (!onb) throw new Error("Invalid or revoked onboarding invitation link.");
          if (onb.token_expires_at && new Date(onb.token_expires_at) < new Date()) {
            throw new Error("Onboarding invitation link has expired.");
          }
          if (onb.status === "CANCELLED") {
            throw new Error("This onboarding process has been cancelled.");
          }

          if (onb.status === "NOT_STARTED") {
            onb.status = "IN_PROGRESS";
            onboarding_events.push({
              id: `ev-${Date.now()}`,
              onboarding_id: onb.id,
              candidate_id: onb.candidate_id,
              event_type: "ONBOARDING_STARTED",
              notes: "Candidate opened portal",
              created_at: new Date().toISOString(),
            });
          }

          const cand = candidates.find((c) => c.id === onb.candidate_id);
          const j = jobs.find((job) => job.id === onb.job_id);
          const docs = onboarding_documents.filter((d) => d.onboarding_id === onb.id);

          return {
            data: {
              status: onb.status,
              start_date: onb.start_date,
              candidate: { full_name: cand?.full_name || "" },
              job: { title: j?.title || "Role", department: j?.department },
              documents: docs.map((d) => ({
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
              })),
            },
            error: null,
          };
        }

        throw new Error(`Unknown RPC: ${fnName}`);
      } catch (err: any) {
        return { data: null, error: { message: err.message } };
      }
    },
    storage: {
      from: (_bucket: string) => ({
        upload: async (path: string, buffer: Buffer, opts: { contentType: string }) => {
          storageBucket[path] = { buffer, contentType: opts.contentType };
          return { error: null };
        },
        remove: async (paths: string[]) => {
          paths.forEach((p) => delete storageBucket[p]);
          return { error: null };
        },
      }),
    },
    from: (table: string) => {
      let filtered = [...(db._state[table] || [])];

      const builder: any = {
        select: (_cols?: string) => builder,
        eq: (col: string, val: any) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        neq: (col: string, val: any) => {
          filtered = filtered.filter((r) => r[col] !== val);
          return builder;
        },
        in: (col: string, vals: any[]) => {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return builder;
        },
        is: (col: string, val: any) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          filtered.sort((a, b) => {
            const asc = opts?.ascending ?? true;
            return asc ? (a[col] > b[col] ? 1 : -1) : a[col] < b[col] ? 1 : -1;
          });
          return builder;
        },
        maybeSingle: async () => ({
          data: filtered.length > 0 ? filtered[0] : null,
          error: null,
        }),
        single: async () => ({
          data: filtered.length > 0 ? filtered[0] : null,
          error: filtered.length > 0 ? null : { message: "No rows found" },
        }),
        insert: async (records: any) => {
          const recArray = Array.isArray(records) ? records : [records];
          const inserted = recArray.map((r) => ({
            id: r.id || `gen-${Date.now()}-${Math.random()}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...r,
          }));
          db._state[table].push(...inserted);
          return {
            data: Array.isArray(records) ? inserted : inserted[0],
            error: null,
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
          };
        },
        update: (updates: any) => {
          const conditions: Array<{ col: string; val: any }> = [];
          const execute = () => {
            const matched = db._state[table].filter((r: any) =>
              conditions.every((c) => r[c.col] === c.val),
            );
            matched.forEach((r: any) => Object.assign(r, updates));
            return matched;
          };
          const chain: any = {
            eq: (col: string, val: any) => {
              conditions.push({ col, val });
              return chain;
            },
            select: () => ({
              single: async () => ({ data: execute()[0] || null, error: null }),
              maybeSingle: async () => ({ data: execute()[0] || null, error: null }),
            }),
            then: (resolve: any) => resolve({ data: execute(), error: null }),
          };
          return chain;
        },
        delete: () => {
          return {
            eq: (col: string, val: any) => {
              db._state[table] = db._state[table].filter((r: any) => r[col] !== val);
              return { error: null };
            },
          };
        },
        then: (resolve: any) => resolve({ data: filtered, error: null }),
      };

      return builder;
    },
  };

  return db;
}

describe("Phase 6 Document-Driven Onboarding Suite", () => {
  const candidateHired = {
    id: "cand-hired-1",
    full_name: "Alex Smith",
    email: "alex@example.com",
    job_id: "job-eng-1",
    application_status: "hired",
  };

  const candidateNotHired = {
    id: "cand-eval-2",
    full_name: "Bob Jones",
    email: "bob@example.com",
    job_id: "job-eng-1",
    application_status: "interviewing",
  };

  const job1 = {
    id: "job-eng-1",
    title: "Senior Fullstack Engineer",
    department: "Engineering",
  };

  const acceptedOffer = {
    id: "offer-1",
    candidate_id: "cand-hired-1",
    status: "ACCEPTED",
    start_date: "2026-10-15",
    created_at: new Date(Date.now() - 86400000).toISOString(),
  };

  describe("1. Authoritative Backend Eligibility Check", () => {
    it("eligible candidate with application_status = 'hired' passes verification", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
      });

      const res = await verifyOnboardingEligibility(db, "cand-hired-1");
      expect(res.eligible).toBe(true);
      expect(res.defaultStartDate).toBe("2026-10-15");
      expect(res.candidate?.full_name).toBe("Alex Smith");
    });

    it("rejects candidate whose application_status is not 'hired'", async () => {
      const db = createMockDb({
        candidates: [candidateNotHired],
      });

      const res = await verifyOnboardingEligibility(db, "cand-eval-2");
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("Only candidates with application status 'hired'");
    });

    it("rejects candidate who already has an active onboarding record", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        onboarding: [
          {
            id: "onb-existing",
            candidate_id: "cand-hired-1",
            status: "IN_PROGRESS",
          },
        ],
      });

      const res = await verifyOnboardingEligibility(db, "cand-hired-1");
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("Candidate already has an active onboarding record");
    });
  });

  describe("2. Document-Driven Atomic Onboarding Creation", () => {
    it("creates onboarding, seeds 3 default document requirements, and generates 256-bit token", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const result = await createOnboardingAtomic(db, {
        candidateId: "cand-hired-1",
      });

      expect(result.onboarding.id).toBeDefined();
      expect(result.onboarding.status).toBe("NOT_STARTED");
      expect(result.onboarding.start_date).toBe("2026-10-15");
      expect(result.rawToken).toHaveLength(64); // 32 bytes hex = 64 characters
      expect(result.tokenExpiresAt).toBeDefined();

      // Check documents seeded
      expect(result.documents).toHaveLength(3);
      const keys = result.documents.map((d) => d.requirement_key);
      expect(keys).toContain("identity_verification");
      expect(keys).toContain("signed_offer_letter");
      expect(keys).toContain("payroll_tax_forms");

      // Verify stored candidate_token_hash is SHA-256 of rawToken
      const expectedHash = crypto.createHash("sha256").update(result.rawToken).digest("hex");
      const storedOnboarding = db._state.onboarding.find((o: any) => o.id === result.onboarding.id);
      expect(storedOnboarding.candidate_token_hash).toBe(expectedHash);
    });
  });

  describe("3. Candidate Portal Token Resolution & Data Minimization", () => {
    it("resolves token, auto-transitions NOT_STARTED -> IN_PROGRESS, and minimizes data", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });
      const portal = await resolveOnboardingToken(db, created.rawToken);

      expect(portal.status).toBe("IN_PROGRESS");
      expect(portal.candidate.full_name).toBe("Alex Smith");
      expect(portal.job.title).toBe("Senior Fullstack Engineer");
      expect(portal.documents).toHaveLength(3);

      // Data minimization check: no sensitive candidate data leaked
      expect((portal as any).candidate_id).toBeUndefined();
      expect((portal as any).onboarding_id).toBeUndefined();
      expect((portal as any).salary).toBeUndefined();
      portal.documents.forEach((d) => {
        expect((d as any).storage_path).toBeUndefined();
      });
    });

    it("rejects invalid or expired token", async () => {
      const db = createMockDb();
      await expect(resolveOnboardingToken(db, "invalid-token")).rejects.toThrow(
        "Invalid or revoked onboarding invitation link.",
      );
    });
  });

  describe("4. Magic-Byte File Validation & Candidate Uploads", () => {
    it("validates PDF magic bytes (%PDF-)", () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test content");
      expect(validateFileMagicBytes(pdfBuffer, "application/pdf")).toBe(true);

      const fakePdf = Buffer.from("NOT_A_PDF content");
      expect(validateFileMagicBytes(fakePdf, "application/pdf")).toBe(false);
    });

    it("validates PNG magic bytes (\\x89PNG)", () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(validateFileMagicBytes(pngBuffer, "image/png")).toBe(true);
    });

    it("validates JPEG magic bytes (\\xFF\\xD8\\xFF)", () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(validateFileMagicBytes(jpegBuffer, "image/jpeg")).toBe(true);
    });

    it("uploads candidate document with validation and sets status to PENDING_REVIEW", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });
      const docId = created.documents[0]!.id;
      const pdfBuffer = Buffer.from("%PDF-1.5 Sample Government ID Document Content");

      const uploadResult = await uploadCandidateDocument(db, {
        token: created.rawToken,
        documentId: docId,
        fileBuffer: pdfBuffer,
        fileName: "passport_scan.pdf",
        mimeType: "application/pdf",
      });

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.document.document_status).toBe("PENDING_REVIEW");
      expect(uploadResult.document.document_name).toBe("passport_scan.pdf");
      expect(uploadResult.document.storage_path).toContain("passport_scan.pdf");
      expect(uploadResult.document.file_size_bytes).toBe(pdfBuffer.length);

      // Verify audit event emitted
      const events = db._state.onboarding_events;
      const uploadEvent = events.find((e: any) => e.event_type === "ONBOARDING_DOC_UPLOADED");
      expect(uploadEvent).toBeDefined();
    });

    it("rejects file exceeding 8 MB limit", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });
      const docId = created.documents[0]!.id;
      const oversizedBuffer = Buffer.alloc(9 * 1024 * 1024); // 9 MB

      await expect(
        uploadCandidateDocument(db, {
          token: created.rawToken,
          documentId: docId,
          fileBuffer: oversizedBuffer,
          fileName: "huge.pdf",
          mimeType: "application/pdf",
        }),
      ).rejects.toThrow("File size exceeds 8 MB limit.");
    });
  });

  describe("5. Recruiter Document Review & Mandatory Rejection Notes", () => {
    it("recruiter can verify uploaded document", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });
      const docId = created.documents[0]!.id;
      const pdfBuffer = Buffer.from("%PDF-1.4 Content");

      await uploadCandidateDocument(db, {
        token: created.rawToken,
        documentId: docId,
        fileBuffer: pdfBuffer,
        fileName: "id.pdf",
        mimeType: "application/pdf",
      });

      const reviewed = await reviewOnboardingDocument(db, {
        onboardingId: created.onboarding.id,
        documentId: docId,
        decision: "VERIFIED",
        reviewerId: "staff-recruiter-1",
      });

      expect(reviewed.document_status).toBe("VERIFIED");
      expect(reviewed.reviewed_by).toBe("staff-recruiter-1");

      const event = db._state.onboarding_events.find(
        (e: any) => e.event_type === "ONBOARDING_DOC_VERIFIED",
      );
      expect(event).toBeDefined();
    });

    it("rejecting document requires non-empty review notes", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });
      const docId = created.documents[0]!.id;

      await expect(
        reviewOnboardingDocument(db, {
          onboardingId: created.onboarding.id,
          documentId: docId,
          decision: "REJECTED",
          reviewNotes: "   ",
          reviewerId: "staff-recruiter-1",
        }),
      ).rejects.toThrow("Review notes are required when rejecting a document.");
    });

    it("rejecting document with review notes updates status and emits ONBOARDING_DOC_REJECTED", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });
      const docId = created.documents[0]!.id;

      const reviewed = await reviewOnboardingDocument(db, {
        onboardingId: created.onboarding.id,
        documentId: docId,
        decision: "REJECTED",
        reviewNotes: "Photo is blurry and expired. Please upload valid passport.",
        reviewerId: "staff-recruiter-1",
      });

      expect(reviewed.document_status).toBe("REJECTED");
      expect(reviewed.review_notes).toBe(
        "Photo is blurry and expired. Please upload valid passport.",
      );

      const event = db._state.onboarding_events.find(
        (e: any) => e.event_type === "ONBOARDING_DOC_REJECTED",
      );
      expect(event).toBeDefined();
    });
  });

  describe("6. Server-Side Completion Gate", () => {
    it("prevents completion if any required document is not verified", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });

      // Verify only 1 of 3 documents
      await reviewOnboardingDocument(db, {
        onboardingId: created.onboarding.id,
        documentId: created.documents[0]!.id,
        decision: "VERIFIED",
        reviewerId: "staff-1",
      });

      await expect(
        completeOnboardingAtomic(db, {
          onboardingId: created.onboarding.id,
          actorId: "staff-1",
        }),
      ).rejects.toThrow("Cannot complete onboarding: 2 required document(s) are not verified");
    });

    it("successfully completes onboarding when all required documents are VERIFIED", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });

      // Put into IN_PROGRESS
      db._state.onboarding[0].status = "IN_PROGRESS";

      // Verify all 3 required documents
      for (const doc of created.documents) {
        await reviewOnboardingDocument(db, {
          onboardingId: created.onboarding.id,
          documentId: doc.id,
          decision: "VERIFIED",
          reviewerId: "staff-1",
        });
      }

      const completed = await completeOnboardingAtomic(db, {
        onboardingId: created.onboarding.id,
        actorId: "staff-1",
      });

      expect(completed.status).toBe("COMPLETED");
      expect(completed.completed_at).toBeDefined();

      const event = db._state.onboarding_events.find(
        (e: any) => e.event_type === "ONBOARDING_COMPLETED",
      );
      expect(event).toBeDefined();
    });
  });

  describe("7. Resend Invitation Token Rotation", () => {
    it("resends invite, rotates token hash, and sets fresh 14-day expiration", async () => {
      const db = createMockDb({
        candidates: [candidateHired],
        offers: [acceptedOffer],
        jobs: [job1],
      });

      const created = await createOnboardingAtomic(db, { candidateId: "cand-hired-1" });
      const oldToken = created.rawToken;

      const resendRes = await resendOnboardingInviteAtomic(db, created.onboarding.id);
      expect(resendRes.rawToken).not.toBe(oldToken);
      expect(resendRes.rawToken).toHaveLength(64);

      // Old token no longer resolves
      await expect(resolveOnboardingToken(db, oldToken)).rejects.toThrow(
        "Invalid or revoked onboarding invitation link.",
      );

      // New token resolves
      const portal = await resolveOnboardingToken(db, resendRes.rawToken);
      expect(portal.candidate.full_name).toBe("Alex Smith");
    });
  });
});
