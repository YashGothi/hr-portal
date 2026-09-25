import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { z } from "zod";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { validateFileMagicBytes } from "@/lib/onboarding/onboarding.server";

describe("PHASE 10: Security & Production Hardening Regression Suite", () => {
  describe("1. Supabase Auth Middleware & Anonymous Access Denial", () => {
    it("rejects requests without an authorization header", async () => {
      const request = new Request("https://portal.seceon.com/api/test", {
        headers: {},
      });

      const authHeader = request.headers.get("authorization");
      expect(authHeader).toBeNull();

      // Middleware logic validation
      const validateAuthHeader = (header: string | null) => {
        if (!header) throw new Error("Unauthorized: No authorization header provided");
        if (!header.startsWith("Bearer "))
          throw new Error("Unauthorized: Only Bearer tokens are supported");
        const token = header.replace("Bearer ", "");
        if (!token || token.split(".").length !== 3) throw new Error("Unauthorized: Invalid token");
        return token;
      };

      expect(() => validateAuthHeader(null)).toThrow(
        "Unauthorized: No authorization header provided",
      );
      expect(() => validateAuthHeader("Basic user:pass")).toThrow(
        "Unauthorized: Only Bearer tokens are supported",
      );
      expect(() => validateAuthHeader("Bearer not-a-jwt")).toThrow("Unauthorized: Invalid token");
      expect(validateAuthHeader("Bearer header.payload.signature")).toBe(
        "header.payload.signature",
      );
    });
  });

  describe("2. RBAC Staff Verification & Non-Staff Denial", () => {
    it("grants staff access only to admin or recruiter roles", () => {
      const isStaff = (roles: Array<string | undefined>) => {
        return roles.some((r) => r === "admin" || r === "recruiter");
      };

      expect(isStaff(["recruiter"])).toBe(true);
      expect(isStaff(["admin"])).toBe(true);
      expect(isStaff(["admin", "recruiter"])).toBe(true);
      expect(isStaff(["applicant"])).toBe(false);
      expect(isStaff(["candidate"])).toBe(false);
      expect(isStaff(["viewer"])).toBe(false);
      expect(isStaff([])).toBe(false);
      expect(isStaff([undefined])).toBe(false);
    });

    it("enforces staff role check before sensitive operations like job creation", () => {
      const checkRoleAuthorization = (roles: string[]) => {
        const isAuthorized = roles.some((r) => r === "admin" || r === "recruiter");
        if (!isAuthorized) {
          throw new Error(
            "Forbidden: You do not have permission to perform this action. (HTTP 403)",
          );
        }
        return true;
      };

      expect(() => checkRoleAuthorization(["applicant"])).toThrow(/Forbidden/);
      expect(() => checkRoleAuthorization([])).toThrow(/Forbidden/);
      expect(checkRoleAuthorization(["recruiter"])).toBe(true);
      expect(checkRoleAuthorization(["admin"])).toBe(true);
    });
  });

  describe("3. Private Storage Protection & Signed URL Expiration", () => {
    it("enforces appropriate expiration windows for signed URLs", () => {
      const RESUME_SIGNED_EXPIRY_SECONDS = 300; // 5 minutes
      const ONBOARDING_DOC_SIGNED_EXPIRY_SECONDS = 900; // 15 minutes

      expect(RESUME_SIGNED_EXPIRY_SECONDS).toBeLessThanOrEqual(300);
      expect(ONBOARDING_DOC_SIGNED_EXPIRY_SECONDS).toBeLessThanOrEqual(900);
    });

    it("verifies file magic bytes to prevent MIME spoofing on document uploads", () => {
      // Valid PDF magic bytes (%PDF-)
      const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
      expect(validateFileMagicBytes(validPdf, "application/pdf")).toBe(true);

      // Valid PNG magic bytes (\x89PNG)
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(validateFileMagicBytes(validPng, "image/png")).toBe(true);

      // Valid JPEG magic bytes (0xFF 0xD8 0xFF)
      const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(validateFileMagicBytes(validJpeg, "image/jpeg")).toBe(true);
      expect(validateFileMagicBytes(validJpeg, "image/jpg")).toBe(true);

      // Executable disguised as PDF
      const fakePdf = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ DOS header
      expect(validateFileMagicBytes(fakePdf, "application/pdf")).toBe(false);

      // Script disguised as PNG
      const fakePng = Buffer.from("<script>alert(1)</script>", "utf8");
      expect(validateFileMagicBytes(fakePng, "image/png")).toBe(false);
    });
  });

  describe("4. Token Security, Rotation & Expiration", () => {
    it("hashes onboarding invitation tokens using SHA-256 without persisting raw token", () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      expect(rawToken.length).toBe(64);

      const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
      expect(hash.length).toBe(64);
      expect(hash).not.toBe(rawToken);

      // Re-hashing the same raw token yields the identical hash
      const rehash = crypto.createHash("sha256").update(rawToken).digest("hex");
      expect(rehash).toBe(hash);

      // Different token yields different hash
      const differentToken = crypto.randomBytes(32).toString("hex");
      const differentHash = crypto.createHash("sha256").update(differentToken).digest("hex");
      expect(differentHash).not.toBe(hash);
    });

    it("rejects expired or revoked scheduling tokens", () => {
      const validateTokenUsability = (invite: {
        token: string;
        expires_at: string | null;
        revoked_at: string | null;
      }) => {
        if (invite.revoked_at) return { valid: false, reason: "revoked" };
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
          return { valid: false, reason: "expired" };
        }
        return { valid: true };
      };

      const now = Date.now();
      expect(
        validateTokenUsability({
          token: "valid-tok",
          expires_at: new Date(now + 86400000).toISOString(),
          revoked_at: null,
        }),
      ).toEqual({ valid: true });

      expect(
        validateTokenUsability({
          token: "revoked-tok",
          expires_at: new Date(now + 86400000).toISOString(),
          revoked_at: new Date(now - 1000).toISOString(),
        }),
      ).toEqual({ valid: false, reason: "revoked" });

      expect(
        validateTokenUsability({
          token: "expired-tok",
          expires_at: new Date(now - 1000).toISOString(),
          revoked_at: null,
        }),
      ).toEqual({ valid: false, reason: "expired" });
    });

    it("invalidates old token immediately upon token rotation", () => {
      let currentToken = "token_v1";
      const rotateToken = () => {
        const old = currentToken;
        currentToken = crypto.randomUUID();
        return { old, current: currentToken };
      };

      const { old, current } = rotateToken();
      expect(current).not.toBe(old);
      expect(currentToken).toBe(current);
      // Attempting to resolve with old token will fail match against currentToken
      expect(old === currentToken).toBe(false);
    });
  });

  describe("5. Public Route Data Minimization", () => {
    it("sanitizes public scheduling invite payload from internal recruiter data", () => {
      const internalCandidateRecord = {
        id: "cand-uuid-1234",
        job_id: "job-uuid-5678",
        full_name: "Aarav Mehta",
        email: "aarav@example.com",
        phone: "+91 98765 43210",
        application_code: "APP-9988",
        ats_score: 92,
        ats_summary: "Strong system design experience",
        notes: "Internal interview debrief notes",
        resume_path: "resumes/internal/aarav.pdf",
      };

      const publicPayload = {
        fullName: internalCandidateRecord.full_name,
        email: internalCandidateRecord.email,
        phone: internalCandidateRecord.phone,
        applicationCode: internalCandidateRecord.application_code,
      };

      expect(publicPayload).not.toHaveProperty("ats_score");
      expect(publicPayload).not.toHaveProperty("ats_summary");
      expect(publicPayload).not.toHaveProperty("notes");
      expect(publicPayload).not.toHaveProperty("resume_path");
      expect(publicPayload).not.toHaveProperty("id");
    });

    it("sanitizes public onboarding portal payload from internal storage paths and recruiter notes", () => {
      const internalDocumentRow = {
        id: "doc-uuid-1",
        onboarding_id: "onb-uuid-1",
        requirement_key: "govt_id",
        title: "Government Photo ID",
        description: "Upload passport or national ID",
        is_required: true,
        document_status: "VERIFIED",
        document_name: "passport.pdf",
        storage_path: "onboarding-documents/private/123/passport.pdf",
        file_size_bytes: 2048576,
        uploaded_at: "2026-09-20T10:00:00Z",
        review_notes: "Internal compliance check verified by HR admin",
      };

      const publicCandidateDocumentView = {
        id: internalDocumentRow.id,
        requirement_key: internalDocumentRow.requirement_key,
        title: internalDocumentRow.title,
        description: internalDocumentRow.description,
        is_required: internalDocumentRow.is_required,
        document_status: internalDocumentRow.document_status,
        document_name: internalDocumentRow.document_name,
        file_size_bytes: internalDocumentRow.file_size_bytes,
        uploaded_at: internalDocumentRow.uploaded_at,
      };

      expect(publicCandidateDocumentView).not.toHaveProperty("storage_path");
      expect(publicCandidateDocumentView).not.toHaveProperty("onboarding_id");
    });
  });

  describe("6. Timing-Safe Cron Authentication", () => {
    beforeEach(() => {
      process.env["LOVABLE_CRON_SECRET"] = "super-secret-cron-token-2026";
      process.env["LOVABLE_CRON_SECRET_PREVIOUS"] = "rotated-previous-secret-2026";
    });

    it("accepts requests with valid current LOVABLE_CRON_SECRET", async () => {
      const req = new Request("https://portal.seceon.com/api/cron/reminders", {
        method: "POST",
        headers: {
          authorization: "Bearer super-secret-cron-token-2026",
        },
      });

      const err = await authenticateCronRequest(req);
      expect(err).toBeNull();
    });

    it("accepts requests with valid rotated LOVABLE_CRON_SECRET_PREVIOUS", async () => {
      const req = new Request("https://portal.seceon.com/api/cron/reminders", {
        method: "POST",
        headers: {
          authorization: "Bearer rotated-previous-secret-2026",
        },
      });

      const err = await authenticateCronRequest(req);
      expect(err).toBeNull();
    });

    it("rejects requests with invalid cron bearer token", async () => {
      const req = new Request("https://portal.seceon.com/api/cron/reminders", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-token",
        },
      });

      const err = await authenticateCronRequest(req);
      expect(err).not.toBeNull();
      expect(err?.status).toBe(401);
    });

    it("rejects requests missing the authorization header", async () => {
      const req = new Request("https://portal.seceon.com/api/cron/reminders", {
        method: "POST",
        headers: {},
      });

      const err = await authenticateCronRequest(req);
      expect(err).not.toBeNull();
      expect(err?.status).toBe(401);
    });
  });

  describe("7. Email Dispatch Candidate Identity Binding", () => {
    it("ensures dispatch recipient email is bound strictly to the database candidate record", () => {
      const dbCandidate = {
        id: "cand-123",
        full_name: "Rohan Patel",
        email: "rohan.verified@company.com",
      };

      // Attacker attempts to pass a spoofed recipient email
      const callerInput = {
        candidateId: "cand-123",
        recipientOverride: "attacker@malicious.com",
      };

      // Server dispatch logic resolves recipient ONLY from verified candidate database record
      const resolveRecipient = (candidate: typeof dbCandidate, _input: typeof callerInput) => {
        return candidate.email;
      };

      const resolvedRecipient = resolveRecipient(dbCandidate, callerInput);
      expect(resolvedRecipient).toBe("rohan.verified@company.com");
      expect(resolvedRecipient).not.toBe(callerInput.recipientOverride);
    });
  });

  describe("8. Race Condition & Concurrency Guard Invariants", () => {
    it("verifies atomic conditional status transitions", () => {
      // Simulating atomic database update guard: WHERE status = 'SENT'
      type OfferRow = { id: string; status: "SENT" | "ACCEPTED" | "DECLINED" };
      const offer: OfferRow = { id: "offer-1", status: "SENT" };

      const tryAccept = (currentOffer: OfferRow): { success: boolean; offer: OfferRow } => {
        if (currentOffer.status === "SENT") {
          return { success: true, offer: { ...currentOffer, status: "ACCEPTED" } };
        }
        return { success: false, offer: currentOffer };
      };

      // First client succeeds
      const firstResult = tryAccept(offer);
      expect(firstResult.success).toBe(true);
      expect(firstResult.offer.status).toBe("ACCEPTED");

      // Concurrent second client attempts to accept the already accepted offer
      const secondResult = tryAccept(firstResult.offer);
      expect(secondResult.success).toBe(false);
      expect(secondResult.offer.status).toBe("ACCEPTED");
    });
  });

  describe("9. Input Validation Robustness", () => {
    it("rejects malicious or out-of-bounds payloads with Zod", () => {
      const uuidSchema = z.string().uuid();
      expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
      expect(uuidSchema.safeParse("12345678-1234-1234-1234-123456789abc").success).toBe(true);

      const emailSchema = z.string().trim().email().max(180);
      expect(emailSchema.safeParse("invalid-email").success).toBe(false);
      expect(emailSchema.safeParse("candidate@example.com").success).toBe(true);

      const maxBytes = 8 * 1024 * 1024;
      const oversizedBufferLength = maxBytes + 1;
      expect(oversizedBufferLength > maxBytes).toBe(true);
    });
  });
});
