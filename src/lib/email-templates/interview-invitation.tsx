import React from "react";
import { Button, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";
import {
  COMPANY_NAME,
  INTERVIEW_DURATION_MINUTES,
  interviewInvitationBody,
  interviewInvitationSubject,
} from "@/lib/interview-invitation";

interface Props {
  candidateName?: string;
  role?: string;
  companyName?: string;
  /** Secure candidate scheduling link. */
  schedulingUrl?: string;
  subject?: string;
}

const Email = ({ candidateName, role, companyName, schedulingUrl }: Props) => {
  const company = companyName || COMPANY_NAME;
  const name = candidateName || "Candidate";
  const roleLabel = role || "the position";
  const url = schedulingUrl || "";
  const body = interviewInvitationBody({
    candidateName: name,
    jobTitle: roleLabel,
    schedulingUrl: url,
    companyName: company,
  });
  // The link is rendered as a button below, so it is dropped from the text body.
  const message = body
    .replace(`Hi ${name},\n\n`, "")
    .replace(`\n\n${url}`, "")
    .replace(`\n\nBest regards,\nHR Team\n${company}`, "");

  return (
    <BrandShell
      preview={`Interview invitation for ${roleLabel} at ${company}`}
      heading="Interview invitation"
      greeting={`Hi ${name},`}
      message={message}
    >
      {url ? (
        <Section style={{ textAlign: "center", margin: "20px 0" }}>
          <Button href={url} style={button}>
            Select an interview time
          </Button>
          <Text style={hint}>
            The interview will be approximately {INTERVIEW_DURATION_MINUTES} minutes.
          </Text>
        </Section>
      ) : null}
    </BrandShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["subject"]?.trim() ||
    interviewInvitationSubject({
      candidateName: d["candidateName"] ?? "Candidate",
      jobTitle: d["role"] ?? null,
      schedulingUrl: "",
      companyName: d["companyName"],
    }),
  displayName: "Interview invitation (self-scheduling)",
  previewData: {
    candidateName: "Priya Sharma",
    role: "Software Engineer",
    companyName: COMPANY_NAME,
    schedulingUrl: "https://example.com/schedule/sample-token?type=interview",
  },
} satisfies TemplateEntry;

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
