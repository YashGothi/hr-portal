import React from "react";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

interface Props {
  candidateName?: string;
  role?: string;
  subject?: string;
  message?: string;
}

const DEFAULT_MESSAGE = (name: string, role: string) =>
  `Thank you for your interest in the ${role} position at Seceon and for the time and effort you invested in speaking with our team.\n\nAfter careful consideration, we have decided not to move forward with your application for this role. This decision was not an easy one, and it reflects the high volume of strong applications we received rather than any shortcoming on your part.\n\nWe will keep your details on file and would be glad to reach out should a suitable opportunity open in the future. We wish you every success in your career ahead, ${name}.`;

const Email = ({ candidateName, role, message }: Props) => {
  const name = candidateName || "Candidate";
  const roleLabel = role || "the position";
  return (
    <BrandShell
      preview={`An update on your application for ${roleLabel} at Seceon`}
      heading="Update on your application"
      greeting={`Dear ${name},`}
      message={message?.trim() || DEFAULT_MESSAGE(name, roleLabel)}
    />
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["subject"]?.trim() ||
    `An update on your application for ${d["role"] || "your role"} at Seceon`,
  displayName: "Status update — not selected",
  previewData: { candidateName: "Priya Sharma", role: "Software Engineer" },
} satisfies TemplateEntry;
