/** Timezone-aware ICS invite for a confirmed appointment. */

export type IcsInput = {
  uid: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  description?: string | null;
  location?: string | null;
  organizer?: string | null;
};

function stamp(value: string | Date): string {
  const date = new Date(value);
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function buildIcs(input: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//aiHIVE//Scheduling//EN",
    "BEGIN:VEVENT",
    `UID:${input.uid}@aihive`,
    `DTSTAMP:${stamp(new Date())}`,
    // UTC instants keep the event correct in every calendar app; the
    // originating timezone is recorded for reference.
    `DTSTART:${stamp(input.startAt)}`,
    `DTEND:${stamp(input.endAt)}`,
    `SUMMARY:${escapeText(input.title)}`,
    `X-WR-TIMEZONE:${input.timezone}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
  if (input.organizer)
    lines.push(`ORGANIZER;CN=${escapeText(input.organizer)}:MAILTO:hr.apac@seceon.com`);
  lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function icsDataHref(input: IcsInput): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(input))}`;
}
