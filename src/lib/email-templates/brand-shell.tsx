import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const BRAND = "#16a34a";
const INK = "#101412";

export interface BrandShellProps {
  preview: string;
  heading: string;
  greeting?: string;
  /** Plain-text message body; rendered as paragraphs. */
  message: string;
  children?: React.ReactNode;
}

/**
 * Shared branded shell for Seceon candidate emails. The `message` prop is
 * plain text (possibly edited by HR) and is rendered as escaped paragraphs —
 * never as raw HTML.
 */
export function BrandShell({ preview, heading, greeting, message, children }: BrandShellProps) {
  const paragraphs = (message || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandBar}>
            <Text style={brandText}>aiHIVE</Text>
          </Section>
          <Heading style={h1}>{heading}</Heading>
          {greeting ? <Text style={text}>{greeting}</Text> : null}
          {paragraphs.map((p, i) => (
            <Text key={i} style={text}>
              {p}
            </Text>
          ))}
          {children}
          <Hr style={hr} />
          <Text style={footer}>
            Warm regards,
            <br />
            Talent Acquisition Team
            <br />
            Seceon
          </Text>
          <Text style={fine}>This message was sent regarding your application with Seceon.</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "Arial, Helvetica, sans-serif",
};
const container = {
  margin: "0 auto",
  maxWidth: "560px",
  padding: "24px 24px 32px",
};
const brandBar = {
  borderBottom: `3px solid ${BRAND}`,
  paddingBottom: "12px",
  marginBottom: "20px",
};
const brandText = {
  color: BRAND,
  fontSize: "14px",
  fontWeight: "700" as const,
  letterSpacing: "0.06em",
  margin: "0",
  textTransform: "uppercase" as const,
};
const h1 = {
  color: INK,
  fontSize: "22px",
  fontWeight: "700" as const,
  lineHeight: "28px",
  margin: "0 0 16px",
};
const text = {
  color: "#33403a",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 14px",
  whiteSpace: "pre-wrap" as const,
};
const hr = {
  borderColor: "#e2e8f0",
  margin: "24px 0 16px",
};
const footer = {
  color: INK,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 8px",
};
const fine = {
  color: "#94a3b8",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "16px 0 0",
};
