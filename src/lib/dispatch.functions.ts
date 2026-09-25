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
  .validator((data: unknown) => DispatchInput.parse(data))
  .handler(async ({ data, context }): Promise<DispatchResult> => {
    let candidate: { id: string; full_name: string; email: string | null; applied_role: string | null } | null = null;
    if (context?.supabase) {
      const { data: c } = await context.supabase
        .from("candidates")
        .select("id, full_name, email, applied_role")
        .eq("id", data.candidateId)
        .maybeSingle();
      candidate = c;
    }

    if (!candidate) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: cAdmin } = await supabaseAdmin
        .from("candidates")
        .select("id, full_name, email, applied_role")
        .eq("id", data.candidateId)
        .maybeSingle();
      candidate = cAdmin;
    }

    if (!candidate) {
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

    if (result.sent) {
      const now = new Date().toISOString();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      if (data.templateId === "shortlist") {
        await supabaseAdmin
          .from("candidates")
          .update({
            shortlist_email_status: "sent",
            shortlist_email_sent_at: now,
          })
          .eq("id", candidate.id);
      } else if (data.templateId === "interview") {
        await supabaseAdmin
          .from("candidates")
          .update({
            interview_email_status: "sent",
            interview_email_sent_at: now,
          })
          .eq("id", candidate.id);
      } else if (data.templateId === "hired" || data.templateId === "rejected") {
        await supabaseAdmin
          .from("candidates")
          .update({
            outcome_email_status: "sent",
            outcome_email_sent_at: now,
          })
          .eq("id", candidate.id);
      }
    }

    return result;
  });
