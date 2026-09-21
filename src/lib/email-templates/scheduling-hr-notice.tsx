import React from "react";
import { Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

interface Props {
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  appointmentTitle?: string;
  role?: string;
  dateLabel?: string;
  timeLabel?: string;
  timezoneLabel?: string;
  meetingUrl?: string;
  cancelled?: boolean;
}

const Email = ({
  candidateName,
  candidateEmail,
  candidatePhone,
  appointmentTitle,
  role,
  dateLabel,
  timeLabel,
  timezoneLabel,
  meetingUrl,
  cancelled,
}: Props) => {
  const title = appointmentTitle || "Appointment";
  return (
    <BrandShell
      preview={cancelled ? `${title} cancelled` : `New ${title.toLowerCase()} scheduled`}
      heading={cancelled ? `${title} cancelled` : `New ${title.toLowerCase()} scheduled`}
      message={
        cancelled
          ? `An appointment was cancelled and the time slot is available again.`
          : `A candidate has booked a slot from their scheduling link. The details are below.`
      }
    >
      <Section style={details}>
        <Text style={detailLine}>
          <strong>Candidate:</strong> {candidateName || "—"}
        </Text>
        <Text style={detailLine}>
          <strong>Role:</strong> {role || "—"}
        </Text>
        <Text style={detailLine}>
          <strong>Date:</strong> {dateLabel || "—"}
        </Text>
        <Text style={detailLine}>
          <strong>Time:</strong> {timeLabel || "—"}
          {timezoneLabel ? ` (${timezoneLabel})` : ""}
        </Text>
        <Text style={detailLine}>
          <strong>Email:</strong> {candidateEmail || "—"}
        </Text>
        {candidatePhone ? (
          <Text style={detailLine}>
            <strong>Phone:</strong> {candidatePhone}
          </Text>
        ) : null}
        {meetingUrl ? (
          <Text style={detailLine}>
            <strong>Meeting link:</strong> {meetingUrl}
          </Text>
        ) : null}
      </Section>
    </BrandShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["cancelled"]
      ? `Cancelled: ${d["appointmentTitle"] || "appointment"} — ${d["candidateName"] || "candidate"}`
      : `New ${d["appointmentTitle"] || "appointment"} — ${d["candidateName"] || "candidate"}`,
  displayName: "Scheduling notification (HR)",
  to: "hr.apac@seceon.com",
  previewData: {
    candidateName: "Priya Sharma",
    candidateEmail: "priya@example.com",
    appointmentTitle: "Screening Call",
    role: "Software Engineer",
    dateLabel: "September 18, 2026",
    timeLabel: "3:20 PM – 3:40 PM",
    timezoneLabel: "IST",
  },
} satisfies TemplateEntry;

const details = {
  backgroundColor: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "8px",
  margin: "0 0 16px",
  padding: "12px 16px",
};
const detailLine = { color: "#101412", fontSize: "14px", lineHeight: "22px", margin: "0 0 6px" };
