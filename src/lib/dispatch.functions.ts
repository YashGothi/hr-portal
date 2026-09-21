import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DispatchInput = z.object({
  candidateId: z.string().uuid(),
  templateId: z.enum(["shortlist", "interview", "hired", "rejected"]),
  /** Subject/body as shown in the Email Dispatch editor (already personalized). */
  subject: z.string().min(1).max(300),
  message: z.string().min(1).max(20000),
  schedule: z.string().max(200).optional(),
  meetingDetails: z.string().max(500).optional(),
  confirmLink: z.string().url().max(1000).optional(),
  /** Stable key derived from the dispatch action so retries do not duplicate sends. */
  idempotencyKey: z.string().min(8).max(200),
});

export type DispatchResult =
  { sent: true } | { sent: false; reason: "recipient_suppressed" | "no_email" };

/**
 * Sends one personalized candidate email from Email Dispatch. One call sends
 * to exactly one candidate; the page calls it per recipient. Auth-protected —
 * candidate data is read as the signed-in HR user, so RLS applies.
 */
export const sendDispatchEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => DispatchInput.parse(data))
  .handler(async ({ data, context }): Promise<DispatchResult> => {
    const { data: candidate, error } = await context.supabase
      .from("candidates")
      .select("id, full_name, email, applied_role")
      .eq("id", data.candidateId)
      .single();
    if (error || !candidate) {
      throw new Error("Candidate not found");
    }
    if (!candidate.email) {
      return { sent: false, reason: "no_email" };
    }

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail(data.templateId, candidate.email, {
      templateData: {
        candidateName: candidate.full_name,
        role: candidate.applied_role ?? "the position",
        subject: data.subject,
        message: data.message,
        schedule: data.schedule,
        meetingDetails: data.meetingDetails,
        confirmLink: data.confirmLink,
      },
      idempotencyKey: data.idempotencyKey,
      replyTo: "hr.apac@seceon.com",
    });
    return result;
  });
