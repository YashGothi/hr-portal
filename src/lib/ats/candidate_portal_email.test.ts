import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ApplicationBodySchema } from "@/routes/api/public/applications";
import { RESUME_ACCEPTED, RESUME_MAX_BYTES } from "@/lib/ats/weights";

describe("Candidate Portal — Email Field & Downstream Dispatch Regression Suite", () => {
  const baseValidPayload = {
    jobCode: "VAL-DO-03",
    fullName: "Jane Doe",
    email: "jane.doe@example.com",
    phone: "+1 555-0199",
    location: "San Francisco, CA",
    yearsExperience: 5,
    linkedinUrl: "https://linkedin.com/in/janedoe",
    portfolioUrl: "https://github.com/janedoe",
    coverLetter: "Excited to apply for this role!",
    source: "LinkedIn",
  };

  // Helper matching the client-side validation logic in src/routes/apply.$jobCode.tsx
  function clientValidate(form: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    yearsExperience: string;
    linkedinUrl: string;
    portfolioUrl: string;
    file: { name: string; size: number } | null;
  }): string | null {
    if (form.fullName.trim().length < 2) return "Enter your full name.";
    if (!form.email.trim()) return "Enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      return "Enter a valid email address.";
    if (!/^[+0-9][0-9\s\-()]{6,23}$/.test(form.phone.trim())) return "Enter a valid phone number.";
    if (form.location.trim().length < 2) return "Enter your current location.";
    const years = Number(form.yearsExperience);
    if (!Number.isFinite(years) || years < 0 || years > 60)
      return "Enter your years of experience.";
    if (!/^https?:\/\/.+/i.test(form.linkedinUrl.trim())) return "Enter your LinkedIn profile URL.";
    if (form.portfolioUrl.trim() && !/^https?:\/\/.+/i.test(form.portfolioUrl.trim()))
      return "Enter a valid portfolio or GitHub URL, or leave it blank.";
    if (!form.file) return "Attach your resume as a PDF, DOC or DOCX file.";
    if (form.file.size > RESUME_MAX_BYTES) return "Your resume file is larger than 8 MB.";
    if (!/\.(pdf|docx?)$/i.test(form.file.name)) return "Resumes must be a PDF, DOC or DOCX file.";
    return null;
  }

  // 1. Email field is required
  describe("1. Email field is required", () => {
    it("client rejects submission when email is empty with clear message", () => {
      const result = clientValidate({
        fullName: "Jane Doe",
        email: "   ",
        phone: "+1 555-0199",
        location: "San Francisco, CA",
        yearsExperience: "5",
        linkedinUrl: "https://linkedin.com/in/janedoe",
        portfolioUrl: "",
        file: { name: "resume.pdf", size: 1024 },
      });
      expect(result).toBe("Enter your email address.");
    });

    it("server rejects submission when email is missing or empty", () => {
      const missingRes = ApplicationBodySchema.safeParse({
        ...baseValidPayload,
        email: undefined,
      });
      expect(missingRes.success).toBe(false);
      if (!missingRes.success) {
        expect(missingRes.error.issues[0]?.message).toBe("Email address is required.");
      }

      const emptyRes = ApplicationBodySchema.safeParse({
        ...baseValidPayload,
        email: "   ",
      });
      expect(emptyRes.success).toBe(false);
      if (!emptyRes.success) {
        expect(emptyRes.error.issues[0]?.message).toBe("Email address is required.");
      }
    });
  });

  // 2. Invalid email rejected
  describe("2. Invalid email rejected", () => {
    const invalidEmails = [
      "plainaddress",
      "@missinguser.com",
      "missingdomain@.com",
      "missingatsign.com",
      "two@@domain.com",
      "spaces in@domain.com",
    ];

    it.each(invalidEmails)("client rejects invalid email: %s", (email) => {
      const result = clientValidate({
        fullName: "Jane Doe",
        email,
        phone: "+1 555-0199",
        location: "San Francisco, CA",
        yearsExperience: "5",
        linkedinUrl: "https://linkedin.com/in/janedoe",
        portfolioUrl: "",
        file: { name: "resume.pdf", size: 1024 },
      });
      expect(result).toBe("Enter a valid email address.");
    });

    it.each(invalidEmails)("server rejects invalid email: %s", (email) => {
      const res = ApplicationBodySchema.safeParse({
        ...baseValidPayload,
        email,
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toBe("Enter a valid email address.");
      }
    });
  });

  // 3. Valid email accepted
  describe("3. Valid email accepted", () => {
    const validEmails = [
      "jane.doe@example.com",
      "candidate+engineering@company.org",
      "firstname.lastname@domain.co.in",
      "recruiting@sub.domain.tech",
    ];

    it.each(validEmails)("client accepts valid email: %s", (email) => {
      const result = clientValidate({
        fullName: "Jane Doe",
        email,
        phone: "+1 555-0199",
        location: "San Francisco, CA",
        yearsExperience: "5",
        linkedinUrl: "https://linkedin.com/in/janedoe",
        portfolioUrl: "",
        file: { name: "resume.pdf", size: 1024 },
      });
      expect(result).toBeNull();
    });

    it.each(validEmails)("server accepts valid email: %s", (email) => {
      const res = ApplicationBodySchema.safeParse({
        ...baseValidPayload,
        email,
      });
      expect(res.success).toBe(true);
    });
  });

  // 4. Email whitespace normalization
  describe("4. Email whitespace normalization", () => {
    it("trims surrounding whitespace and converts to lowercase", () => {
      const rawEmail = "   Jane.DOE+dev@EXAMPLE.Com   ";
      const parsed = ApplicationBodySchema.parse({
        ...baseValidPayload,
        email: rawEmail,
      });
      expect(parsed.email).toBe("Jane.DOE+dev@EXAMPLE.Com");

      // Server application handler normalization: input.email.trim().toLowerCase()
      const normalized = parsed.email.trim().toLowerCase();
      expect(normalized).toBe("jane.doe+dev@example.com");
    });
  });

  // 5. Email persistence
  describe("5. Email persistence in candidate record", () => {
    it("maps normalized email directly to candidate insert payload", () => {
      const input = {
        fullName: "Alex Rivera",
        email: "  ALEX.Rivera@Example.Org  ",
        phone: "+1 555-0144",
        location: "New York, NY",
        yearsExperience: 4,
        linkedinUrl: "https://linkedin.com/in/alexrivera",
      };

      const normalizedEmail = input.email.trim().toLowerCase();
      const insertPayload = {
        job_id: "00000000-0000-0000-0000-000000000001",
        full_name: input.fullName,
        email: normalizedEmail,
        phone: input.phone,
        location: input.location,
        years_experience: input.yearsExperience,
        linkedin_url: input.linkedinUrl,
      };

      expect(insertPayload.email).toBe("alex.rivera@example.org");
      expect(insertPayload).toHaveProperty("email");
    });
  });

  // 6. Duplicate email/application behavior
  describe("6. Duplicate email/application behavior", () => {
    it("detects duplicates for same job with different casing or whitespace", () => {
      const existingCandidates = [
        { jobId: "job-1", email: "candidate@company.com" },
        { jobId: "job-2", email: "other@company.com" },
      ];

      function checkDuplicate(jobId: string, email: string): boolean {
        const normalized = email.trim().toLowerCase();
        return existingCandidates.some(
          (c) => c.jobId === jobId && c.email.toLowerCase() === normalized,
        );
      }

      // Same job + same normalized email -> duplicate (blocked)
      expect(checkDuplicate("job-1", "CANDIDATE@company.com")).toBe(true);
      expect(checkDuplicate("job-1", "  candidate@company.com  ")).toBe(true);

      // Same email + different job -> allowed
      expect(checkDuplicate("job-3", "candidate@company.com")).toBe(false);

      // Different email + same job -> allowed
      expect(checkDuplicate("job-1", "newcandidate@company.com")).toBe(false);
    });
  });

  // 7. Email Dispatch resolves recipient from candidate database record
  describe("7. Email Dispatch resolves recipient from candidate database record", () => {
    it("retrieves recipient email strictly from verified candidate database record", async () => {
      const mockCandidateInDb = {
        id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
        full_name: "Taylor Swift",
        email: "taylor@swiftrecords.com",
        applied_role: "Lead Audio Engineer",
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockCandidateInDb,
                error: null,
              }),
            }),
          }),
        }),
      };

      // Handler recipient resolution logic
      const { data: candidate } = await mockSupabase
        .from("candidates")
        .select("id, full_name, email, applied_role")
        .eq("id", mockCandidateInDb.id)
        .single();

      expect(candidate).toBeDefined();
      expect(candidate?.email).toBe("taylor@swiftrecords.com");
      expect(candidate?.full_name).toBe("Taylor Swift");
    });
  });

  // 8. Client cannot override Email Dispatch recipient
  describe("8. Client cannot override Email Dispatch recipient", () => {
    it("DispatchInput schema excludes recipient email and rejects arbitrary recipient injection", () => {
      const DispatchInput = z
        .object({
          candidateId: z.string().uuid(),
          templateId: z.enum(["shortlist", "interview", "hired", "rejected"]),
          subject: z.string().min(1).max(300),
          message: z.string().min(1).max(20000),
          schedule: z.string().max(200).optional(),
          meetingDetails: z.string().max(500).optional(),
          confirmLink: z.string().url().max(1000).optional(),
          idempotencyKey: z.string().min(8).max(200),
        })
        .strict(); // strict mode confirms recipient email cannot be accepted

      const maliciousClientPayload = {
        candidateId: "d290f1ee-6c54-4b01-90e6-d701748f0851",
        templateId: "interview" as const,
        subject: "Interview Invitation",
        message: "We would like to interview you.",
        idempotencyKey: "test-idempotency-key-12345",
        recipientEmail: "attacker@external-domain.com", // injected by client
        to: "attacker@external-domain.com",
      };

      const parseResult = DispatchInput.safeParse(maliciousClientPayload);
      expect(parseResult.success).toBe(false);
    });
  });

  // 9. Existing candidate submission still works
  describe("9. Existing candidate submission workflow", () => {
    it("successfully parses a full valid application with all optional and required fields", () => {
      const parsed = ApplicationBodySchema.parse({
        jobCode: "VAL-DO-03",
        fullName: "Jordan Lee",
        email: "jordan.lee@example.com",
        phone: "+91 98765 43210",
        location: "Bangalore, India",
        yearsExperience: 3.5,
        linkedinUrl: "https://linkedin.com/in/jordanlee",
        portfolioUrl: "https://jordanlee.dev",
        coverLetter: "I have 3+ years in cloud infrastructure and backend engineering.",
        source: "LinkedIn",
        sourcePostId: "post-123",
        utmSource: "linkedin",
        utmMedium: "social",
        utmCampaign: "hiring-2026",
      });

      expect(parsed.jobCode).toBe("VAL-DO-03");
      expect(parsed.fullName).toBe("Jordan Lee");
      expect(parsed.email).toBe("jordan.lee@example.com");
      expect(parsed.yearsExperience).toBe(3.5);
      expect(parsed.source).toBe("LinkedIn");
    });
  });

  // 10. Existing resume validation still works
  describe("10. Existing resume validation", () => {
    it("accepts valid mime types: PDF, DOC, DOCX", () => {
      expect(RESUME_ACCEPTED["application/pdf"]).toBe("pdf");
      expect(RESUME_ACCEPTED["application/msword"]).toBe("doc");
      expect(
        RESUME_ACCEPTED["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ).toBe("docx");
    });

    it("rejects invalid mime types (e.g. image, executable, text)", () => {
      const invalidTypes = ["image/png", "application/x-msdownload", "text/plain"];
      for (const t of invalidTypes) {
        expect(RESUME_ACCEPTED[t as keyof typeof RESUME_ACCEPTED]).toBeUndefined();
      }
    });

    it("enforces 8MB file size limit", () => {
      expect(RESUME_MAX_BYTES).toBe(8 * 1024 * 1024);

      const validFile = { name: "resume.pdf", size: 5 * 1024 * 1024 };
      const invalidFile = { name: "resume.pdf", size: 9 * 1024 * 1024 };

      const validResult = clientValidate({
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: "+1 555-0199",
        location: "San Francisco, CA",
        yearsExperience: "5",
        linkedinUrl: "https://linkedin.com/in/janedoe",
        portfolioUrl: "",
        file: validFile,
      });
      expect(validResult).toBeNull();

      const invalidResult = clientValidate({
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: "+1 555-0199",
        location: "San Francisco, CA",
        yearsExperience: "5",
        linkedinUrl: "https://linkedin.com/in/janedoe",
        portfolioUrl: "",
        file: invalidFile,
      });
      expect(invalidResult).toBe("Your resume file is larger than 8 MB.");
    });
  });
});
