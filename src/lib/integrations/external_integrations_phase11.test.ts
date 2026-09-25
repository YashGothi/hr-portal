import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeEmailEventType, processEmailWebhook } from "@/lib/integrations/email-provider";
import { getUniversalCalendarLinks } from "@/lib/scheduling/calendar-integration";
import { provisionVideoMeeting } from "@/lib/scheduling/video-meeting-provider";
import {
  signOutboundPayload,
  dispatchHrisSync,
  dispatchPayrollSync,
  type HrisEmployeePacket,
} from "@/lib/integrations/hris-payroll.server";
import { parseCsv } from "@/lib/linkedin-import";

describe("PHASE 11: External Integrations Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("1. Email Provider & Inbound Webhooks", () => {
    it("normalizes provider event types into canonical delivery statuses", () => {
      expect(normalizeEmailEventType("email.delivered")).toBe("delivered");
      expect(normalizeEmailEventType("DELIVERY")).toBe("delivered");
      expect(normalizeEmailEventType("email.bounced")).toBe("bounced");
      expect(normalizeEmailEventType("hard_bounce")).toBe("bounced");
      expect(normalizeEmailEventType("recipient_suppressed")).toBe("suppressed");
      expect(normalizeEmailEventType("spam_complaint")).toBe("complaint");
      expect(normalizeEmailEventType("send_failure")).toBe("failed");
      expect(normalizeEmailEventType("other_event")).toBe("unknown");
    });

    it("fails closed when neither RESEND_API_KEY nor LOVABLE_API_KEY is configured", async () => {
      delete process.env["LOVABLE_WEBHOOK_SECRET"];
      delete process.env["LOVABLE_API_KEY"];
      delete process.env["RESEND_API_KEY"];

      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await expect(
        sendTemplateEmail("shortlist", "test@example.com", {
          templateData: { candidateName: "Alex" },
        }),
      ).rejects.toThrow(/Neither RESEND_API_KEY nor LOVABLE_API_KEY is configured/);
    });

    it("dispatches emails via Resend API when RESEND_API_KEY is set", async () => {
      process.env["RESEND_API_KEY"] = "re_test_key_123456789";
      delete process.env["LOVABLE_API_KEY"];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "resend-msg-123" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("shortlist", "candidate@seceon.com", {
        templateData: { candidateName: "Elena", role: "DevOps Lead" },
        idempotencyKey: "test-idem-key-123",
      });

      expect(result).toEqual({ sent: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer re_test_key_123456789",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    it("reports Resend (Cloudflare DNS) provider status when RESEND_API_KEY is active", async () => {
      process.env["RESEND_API_KEY"] = "re_test_key_123456789";
      const { evaluateSenderDns } = await import("@/lib/dns-check.functions");

      const status = await evaluateSenderDns();
      expect(status.live).toBe(true);
      expect(status.provider).toBe("Resend (Cloudflare DNS)");
      expect(status.records.some((r) => r.label.includes("Resend"))).toBe(true);
    });

    it("fails closed when webhook secret is missing from environment", async () => {
      delete process.env["LOVABLE_WEBHOOK_SECRET"];
      delete process.env["LOVABLE_API_KEY"];

      const req = new Request("https://portal.seceon.com/api/webhooks/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "delivered" }),
      });

      await expect(processEmailWebhook(req)).rejects.toThrow(/Server configuration missing/);
    });

    it("rejects forged webhook requests with missing or invalid signature", async () => {
      process.env["LOVABLE_WEBHOOK_SECRET"] = "test-secret-key-12345";

      const req = new Request("https://portal.seceon.com/api/webhooks/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lovable-timestamp": Date.now().toString(),
          "x-lovable-signature": "forged_signature_hex",
        },
        body: JSON.stringify({ type: "email.delivered", data: { email: "test@example.com" } }),
      });

      await expect(processEmailWebhook(req)).rejects.toThrow();
    });
  });

  describe("2. Universal Calendar Deep Links", () => {
    const sampleEvent = {
      uid: "interview-apt-101",
      title: "Technical Interview: Staff Security Engineer",
      description: "Discussion on infrastructure hardening with the Engineering Lead.",
      location: "https://meet.google.com/sec-test-room",
      startAt: "2026-10-15T14:00:00.000Z",
      endAt: "2026-10-15T14:45:00.000Z",
      timezone: "Asia/Kolkata",
      organizer: "Talent Acquisition",
    };

    it("generates valid Google Calendar 1-click deep links", () => {
      const links = getUniversalCalendarLinks(sampleEvent);
      expect(links.google).toContain("https://calendar.google.com/calendar/render");
      expect(links.google).toContain("action=TEMPLATE");
      expect(links.google).toContain(encodeURIComponent(sampleEvent.title));
      expect(links.google).toContain("dates=20261015T140000Z/20261015T144500Z");
      expect(links.google).toContain(encodeURIComponent(sampleEvent.location));
    });

    it("generates valid Office 365 and Outlook Live deep links", () => {
      const links = getUniversalCalendarLinks(sampleEvent);
      expect(links.outlook365).toContain("https://outlook.office.com/calendar/0/deeplink/compose");
      expect(links.outlook365).toContain(encodeURIComponent(sampleEvent.title));
      expect(links.outlook365).toContain(encodeURIComponent(sampleEvent.startAt));

      expect(links.outlookLive).toContain("https://outlook.live.com/calendar/0/deeplink/compose");
      expect(links.outlookLive).toContain(encodeURIComponent(sampleEvent.title));
    });

    it("generates compliant RFC 5545 iCalendar (.ics) download URI", () => {
      const links = getUniversalCalendarLinks(sampleEvent);
      expect(links.icsDownloadUrl.startsWith("data:text/calendar;charset=utf-8,")).toBe(true);

      const decoded = decodeURIComponent(
        links.icsDownloadUrl.replace("data:text/calendar;charset=utf-8,", ""),
      );
      expect(decoded).toContain("BEGIN:VCALENDAR");
      expect(decoded).toContain("VERSION:2.0");
      expect(decoded).toContain("BEGIN:VEVENT");
      expect(decoded).toContain(`UID:${sampleEvent.uid}@aihive`);
      expect(decoded).toContain("SUMMARY:Technical Interview: Staff Security Engineer");
      expect(decoded).toContain("STATUS:CONFIRMED");
      expect(decoded).toContain("END:VEVENT");
      expect(decoded).toContain("END:VCALENDAR");
    });
  });

  describe("3. Video Meeting Provider Provisioning & Fallbacks", () => {
    it("falls back to recruiter default meeting URL when no dynamic provider is configured", async () => {
      delete process.env["ZOOM_ACCOUNT_ID"];
      delete process.env["ZOOM_CLIENT_ID"];
      delete process.env["ZOOM_CLIENT_SECRET"];

      const result = await provisionVideoMeeting({
        topic: "Interview",
        startAt: "2026-10-15T10:00:00Z",
        durationMinutes: 45,
        defaultMeetingUrl: "https://meet.google.com/recruiter-room-99",
      });

      expect(result.provider).toBe("static");
      expect(result.meetingUrl).toBe("https://meet.google.com/recruiter-room-99");
      expect(result.fallbackUsed).toBe(true);
    });

    it("provisions dynamic Zoom meeting when Zoom server-to-server credentials are configured", async () => {
      process.env["ZOOM_ACCOUNT_ID"] = "zoom_acc_test";
      process.env["ZOOM_CLIENT_ID"] = "zoom_client_test";
      process.env["ZOOM_CLIENT_SECRET"] = "zoom_secret_test";

      const result = await provisionVideoMeeting({
        topic: "Security Interview",
        startAt: "2026-10-15T10:00:00Z",
        durationMinutes: 45,
      });

      expect(result.provider).toBe("zoom");
      expect(result.meetingUrl).toContain("https://zoom.us/j/");
      expect(result.meetingId).toBeDefined();
      expect(result.fallbackUsed).toBe(false);
    });
  });

  describe("4. HRIS & Payroll Outbound Boundaries", () => {
    const samplePacket: HrisEmployeePacket = {
      candidateId: "cand-uuid-8888",
      applicationCode: "APP-8888",
      fullName: "Ananya Deshmukh",
      email: "ananya.d@company.com",
      phone: "+91 99887 76655",
      location: "Bengaluru, India",
      jobTitle: "Senior DevOps Architect",
      department: "Infrastructure & Security",
      employmentType: "Full-time",
      startDate: "2026-11-01",
      compensation: 2800000,
      currency: "INR",
      verifiedDocuments: [
        {
          requirementKey: "national_id",
          title: "National Identity Card",
          documentStatus: "VERIFIED",
          verifiedAt: "2026-09-22T12:00:00Z",
        },
      ],
      onboardingCompletedAt: "2026-09-22T12:30:00Z",
    };

    it("cryptographically signs outbound payloads with HMAC-SHA256", () => {
      const payloadJson = JSON.stringify(samplePacket);
      const secret = "shared-integration-secret";
      const sig1 = signOutboundPayload(payloadJson, secret);
      const sig2 = signOutboundPayload(payloadJson, secret);

      expect(sig1).toBe(sig2);
      expect(sig1.length).toBe(64); // SHA-256 hex string

      // Modifying payload changes the signature
      const modifiedPayload = JSON.stringify({ ...samplePacket, compensation: 3000000 });
      const sigModified = signOutboundPayload(modifiedPayload, secret);
      expect(sigModified).not.toBe(sig1);
    });

    it("defers HRIS dispatch gracefully when HRIS_WEBHOOK_URL is not set", async () => {
      delete process.env["HRIS_WEBHOOK_URL"];

      const result = await dispatchHrisSync(samplePacket);
      expect(result.ok).toBe(true);
      expect(result.status).toBe("deferred");
      expect(result.target).toBe("HRIS");
      expect(result.reason).toContain("not configured");
    });

    it("defers Payroll dispatch gracefully when PAYROLL_WEBHOOK_URL is not set", async () => {
      delete process.env["PAYROLL_WEBHOOK_URL"];

      const result = await dispatchPayrollSync(samplePacket);
      expect(result.ok).toBe(true);
      expect(result.status).toBe("deferred");
      expect(result.target).toBe("PAYROLL");
      expect(result.reason).toContain("not configured");
    });

    it("dispatches signed payload to HRIS endpoint when configured", async () => {
      process.env["HRIS_WEBHOOK_URL"] = "https://mock-hris.internal.corp/api/v1/onboard";
      process.env["HRIS_WEBHOOK_SECRET"] = "corp-hris-secret-key";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await dispatchHrisSync(samplePacket);
      expect(result.ok).toBe(true);
      expect(result.status).toBe("dispatched");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://mock-hris.internal.corp/api/v1/onboard",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-HRPortal-Signature": expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
          }),
        }),
      );
    });
  });

  describe("5. LinkedIn Data Boundaries & Ingestion Resilience", () => {
    it("parses LinkedIn applicant export CSV with quoted fields and special characters", () => {
      const csvContent = `Name,Email,Phone,Role,LinkedIn URL
"Vikram Singh, PhD",vikram@tech.in,"+91 98765 12345","Lead Cryptographer","https://linkedin.com/in/vikram-s"
"Sneha Roy",sneha@roy.org,"+91 98765 54321","Backend Engineer","https://linkedin.com/in/sneha"`;

      const parsed = parseCsv(csvContent);
      expect(parsed.length).toBe(3); // 1 header + 2 data rows
      expect(parsed[1]?.[0]).toBe("Vikram Singh, PhD");
      expect(parsed[1]?.[1]).toBe("vikram@tech.in");
      expect(parsed[2]?.[0]).toBe("Sneha Roy");
    });
  });
});
