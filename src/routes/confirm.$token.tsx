import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CircleAlert, Loader2 } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/confirm/$token")({
  head: () => ({
    meta: [
      { title: "Confirm your interview attendance | aiHIVE" },
      {
        name: "description",
        content:
          "Confirm your attendance for the interview scheduled by the aiHIVE talent acquisition team.",
      },
      { property: "og:title", content: "Confirm your interview attendance | aiHIVE" },
      {
        property: "og:description",
        content: "Confirm the interview slot shared by the talent acquisition team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfirmInterviewPage,
});

type ConfirmRow = {
  full_name: string;
  interview_at: string | null;
  interviewer: string | null;
  interview_location: string | null;
  confirmed_at: string | null;
};

function formatSlot(value: string | null) {
  if (!value) return "To be confirmed";
  return new Date(value).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Builds a downloadable calendar invite for the confirmed slot. */
function icsHref(row: ConfirmRow) {
  if (!row.interview_at) return null;
  const start = new Date(row.interview_at);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const stamp = (date: Date) => `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//aiHIVE//Interview//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(start)}-aihive`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    "SUMMARY:Interview with aiHIVE",
    `DESCRIPTION:Interview for ${row.full_name}${row.interviewer ? ` with ${row.interviewer}` : ""}`,
    `LOCATION:${row.interview_location ?? "To be shared"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines)}`;
}

function ConfirmInterviewPage() {
  const { token } = Route.useParams();

  const confirmation = useQuery({
    queryKey: ["interview-confirmation", token],
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/public/confirm-interview?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error("Invalid confirmation link");
      return (await res.json()) as ConfirmRow;
    },
  });

  const row = confirmation.data ?? null;
  const calendarLink = row ? icsHref(row) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="panel w-full max-w-lg p-6 sm:p-8">
        <Brand />

        {confirmation.isLoading ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Confirming your attendance…
          </div>
        ) : confirmation.isError || !row ? (
          <div className="mt-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <CircleAlert className="size-5" />
            </span>
            <h1 className="mt-4 text-xl font-semibold">This confirmation link is not valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The link may have expired or been copied incompletely. Please reply to the interview
              email and the talent acquisition team will help you confirm.
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CalendarCheck className="size-5" />
            </span>
            <h1 className="mt-4 text-xl font-semibold">
              Thank you, {row.full_name.split(" ")[0]} — your attendance is confirmed
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We have let the talent acquisition team know that you will attend.
            </p>

            <dl className="mt-6 space-y-3 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">Date and time</dt>
                <dd className="font-medium">{formatSlot(row.interview_at)}</dd>
              </div>
              {row.interviewer ? (
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">Interviewer</dt>
                  <dd className="font-medium">{row.interviewer}</dd>
                </div>
              ) : null}
              {row.interview_location ? (
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">Where</dt>
                  <dd className="font-medium">{row.interview_location}</dd>
                </div>
              ) : null}
            </dl>

            {calendarLink ? (
              <Button asChild className="mt-6 w-full">
                <a href={calendarLink} download="hr-automate-interview.ics">
                  Add to my calendar
                </a>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
