import { createServerFn } from "@tanstack/react-start";

/** Delegated sender subdomain that must carry the Lovable nameservers. */
export const SENDER_SUBDOMAIN = "hr.seceon.com";
/** Ownership-verification record name. */
export const VERIFY_TXT_NAME = "_lovable-email.seceon.com";
/** Exact value the ownership TXT record must contain. */
export const VERIFY_TXT_VALUE =
  "lovable_email_verify=0943f68664ee2491e51e939fd6c4142e7dce720a37d86a8023fe21af8219c67d";
/** Nameservers the delegated subdomain must point at. */
export const EXPECTED_NAMESERVERS = ["ns3.lovable.cloud", "ns4.lovable.cloud"];

const RESOLVERS = [
  { label: "Cloudflare", url: "https://cloudflare-dns.com/dns-query" },
  { label: "Google", url: "https://dns.google/resolve" },
];

type DnsAnswer = { name: string; type: number; data: string };


export type DnsRecordCheck = {
  /** Human label for the record being checked. */
  label: string;
  name: string;
  type: "NS" | "TXT" | "API";
  ok: boolean;
  /** Values seen in public DNS (empty when nothing is published yet). */
  found: string[];
  expected: string[];
};

export type SenderDnsStatus = {
  /** True only when required records/credentials are live. */
  live: boolean;
  checkedAt: string;
  provider: "Resend (Cloudflare DNS)" | "Lovable Cloud" | "Not Configured";
  resolvers: string[];
  records: DnsRecordCheck[];
};

function clean(value: string) {
  return value.trim().replace(/^"|"$/g, "").replace(/\.$/, "").toLowerCase();
}

async function query(resolver: string, name: string, type: "NS" | "TXT"): Promise<string[]> {
  const response = await fetch(`${resolver}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!response.ok) throw new Error(`DNS lookup failed (${response.status})`);
  const payload = (await response.json()) as { Answer?: DnsAnswer[] };
  const wanted = type === "NS" ? 2 : 16;
  return (payload.Answer ?? [])
    .filter((answer) => answer.type === wanted)
    .map((answer) => clean(answer.data));
}

export async function evaluateSenderDns(): Promise<SenderDnsStatus> {
  const resendApiKey = process.env["RESEND_API_KEY"];
  const lovableApiKey = process.env["LOVABLE_API_KEY"];

  const resolverUrl = RESOLVERS[0]?.url ?? "https://cloudflare-dns.com/dns-query";
  const [resendDkimHr, resendDkimRoot, verifyTxt] = await Promise.all([
    query(resolverUrl, `resend._domainkey.${SENDER_SUBDOMAIN}`, "TXT").catch(() => []),
    query(resolverUrl, `resend._domainkey.seceon.com`, "TXT").catch(() => []),
    query(resolverUrl, VERIFY_TXT_NAME, "TXT").catch(() => []),
  ]);
  const foundDns = [...resendDkimHr, ...resendDkimRoot, ...verifyTxt];
  const hasResendDns = foundDns.length > 0;

  // 1. If Resend API key is configured OR Resend Cloudflare DNS records are published
  if (resendApiKey || hasResendDns) {
    const isApiKeyConfigured = Boolean(resendApiKey);

    return {
      live: isApiKeyConfigured,
      checkedAt: new Date().toISOString(),
      provider: "Resend (Cloudflare DNS)",
      resolvers: RESOLVERS.map((resolver) => resolver.label),
      records: [
        {
          label: "Cloudflare DKIM Record (resend._domainkey)",
          name: `resend._domainkey.${SENDER_SUBDOMAIN}`,
          type: "TXT",
          ok: hasResendDns,
          found: hasResendDns ? foundDns : ["No Resend DKIM record found"],
          expected: ["Published DKIM TXT Record"],
        },
        {
          label: "Resend API Key Environment Variable",
          name: "RESEND_API_KEY",
          type: "API",
          ok: isApiKeyConfigured,
          found: isApiKeyConfigured
            ? ["Active & Configured"]
            : ["Missing in Render Environment"],
          expected: ["Set RESEND_API_KEY in Render Dashboard → Environment"],
        },
      ],
    };
  }

  // 2. Standard Lovable Cloud DNS verification fallback
  const nsResults: string[][] = [];
  const txtResults: string[][] = [];

  for (const resolver of RESOLVERS) {
    const [ns, txt] = await Promise.all([
      query(resolver.url, SENDER_SUBDOMAIN, "NS").catch(() => [] as string[]),
      query(resolver.url, VERIFY_TXT_NAME, "TXT").catch(() => [] as string[]),
    ]);
    nsResults.push(ns);
    txtResults.push(txt);
  }

  const expectedNs = EXPECTED_NAMESERVERS.map(clean);
  const nsOk = nsResults.every(
    (found) => found.length > 0 && expectedNs.every((server) => found.includes(server)),
  );
  const txtOk = txtResults.every((found) => found.includes(clean(VERIFY_TXT_VALUE)));

  const uniq = (lists: string[][]) => Array.from(new Set(lists.flat()));
  const isLive = nsOk && txtOk;

  return {
    live: isLive,
    checkedAt: new Date().toISOString(),
    provider: lovableApiKey ? "Lovable Cloud" : "Not Configured",
    resolvers: RESOLVERS.map((resolver) => resolver.label),
    records: [
      {
        label: "Nameserver delegation",
        name: SENDER_SUBDOMAIN,
        type: "NS",
        ok: nsOk,
        found: uniq(nsResults),
        expected: EXPECTED_NAMESERVERS,
      },
      {
        label: "Ownership verification",
        name: VERIFY_TXT_NAME,
        type: "TXT",
        ok: txtOk,
        found: uniq(txtResults),
        expected: [VERIFY_TXT_VALUE],
      },
    ],
  };
}

/**
 * Confirms the sender-domain DNS and provider credentials.
 * Supports Resend (with Cloudflare DNS) and Lovable Cloud fallback.
 */
export const checkSenderDns = createServerFn({ method: "GET" }).handler(
  async (): Promise<SenderDnsStatus> => {
    return evaluateSenderDns();
  },
);
