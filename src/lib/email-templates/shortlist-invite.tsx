import React from "react";
import { Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

interface Props {
  candidateName?: string;
  role?: string;
  subject?: string;
  /** Plain-text body edited in Email Dispatch. */
  message?: string;
  schedule?: string;
  meetingDetails?: string;
}

const DEFAULT_MESSAGE = (name: string, role: string) =>
  `Thank you for your interest in the ${role} position at Seceon and for the time you invested in the process.\n\nWe are pleased to share that your profile has been shortlisted for the next stage. We would like to invite you to an initial screening call with our talent acquisition team.`;

const Email = ({ candidateName, role, message, schedule, meetingDetails }: Props) => {
  const name = candidateName || "Candidate";
  const roleLabel = role || "the position";
  return (
    <BrandShell
      preview={`You're shortlisted for ${roleLabel} — screening invite inside`}
      heading="You've been shortlisted"
      greeting={`Dear ${name},`}
      message={message?.trim() || DEFAULT_MESSAGE(name, roleLabel)}
    >
      {schedule ? (
        <Section style={details}>
          <Text style={detailLine}>
            <strong>Screening call:</strong> {schedule}
          </Text>
          {meetingDetails ? (
            <Text style={detailLine}>
              <strong>Meeting details:</strong> {meetingDetails}
            </Text>
          ) : null}
        </Section>
      ) : null}
      <Text style={text}>
        If the proposed time does not suit you, simply reply to this email and we will gladly
        arrange an alternative.
      </Text>
    </BrandShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["subject"]?.trim() ||
    `You're shortlisted — screening invite for ${d["role"] || "your role"} at Seceon`,
  displayName: "Shortlist & screening invite",
  previewData: {
    candidateName: "Priya Sharma",
    role: "Software Engineer",
    schedule: "Tuesday, 22 September 2026 at 14:30",
    meetingDetails: "https://meet.example.com/screening",
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
