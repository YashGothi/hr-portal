import React from "react";
import { Button, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

export interface OfferLetterProps {
  candidateName?: string;
  jobTitle?: string;
  compensation?: number | string;
  currency?: string;
  startDate?: string;
  expiresAt?: string;
  offerUrl?: string;
  notes?: string;
  companyName?: string;
}

const Email = ({
  candidateName,
  jobTitle,
  compensation,
  currency = "INR",
  startDate,
  expiresAt,
  offerUrl,
  notes,
  companyName = "Seceon",
}: OfferLetterProps) => {
  const name = candidateName || "Candidate";
  const role = jobTitle || "the position";
  const comp = compensation
    ? `${currency} ${Number(compensation).toLocaleString()}`
    : "As discussed";

  const message = `We are delighted to extend an offer for the position of ${role} at ${companyName}.\n\nPlease review the offer details and terms below. You can accept or decline this offer directly using the secure link provided.`;

  return (
    <BrandShell
      preview={`Offer Letter — ${role}`}
      heading="Job Offer"
      greeting={`Dear ${name},`}
      message={message}
    >
      <Section style={detailsBox}>
        <Text style={detailItem}>
          <strong>Position:</strong> {role}
        </Text>
        <Text style={detailItem}>
          <strong>Compensation:</strong> {comp}
        </Text>
        {startDate ? (
          <Text style={detailItem}>
            <strong>Start Date:</strong> {new Date(startDate).toLocaleDateString()}
          </Text>
        ) : null}
        {expiresAt ? (
          <Text style={detailItem}>
            <strong>Offer Expiration:</strong> {new Date(expiresAt).toLocaleDateString()}
          </Text>
        ) : null}
        {notes ? (
          <Text style={detailItem}>
            <strong>Notes / Terms:</strong> {notes}
          </Text>
        ) : null}
      </Section>

      {offerUrl ? (
        <Section style={{ textAlign: "center", margin: "24px 0" }}>
          <Button href={offerUrl} style={button}>
            View & Respond to Offer
          </Button>
          {expiresAt ? (
            <Text style={hint}>
              Please respond on or before {new Date(expiresAt).toLocaleDateString()}.
            </Text>
          ) : null}
        </Section>
      ) : null}
    </BrandShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, unknown>) =>
    `Offer Letter — ${(d["jobTitle"] as string) || "Your Position"}`,
  displayName: "Offer Letter",
  previewData: {
    candidateName: "Priya Sharma",
    jobTitle: "Senior Full Stack Engineer",
    compensation: "1800000",
    currency: "INR",
    startDate: "2026-11-01",
    expiresAt: "2026-10-15",
    offerUrl: "https://example.com/offer/sample-token",
  },
} satisfies TemplateEntry;

const detailsBox = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  padding: "16px 20px",
  margin: "16px 0",
};
const detailItem = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "6px 0",
};
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
