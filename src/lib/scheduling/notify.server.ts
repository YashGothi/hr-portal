/**
 * Booking notifications. Delivery is attempted through the project's existing
 * email setup; a failure is reported honestly and never claimed as sent.
 */
import { formatDateIn, formatTimeIn, timezoneAbbreviation } from "./core";

export type NotifyOutcome = { candidateNotified: boolean; hrNotified: boolean; reason?: string };

export type NotifyInput = {
  appointmentId: string;
  appointmentTitle: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  role: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  meetingUrl?: string | null;
  interviewer?: string | null;
  durationMinutes?: number;
  cancelled?: boolean;
  /** Makes a deliberate resend distinct so it is not de-duplicated. */
  keySuffix?: string;
};

export async function notifyBooking(input: NotifyInput): Promise<NotifyOutcome> {
  const dateLabel = formatDateIn(input.startAt, input.timezone);
  const timeLabel = `${formatTimeIn(input.startAt, input.timezone)} – ${formatTimeIn(input.endAt, input.timezone)}`;
  const timezoneLabel = timezoneAbbreviation(input.timezone, new Date(input.startAt));
  const suffix = input.cancelled ? "cancelled" : "booked";
  const idempotencySuffix = input.keySuffix ? `${suffix}-${input.keySuffix}` : suffix;

  const shared = {
    candidateName: input.candidateName,
    appointmentTitle: input.appointmentTitle,
    role: input.role ?? "the position",
    dateLabel,
    timeLabel,
    timezoneLabel,
    durationMinutes: input.durationMinutes ?? 30,
    meetingUrl: input.meetingUrl ?? undefined,
    cancelled: Boolean(input.cancelled),
  };

  let candidateNotified = false;
  let hrNotified = false;
  let reason: string | undefined;

  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

    try {
      const result = await sendTemplateEmail("scheduling-confirmation", input.candidateEmail, {
        templateData: { ...shared, interviewer: input.interviewer ?? undefined },
        idempotencyKey: `appt-${input.appointmentId}-candidate-${idempotencySuffix}`,
        replyTo: "hr.apac@seceon.com",
      });
      candidateNotified = result.sent;
      if (!result.sent) reason = result.reason;
    } catch (cause) {
      reason = cause instanceof Error ? cause.message : "Email delivery is not available yet.";
    }

    try {
      const result = await sendTemplateEmail("scheduling-hr-notice", "", {
        templateData: {
          ...shared,
          candidateEmail: input.candidateEmail,
          candidatePhone: input.candidatePhone ?? undefined,
        },
        idempotencyKey: `appt-${input.appointmentId}-hr-${idempotencySuffix}`,
      });
      hrNotified = result.sent;
    } catch (cause) {
      reason =
        reason ?? (cause instanceof Error ? cause.message : "Email delivery is not available yet.");
    }
  } catch (cause) {
    reason = cause instanceof Error ? cause.message : "Email delivery is not configured.";
  }

  if (reason) console.error("scheduling notification not delivered:", reason);
  return { candidateNotified, hrNotified, ...(reason ? { reason } : {}) };
}

export async function notifyInterviewReminder(
  input: NotifyInput,
): Promise<{ sent: boolean; reason?: string }> {
  const dateLabel = formatDateIn(input.startAt, input.timezone);
  const timeLabel = `${formatTimeIn(input.startAt, input.timezone)} – ${formatTimeIn(input.endAt, input.timezone)}`;
  const timezoneLabel = timezoneAbbreviation(input.timezone, new Date(input.startAt));

  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail("interview-reminder", input.candidateEmail, {
      templateData: {
        candidateName: input.candidateName,
        role: input.role ?? "the position",
        appointmentTitle: input.appointmentTitle,
        dateLabel,
        timeLabel,
        timezoneLabel,
        durationMinutes: input.durationMinutes ?? 30,
        meetingUrl: input.meetingUrl ?? undefined,
        interviewer: input.interviewer ?? undefined,
      },
      idempotencyKey: `appt-${input.appointmentId}-candidate-reminder-24h`,
      replyTo: "hr.apac@seceon.com",
    });
    return { sent: result.sent, ...(result.sent ? {} : { reason: result.reason }) };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "Email delivery is not available.";
    return { sent: false, reason };
  }
}
