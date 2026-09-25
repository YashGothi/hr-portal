import React from "react";
import { Button, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

export interface OnboardingInvitationProps {
  candidateName?: string;
  jobTitle?: string;
  startDate?: string | null;
  onboardingUrl?: string;
  companyName?: string;
}

const Email = ({
  candidateName,
  jobTitle,
  startDate,
  onboardingUrl,
  companyName = "aiHIVE",
}: OnboardingInvitationProps) => {
  const name = candidateName || "Candidate";
  const role = jobTitle || "your new role";

  const message = `Welcome to ${companyName}! We are thrilled to have you join our team as ${role}.\n\nTo ensure a smooth transition, please visit your personalized Onboarding Portal to review your onboarding requirements and upload your required compliance documents.`;

  return (
    <BrandShell
      preview={`Welcome to ${companyName} — Complete Your Onboarding`}
      heading="Welcome to the Team"
      greeting={`Dear ${name},`}
      message={message}
    >
      <Section style={detailsBox}>
        <Text style={detailItem}>
          <strong>Position:</strong> {role}
        </Text>
        {startDate ? (
          <Text style={detailItem}>
            <strong>Expected Start Date:</strong>{" "}
            {new Date(startDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        ) : null}
      </Section>

      {onboardingUrl ? (
        <Section style={ctaSection}>
          <Button style={ctaButton} href={onboardingUrl}>
            Access Your Onboarding Portal
          </Button>
          <Text style={subText}>
            This secure link is valid for 14 days. Please complete your document submissions at your
            earliest convenience.
          </Text>
        </Section>
      ) : null}
    </BrandShell>
  );
};

export const template: TemplateEntry = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Welcome to ${data["companyName"] || "aiHIVE"} — Onboarding & Document Verification`,
  displayName: "Onboarding Invitation",
  previewData: {
    candidateName: "Jane Doe",
    jobTitle: "Senior Software Engineer",
    startDate: "2026-10-01",
    onboardingUrl: "https://portal.aihvp.com/onboarding/sample-token",
    companyName: "aiHIVE",
  },
};

export default Email;

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "24px 0",
};

const detailItem: React.CSSProperties = {
  fontSize: "14px",
  color: "#334155",
  margin: "6px 0",
  lineHeight: "1.5",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "32px 0 16px 0",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 28px",
};

const subText: React.CSSProperties = {
  fontSize: "12px",
  color: "#64748b",
  marginTop: "12px",
  lineHeight: "1.4",
};
