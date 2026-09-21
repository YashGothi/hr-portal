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
  type: "NS" | "TXT";
  ok: boolean;
  /** Values seen in public DNS (empty when nothing is published yet). */
  found: string[];
  expected: string[];
};

export type SenderDnsStatus = {
  /** True only when every required record is publicly live on every resolver. */
  live: boolean;
  checkedAt: string;
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

/**
 * Confirms the sender-domain NS and TXT records are published in public DNS.
 * Two independent resolvers must agree before the records count as live, so a
 * partially propagated zone is not reported as verified.
 */
export const checkSenderDns = createServerFn({ method: "GET" }).handler(
  async (): Promise<SenderDnsStatus> => {
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

    return {
      live: nsOk && txtOk,
      checkedAt: new Date().toISOString(),
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
  },
);
