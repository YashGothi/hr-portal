import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const TokenSchema = z.string().uuid();

/**
 * Public interview-attendance confirmation, gated by the candidate's secret
 * confirm token. Uses the privileged client only after the token matches a
 * candidate row; returns nothing beyond the interview slot details.
 */
export const Route = createFileRoute("/api/public/confirm-interview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parsed = TokenSchema.safeParse(new URL(request.url).searchParams.get("token"));
        if (!parsed.success) {
          return Response.json({ error: "Invalid confirmation link." }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: candidate, error } = await supabaseAdmin
          .from("candidates")
          .select(
            "id, full_name, interview_at, interviewer, interview_location, interview_confirmed_at",
          )
          .eq("interview_confirm_token", parsed.data)
          .maybeSingle();

        if (error || !candidate) {
          return Response.json({ error: "Confirmation link not found." }, { status: 404 });
        }

        let confirmedAt = candidate.interview_confirmed_at as string | null;
        if (!confirmedAt) {
          confirmedAt = new Date().toISOString();
          const { error: updateError } = await supabaseAdmin
            .from("candidates")
            .update({ interview_confirmed_at: confirmedAt })
            .eq("id", candidate.id);
          if (updateError) {
            return Response.json({ error: "Could not record the confirmation." }, { status: 500 });
          }
        }

        return Response.json({
          full_name: candidate.full_name,
          interview_at: candidate.interview_at,
          interviewer: candidate.interviewer,
          interview_location: candidate.interview_location,
          confirmed_at: confirmedAt,
        });
      },
    },
  },
});
