import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { processUpcomingReminders } from "@/lib/scheduling/reminders.server";

/**
 * Authenticated scheduled cron endpoint:
 * POST /api/cron/reminders
 *
 * Dispatches 24-hour reminder notifications for upcoming booked interviews.
 * Authenticated strictly using LOVABLE_CRON_SECRET via authenticateCronRequest.
 */
export const Route = createFileRoute("/api/cron/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authError = await authenticateCronRequest(request);
        if (authError) return authError;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const result = await processUpcomingReminders(supabaseAdmin);

          return Response.json(
            {
              ok: true,
              processed: result.processed,
              sent: result.sent,
              failed: result.failed,
            },
            {
              status: 200,
              headers: { "Cache-Control": "no-store" },
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Internal error";
          console.error("Cron reminder execution failed:", message);
          return Response.json(
            { ok: false, error: "Reminder processing encountered an error" },
            { status: 500, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
      GET: async () => {
        return Response.json(
          { error: "Method not allowed. Use POST with Bearer authentication." },
          { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
