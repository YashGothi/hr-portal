import { createFileRoute } from "@tanstack/react-router";
import { processEmailWebhook } from "@/lib/integrations/email-provider";

/**
 * Inbound Email Provider Webhook Endpoint:
 * POST /api/webhooks/email
 *
 * Cryptographically verified via @lovable.dev/webhooks-js using
 * LOVABLE_WEBHOOK_SECRET or LOVABLE_API_KEY.
 * Handles delivery confirmations, bounces, and suppression events idempotently.
 */
export const Route = createFileRoute("/api/webhooks/email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const result = await processEmailWebhook(request);
          return Response.json(
            {
              received: true,
              eventType: result.eventType,
              recipient: result.recipientEmail,
              timestamp: result.timestamp,
            },
            {
              status: 200,
              headers: { "Cache-Control": "no-store" },
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid webhook request";
          const isUnauthorized =
            message.includes("signature") ||
            message.includes("timestamp") ||
            message.includes("secret");

          const status = isUnauthorized ? 401 : 400;
          return Response.json(
            { error: "Webhook verification failed." },
            {
              status,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }
      },
      GET: async () => {
        return Response.json(
          { error: "Method not allowed. Use POST with signed webhook headers." },
          {
            status: 405,
            headers: { Allow: "POST", "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});
