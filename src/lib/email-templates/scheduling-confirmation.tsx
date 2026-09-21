import React from "react";
import { Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

interface Props {
  candidateName?: string;
  appointmentTitle?: string;
  role?: string;
  dateLabel?: string;
  timeLabel?: string;
  timezoneLabel?: string;
  meetingUrl?: string;
  interviewer?: string;
  durationMinutes?: number;
  cancelled?: boolean;
}

const Email = ({
  candidateName,
  appointmentTitle,
  role,
  dateLabel,
  timeLabel,
  timezoneLabel,
  meetingUrl,
  interviewer,
  durationMinutes,
  cancelled,
}: Props) => {
  const name = candidateName || "Candidate";
  const title = appointmentTitle || "Interview";
  const roleLabel = role || "the position";

  const message = cancelled
    ? `Your ${title.toLowerCase()} for the ${roleLabel} position at Seceon has been cancelled.\n\nIf you would still like to speak with us, please reply to this email and our team will share a new booking link.`
    : `Thank you for booking your ${title.toLowerCase()} for the ${roleLabel} position at Seceon.\n\nYour appointment is confirmed and the details are below. Please join a couple of minutes early.`;

  return (
    <BrandShell
      preview={cancelled ? `${title} cancelled` : `${title} confirmed — ${dateLabel || ""}`}
      heading={cancelled ? `${title} cancelled` : `${title} confirmed`}
      greeting={`Dear ${name},`}
      message={message}
    >
      {cancelled ? (
        <Section style={details}>
          <Text style={detailLine}>
            <strong>Position:</strong> {roleLabel}
          </Text>
          {dateLabel ? (
            <Text style={detailLine}>
              <strong>Previous Date:</strong> {dateLabel}
            </Text>
          ) : null}
          {timeLabel ? (
            <Text style={detailLine}>
              <strong>Previous Time:</strong> {timeLabel}
              {timezoneLabel ? ` (${timezoneLabel})` : ""}
            </Text>
          ) : null}
        </Section>
      ) : (
        <Section style={details}>
          <Text style={detailLine}>
            <strong>Appointment:</strong> {title}
          </Text>
          {role ? (
            <Text style={detailLine}>
              <strong>Position:</strong> {role}
            </Text>
          ) : null}
          {dateLabel ? (
            <Text style={detailLine}>
              <strong>Date:</strong> {dateLabel}
            </Text>
          ) : null}
          {timeLabel ? (
            <Text style={detailLine}>
              <strong>Time:</strong> {timeLabel}
              {timezoneLabel ? ` (${timezoneLabel})` : ""}
            </Text>
          ) : null}
          <Text style={detailLine}>
            <strong>Duration:</strong> {durationMinutes ?? 30} minutes
          </Text>
          {interviewer ? (
            <Text style={detailLine}>
              <strong>You will meet:</strong> {interviewer}
            </Text>
          ) : null}
          {meetingUrl ? (
            <Text style={detailLine}>
              <strong>Meeting link:</strong> {meetingUrl}
            </Text>
          ) : null}
        </Section>
      )}
      <Text style={text}>
        {cancelled
          ? "If you have questions or need to reschedule, please reply to this email and our team will assist you."
          : "If you need to reschedule or cancel your interview, please use your booking link or reply to this email and our team will assist you."}
      </Text>
    </BrandShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, unknown>) => {
    const role =
      (typeof d["role"] === "string" && d["role"]) ||
      (typeof d["appointmentTitle"] === "string" && d["appointmentTitle"]) ||
      "Open Position";
    if (d["cancelled"]) {
      return `Interview Cancelled — ${role}`;
    }
    return `Interview Confirmed — ${role}`;
  },
  displayName: "Scheduling confirmation (candidate)",
  previewData: {
    candidateName: "Priya Sharma",
    appointmentTitle: "Screening Call",
    role: "Software Engineer",
    dateLabel: "September 18, 2026",
    timeLabel: "3:20 PM – 3:40 PM",
    timezoneLabel: "IST",
    interviewer: "Talent Acquisition Team",
  },
} satisfies TemplateEntry;

const text = { color: "#33403a", fontSize: "15px", lineHeight: "24px", margin: "0 0 14px" };
const details = {
  backgroundColor: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "8px",
  margin: "0 0 16px",
  padding: "12px 16px",
};
const detailLine = { color: "#101412", fontSize: "14px", lineHeight: "22px", margin: "0 0 6px" };
