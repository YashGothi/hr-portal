/**
 * Calendar Integration Module.
 * Generates universal 1-click calendar links for Google Calendar, Office 365,
 * Outlook Live, and Apple/Standard iCal (.ics), with zero third-party OAuth friction.
 */
import { buildIcs, icsDataHref, type IcsInput } from "./ics";

export interface CalendarEventDetails {
  uid: string;
  title: string;
  description?: string | null | undefined;
  location?: string | null | undefined;
  startAt: string;
  endAt: string;
  timezone: string;
  organizer?: string | null | undefined;
}

export interface UniversalCalendarLinks {
  google: string;
  outlook365: string;
  outlookLive: string;
  icsDownloadUrl: string;
}

function formatUtcForCalendar(isoDateString: string): string {
  const date = new Date(isoDateString);
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Builds universal 1-click calendar synchronization links for a given appointment.
 */
export function getUniversalCalendarLinks(event: CalendarEventDetails): UniversalCalendarLinks {
  const startUtc = formatUtcForCalendar(event.startAt);
  const endUtc = formatUtcForCalendar(event.endAt);
  const titleEnc = encodeURIComponent(event.title);
  const descEnc = encodeURIComponent(event.description ?? "");
  const locEnc = encodeURIComponent(event.location ?? "");

  // 1. Google Calendar Web Link
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titleEnc}&dates=${startUtc}/${endUtc}&details=${descEnc}&location=${locEnc}`;

  // 2. Microsoft Office 365 Outlook Web Link
  const outlook365 = `https://outlook.office.com/calendar/0/deeplink/compose?subject=${titleEnc}&body=${descEnc}&startdt=${encodeURIComponent(event.startAt)}&enddt=${encodeURIComponent(event.endAt)}&location=${locEnc}`;

  // 3. Microsoft Outlook Live (Personal / Hotmail) Link
  const outlookLive = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${titleEnc}&body=${descEnc}&startdt=${encodeURIComponent(event.startAt)}&enddt=${encodeURIComponent(event.endAt)}&location=${locEnc}`;

  // 4. Standard RFC 5545 iCalendar Data URI
  const icsInput: IcsInput = {
    uid: event.uid,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    timezone: event.timezone,
    description: event.description ?? null,
    location: event.location ?? null,
    organizer: event.organizer ?? null,
  };
  const icsDownloadUrl = icsDataHref(icsInput);

  return {
    google,
    outlook365,
    outlookLive,
    icsDownloadUrl,
  };
}

export { buildIcs, icsDataHref };
