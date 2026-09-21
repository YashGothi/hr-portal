import React from "react";
import { Button, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

interface Props {
  candidateName?: string;
  role?: string;
  subject?: string;
  message?: string;
  schedule?: string;
  meetingDetails?: string;
  /** Live confirm-attendance link. */
  confirmLink?: string;
}

const DEFAULT_MESSAGE = (role: string) =>
  `Thank you for progressing through our selection process for the ${role} position at Seceon.\n\nWe are delighted to confirm your interview with our panel. Please find the schedule and meeting details below.`;

const Email = ({ candidateName, role, message, schedule, meetingDetails, confirmLink }: Props) => {
  const name = candidateName || "Candidate";
  const roleLabel = role || "the position";
  return (
    <BrandShell
      preview={`Your Seceon interview for ${roleLabel} is scheduled`}
      heading="Interview confirmation"
      greeting={`Dear ${name},`}
      message={message?.trim() || DEFAULT_MESSAGE(roleLabel)}
    >
      {schedule ? (
        <Section style={details}>
          <Text style={detailLine}>
            <strong>Interview:</strong> {schedule}
          </Text>
          {meetingDetails ? (
            <Text style={detailLine}>
              <strong>Meeting details:</strong> {meetingDetails}
            </Text>
          ) : null}
        </Section>
      ) : null}
      {confirmLink ? (
        <Section style={{ textAlign: "center", margin: "20px 0" }}>
          <Button href={confirmLink} style={button}>
            Confirm my attendance
          </Button>
          <Text style={hint}>Confirming takes one click and lets our team know to expect you.</Text>
        </Section>
      ) : null}
      <Text style={text}>
        If you need to reschedule, please reply to this email and we will find a time that works for
        you.
      </Text>
    </BrandShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["subject"]?.trim() || `Interview invite — ${d["role"] || "your role"} at Seceon`,
  displayName: "Interview invite",
  previewData: {
    candidateName: "Priya Sharma",
    role: "Software Engineer",
    schedule: "Tuesday, 22 September 2026 at 14:30",
    meetingDetails: "https://meet.example.com/interview",
    confirmLink: "https://example.com/confirm/sample-token",
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
const button = {
  backgroundColor: "#16a34a",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600" as const,
  padding: "12px 28px",
  textDecoration: "none",
};
const hint = { color: "#64748b", fontSize: "12px", lineHeight: "18px", margin: "10px 0 0" };
