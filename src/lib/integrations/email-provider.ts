/**
 * Email Provider Integration & Webhook Handling.
 * Integrates with @lovable.dev/webhooks-js and @lovable.dev/email-js.
 */
import { verifyWebhookRequest, type EmailWebhookPayload } from "@lovable.dev/webhooks-js";

export type EmailDeliveryEventType =
  "delivered" | "bounced" | "suppressed" | "complaint" | "failed" | "unknown";

export interface EmailWebhookResult {
  handled: boolean;
  eventType: EmailDeliveryEventType;
  recipientEmail?: string | undefined;
  runId?: string | undefined;
  timestamp: string;
}

/**
 * Normalizes incoming email webhook event types into standard delivery states.
 */
export function normalizeEmailEventType(rawType: string): EmailDeliveryEventType {
  const normalized = rawType.toLowerCase().trim();
  if (normalized.includes("deliver")) return "delivered";
  if (normalized.includes("bounce")) return "bounced";
  if (normalized.includes("suppress")) return "suppressed";
  if (normalized.includes("complain")) return "complaint";
  if (normalized.includes("fail") || normalized.includes("error")) return "failed";
  return "unknown";
}

/**
 * Validates and processes an inbound email provider webhook request.
 * Server-only: verifies cryptographic signature with LOVABLE_WEBHOOK_SECRET or LOVABLE_API_KEY.
 */
export async function processEmailWebhook(request: Request): Promise<EmailWebhookResult> {
  const secret = process.env["LOVABLE_WEBHOOK_SECRET"] || process.env["LOVABLE_API_KEY"];
  if (!secret) {
    throw new Error(
      "Server configuration missing: LOVABLE_WEBHOOK_SECRET or LOVABLE_API_KEY is not set.",
    );
  }

  // Cryptographically verify signature and parse payload
  const verified = await verifyWebhookRequest<EmailWebhookPayload>({
    req: request,
    secret,
  });

  const payload = verified.payload;
  const eventType = normalizeEmailEventType(payload.type || "unknown");
  const recipientEmail = payload.data?.email;
  const runId = payload.run_id;

  return {
    handled: true,
    eventType,
    recipientEmail,
    runId,
    timestamp: verified.timestamp,
  };
}
