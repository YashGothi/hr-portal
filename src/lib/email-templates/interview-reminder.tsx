import React from "react";
import { Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

interface Props {
  candidateName?: string;
  role?: string;
  dateLabel?: string;
  timeLabel?: string;
  timezoneLabel?: string;
  durationMinutes?: number;
  meetingUrl?: string;
  interviewer?: string;
}

const Email = ({
  candidateName,
  role,
  dateLabel,
  timeLabel,
  timezoneLabel,
  durationMinutes,
  meetingUrl,
  interviewer,
}: Props) => {
  const name = candidateName || "Candidate";
  const roleLabel = role || "the position";

  const message = `This is a friendly reminder that your interview for the ${roleLabel} position at Seceon is scheduled for tomorrow.\n\nPlease review your interview details below and join a couple of minutes before the scheduled time.`;

  return (
    <BrandShell
      preview={`Interview reminder for ${roleLabel} — ${dateLabel || "tomorrow"}`}
      heading="Interview reminder"
      greeting={`Dear ${name},`}
      message={message}
    >
      <Section style={details}>
        <Text style={detailLine}>
          <strong>Appointment:</strong> Interview Call
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
      <Text style={text}>
        If you have any questions or need to reschedule prior to your call, please reply directly to
        this email and our team will assist you.
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
    return `Interview Reminder — ${role}`;
  },
  displayName: "Interview reminder (24h prior)",
  previewData: {
    candidateName: "Priya Sharma",
    role: "Software Engineer",
    dateLabel: "September 18, 2026",
    timeLabel: "3:00 PM – 3:30 PM",
    timezoneLabel: "IST",
    durationMinutes: 30,
    interviewer: "Talent Acquisition Team",
    meetingUrl: "https://meet.google.com/sample-room",
  },
} satisfies TemplateEntry;

const text = { color: "#33403a", fontSize: "15px", lineHeight: "24px", margin: "0 0 14px" };
const details = {
  backgroundColor: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "18px 0",
};
const detailLine = {
  color: "#1e3a2f",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "4px 0",
};
