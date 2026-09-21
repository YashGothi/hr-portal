import { createFileRoute } from "@tanstack/react-router";
import { resolvePublicOffer, respondToPublicOffer } from "@/lib/offers/offers.server";

/**
 * Public candidate-facing endpoint for offer viewing and response.
 * Completely anonymous-safe: strictly requires the secure unguessable token.
 * Exposes zero ATS data and zero recruiter-internal data.
 */
export const Route = createFileRoute("/api/public/offer/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const result = await resolvePublicOffer(supabaseAdmin, token);
        if (!result.ok) {
          return Response.json({ error: result.reason }, { status: result.status });
        }

        return Response.json(result.offer);
      },

      POST: async ({ params, request }) => {
        const token = params.token;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: { action?: unknown } = {};
        try {
          body = (await request.json()) as { action?: unknown };
        } catch {
          return Response.json({ error: "Invalid JSON body." }, { status: 400 });
        }

        const action = body?.action;
        if (action !== "ACCEPT" && action !== "DECLINE") {
          return Response.json(
            { error: "Invalid action. Must be 'ACCEPT' or 'DECLINE'." },
            { status: 400 },
          );
        }

        const result = await respondToPublicOffer(supabaseAdmin, token, action);
        if (!result.ok) {
          return Response.json({ error: result.reason }, { status: result.status });
        }

        return Response.json({
          success: true,
          status: result.status,
          timestamp: result.timestamp,
        });
      },
    },
  },
});
