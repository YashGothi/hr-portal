import React from "react";
import { Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { BrandShell } from "./brand-shell";

interface Props {
  candidateName?: string;
  role?: string;
  subject?: string;
  message?: string;
}

const DEFAULT_MESSAGE = (name: string, role: string) =>
  `It gives us great pleasure to inform you that you have been selected for the ${role} position at Seceon.\n\nYour skills, experience and thoughtful approach throughout the process impressed everyone on the panel. Our team will reach out shortly with the formal offer details and next steps.\n\nCongratulations once again, ${name} — we are excited to welcome you aboard.`;

const Email = ({ candidateName, role, message }: Props) => {
  const name = candidateName || "Candidate";
  const roleLabel = role || "the position";
  return (
    <BrandShell
      preview={`Congratulations — you're selected for ${roleLabel} at Seceon`}
      heading="Congratulations — you're selected!"
      greeting={`Dear ${name},`}
      message={message?.trim() || DEFAULT_MESSAGE(name, roleLabel)}
    >
      <Text style={text}>Welcome to the team.</Text>
    </BrandShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d["subject"]?.trim() || `Congratulations — offer for ${d["role"] || "your role"} at Seceon`,
  displayName: "Status update — accepted",
  previewData: { candidateName: "Priya Sharma", role: "Software Engineer" },
} satisfies TemplateEntry;

const text = { color: "#33403a", fontSize: "15px", lineHeight: "24px", margin: "0 0 14px" };
