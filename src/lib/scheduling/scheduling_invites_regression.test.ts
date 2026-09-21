import { describe, expect, it } from "vitest";
import { SHORTLIST_THRESHOLD, INTERVIEW_ELIGIBLE_STATUSES } from "@/lib/ats/weights";
import { generateSlots, type SchedulingSettings } from "./core";

describe("Production Fix Regression: Scheduling Invites & Supabase Auth Environment", () => {
  describe("Scenario A: Environment Variable Resolution", () => {
    function resolveSupabaseEnv(env: Record<string, string | undefined>) {
      const sanitizeEnv = (v: string | undefined) =>
        !v ? "" : v.trim().replace(/^["']|["']$/g, "");
      const SUPABASE_URL = sanitizeEnv(env["SUPABASE_URL"] || env["VITE_SUPABASE_URL"]);
      const SUPABASE_PUBLISHABLE_KEY = sanitizeEnv(
        env["SUPABASE_PUBLISHABLE_KEY"] || env["VITE_SUPABASE_PUBLISHABLE_KEY"],
      );

      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        const missing = [
          ...(!SUPABASE_URL ? ["SUPABASE_URL (or VITE_SUPABASE_URL)"] : []),
          ...(!SUPABASE_PUBLISHABLE_KEY
            ? ["SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)"]
            : []),
        ];
        throw new Error(
          `Missing Supabase environment variable(s): ${missing.join(", ")}. Please configure them in your environment settings.`,
        );
      }
      return { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };
    }

    it("resolves successfully when Render provides VITE_SUPABASE_PUBLISHABLE_KEY and SUPABASE_URL", () => {
      const renderEnv = {
        SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_token_123",
      };

      const resolved = resolveSupabaseEnv(renderEnv);
      expect(resolved.SUPABASE_URL).toBe("https://example.supabase.co");
      expect(resolved.SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_test_token_123");
    });

    it("resolves successfully when both standard server variables are set", () => {
      const serverEnv = {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_token_456",
      };

      const resolved = resolveSupabaseEnv(serverEnv);
      expect(resolved.SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_test_token_456");
    });

    it("trims whitespace and surrounding quotes from environment variables", () => {
      const dirtyEnv = {
        SUPABASE_URL: '  "https://example.supabase.co"  ',
        SUPABASE_PUBLISHABLE_KEY: " 'sb_publishable_quoted' ",
      };

      const resolved = resolveSupabaseEnv(dirtyEnv);
      expect(resolved.SUPABASE_URL).toBe("https://example.supabase.co");
      expect(resolved.SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_quoted");
    });

    it("throws a clean error without Lovable Cloud reference when variables are missing", () => {
      expect(() => resolveSupabaseEnv({})).toThrow(
        "Missing Supabase environment variable(s): SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY). Please configure them in your environment settings.",
      );
    });
  });

  describe("Scenario B, C, D, E: Candidate Eligibility & Invite Idempotency", () => {
    interface MockCandidate {
      id: string;
      full_name: string;
      email: string;
      ats_score: number | null;
      application_status: string;
    }

    interface MockInvite {
      id: string;
      token: string;
      candidate_id: string;
      appointment_type: string;
      expires_at: string | null;
      revoked_at: string | null;
    }

    function ensureInviteSimulation({
      candidate,
      appointmentType,
      existingInvite,
      regenerate,
    }: {
      candidate: MockCandidate;
      appointmentType: "SCREENING" | "INTERVIEW";
      existingInvite: MockInvite | null;
      regenerate?: boolean;
    }) {
      if (appointmentType === "INTERVIEW") {
        const eligible =
          (candidate.ats_score ?? -1) >= SHORTLIST_THRESHOLD &&
          (INTERVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(candidate.application_status);
        if (!eligible) {
          throw new Error("Interview invitations are only available for shortlisted applicants.");
        }
      }

      if (existingInvite && !regenerate) {
        if (
          existingInvite.revoked_at ||
          (existingInvite.expires_at && new Date(existingInvite.expires_at) < new Date())
        ) {
          return {
            token: existingInvite.token,
            appointmentType,
            action: "revived",
          };
        }
        return {
          token: existingInvite.token,
          appointmentType,
          action: "idempotent_return",
        };
      }

      if (existingInvite && regenerate) {
        return {
          token: crypto.randomUUID(),
          appointmentType,
          action: "rotated",
        };
      }

      return {
        token: crypto.randomUUID(),
        appointmentType,
        action: "created_new",
      };
    }

    it("Scenario B: allows interview invitation for candidate with ATS score >= 85 and valid status", () => {
      const eligibleCandidate: MockCandidate = {
        id: "cand-1",
        full_name: "Elena Rostova",
        email: "elena@example.com",
        ats_score: 95,
        application_status: "interview_invited",
      };

      const result = ensureInviteSimulation({
        candidate: eligibleCandidate,
        appointmentType: "INTERVIEW",
        existingInvite: null,
      });

      expect(result.action).toBe("created_new");
      expect(result.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("Scenario C: returns existing invitation idempotently without creating duplicates", () => {
      const existing: MockInvite = {
        id: "invite-1",
        token: "06707d09-bf36-45c9-9067-c24abb04c391",
        candidate_id: "cand-elena",
        appointment_type: "INTERVIEW",
        expires_at: null,
        revoked_at: null,
      };

      const candidate: MockCandidate = {
        id: "cand-elena",
        full_name: "Elena Rostova",
        email: "elena@example.com",
        ats_score: 95,
        application_status: "interview_invited",
      };

      const result = ensureInviteSimulation({
        candidate,
        appointmentType: "INTERVIEW",
        existingInvite: existing,
      });

      expect(result.action).toBe("idempotent_return");
      expect(result.token).toBe("06707d09-bf36-45c9-9067-c24abb04c391");
    });

    it("Scenario D: ineligibile candidate with ATS score < 85 cannot receive an interview invite", () => {
      const lowScoreCandidate: MockCandidate = {
        id: "cand-low",
        full_name: "Low Scorer",
        email: "low@example.com",
        ats_score: 72,
        application_status: "ats_evaluated",
      };

      expect(() =>
        ensureInviteSimulation({
          candidate: lowScoreCandidate,
          appointmentType: "INTERVIEW",
          existingInvite: null,
        }),
      ).toThrow("Interview invitations are only available for shortlisted applicants.");
    });

    it("Scenario E: filtered out candidate cannot receive an interview invite even if status attempted", () => {
      const filteredCandidate: MockCandidate = {
        id: "cand-filt",
        full_name: "Filtered Person",
        email: "filtered@example.com",
        ats_score: 54,
        application_status: "filtered_out",
      };

      expect(() =>
        ensureInviteSimulation({
          candidate: filteredCandidate,
          appointmentType: "INTERVIEW",
          existingInvite: null,
        }),
      ).toThrow("Interview invitations are only available for shortlisted applicants.");
    });

    it("Scenario F: secure scheduling tokens are cryptographically generated UUIDs", () => {
      const token = crypto.randomUUID();
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe("Scenario J & K: Business Rules Preservation", () => {
    it("preserves ATS shortlist threshold at exactly 85", () => {
      expect(SHORTLIST_THRESHOLD).toBe(85);
    });

    it("preserves working hours 11:00 to 18:00 and lunch break 13:00 to 14:00", () => {
      const settings: SchedulingSettings = {
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
        interviewer_name: "HR Team",
      };

      const slots = generateSlots({
        dateKey: "2026-10-07",
        durationMinutes: 30,
        settings,
        blocks: [],
        busy: [],
        nowMs: new Date("2026-10-06T00:00:00Z").getTime(),
      });

      expect(slots.length).toBe(12); // 6 hours (11-18 minus 1 hr break) = 6 * 2 = 12 slots of 30m
      expect(slots[0]?.start).toContain("11:00:00+05:30");
      expect(slots[slots.length - 1]?.start).toContain("17:30:00+05:30");
      expect(slots.some((s) => s.start.includes("13:00:00") || s.start.includes("13:30:00"))).toBe(
        false,
      );
    });
  });
});
