import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Globe,
  Loader2,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TIMEZONE,
  browserTimezone,
  formatDateIn,
  formatTimeIn,
  timezoneAbbreviation,
  zonedDateKey,
} from "@/lib/scheduling/core";
import { icsDataHref } from "@/lib/scheduling/ics";

export const Route = createFileRoute("/schedule/$token")({
  head: () => ({
    meta: [
      { title: "Book your call | aiHIVE" },
      {
        name: "description",
        content:
          "Pick a date and time for your screening or interview call with the aiHIVE talent acquisition team.",
      },
      { property: "og:title", content: "Book your call | aiHIVE" },
      {
        property: "og:description",
        content: "Choose a slot that suits you for your call with the aiHIVE hiring team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SchedulePage,
});

type InviteResponse = {
  appointmentType: "SCREENING" | "INTERVIEW";
  title: string;
  description: string | null;
  durationMinutes: number;
  jobTitle: string | null;
  candidate: {
    fullName: string;
    email: string;
    phone: string | null;
    applicationCode: string | null;
  };
  scheduling: {
    timezone: string;
    workingDays: number[];
    allowReschedule: boolean;
    bookingHorizonDays: number;
    interviewerName: string | null;
  };
  appointment: {
    id: string;
    appointment_type: string;
    start_at: string;
    end_at: string;
    timezone: string;
    status: string;
    meeting_url: string | null;
    interviewer: string | null;
    duration_minutes: number;
  } | null;
};

type AvailabilityResponse = {
  date: string;
  timezone: string;
  durationMinutes: number;
  slots: { start: string; end: string }[];
  availableDates: string[];
  today: string;
  maxDate: string;
};

type BookingResponse = {
  appointmentId: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  meetingUrl: string | null;
  interviewer: string | null;
  jobTitle: string | null;
  candidateName: string;
  emailDelivered: boolean;
  stage?: string;
  applicationStatus?: string;
  statusLabel?: string;
};

const TIMEZONE_OPTIONS = [
  DEFAULT_TIMEZONE,
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

function monthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

function monthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1)),
  );
}

function shiftMonth(month: string, delta: number) {
  const [year, monthPart] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Monday-first grid of the month, padded with nulls. */
function monthGrid(month: string): (string | null)[] {
  const [year, monthPart] = month.split("-");
  const first = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(Number(year), Number(monthPart), 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function SchedulePage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();

  const [displayTimezone, setDisplayTimezone] = useState(DEFAULT_TIMEZONE);
  const [month, setMonth] = useState(() => zonedDateKey(new Date(), DEFAULT_TIMEZONE).slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invite = useQuery({
    queryKey: ["schedule-invite", token],
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/public/scheduling/invite?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error("This scheduling link is not valid.");
      return (await res.json()) as InviteResponse;
    },
  });

  const hrTimezone = invite.data?.scheduling.timezone ?? DEFAULT_TIMEZONE;

  useEffect(() => {
    if (!invite.data) return;
    setDisplayTimezone(browserTimezone());
    setForm({
      name: invite.data.candidate.fullName,
      email: invite.data.candidate.email,
      phone: invite.data.candidate.phone ?? "",
    });
    setMonth(zonedDateKey(new Date(), invite.data.scheduling.timezone).slice(0, 7));
  }, [invite.data]);

  const existing = invite.data?.appointment ?? null;
  const bookingMode = !existing || rescheduling;

  const availability = useQuery({
    enabled: Boolean(invite.data) && bookingMode,
    queryKey: ["schedule-availability", token, month, selectedDate, rescheduling],
    // Availability changes while the page is open, so it is refetched often
    // and always revalidated on the server before a booking is created.
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ token, month });
      if (selectedDate) params.set("date", selectedDate);
      if (rescheduling && existing) params.set("rescheduleId", existing.id);
      const res = await fetch(`/api/public/scheduling/availability?${params.toString()}`);
      if (!res.ok) throw new Error("Availability is not available right now.");
      return (await res.json()) as AvailabilityResponse;
    },
  });

  const availableDates = useMemo(
    () => new Set(availability.data?.availableDates ?? []),
    [availability.data?.availableDates],
  );

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) throw new Error("Please choose a time.");
      const res = await fetch("/api/public/scheduling/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          startTime: selectedSlot.start,
          timezone: displayTimezone,
          candidateName: form.name,
          candidateEmail: form.email,
          candidatePhone: form.phone || undefined,
          ...(rescheduling && existing ? { rescheduleAppointmentId: existing.id } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "We could not complete the booking.");
      return body as BookingResponse;
    },
    onSuccess: (result) => {
      setBooking(result);
      setError(null);
      setRescheduling(false);
      setSelectedSlot(null);
      queryClient.invalidateQueries({ queryKey: ["schedule-invite", token] });
    },
    onError: (cause: Error) => {
      setError(cause.message);
      setSelectedSlot(null);
      availability.refetch();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!existing) return;
      const res = await fetch("/api/public/scheduling/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, appointmentId: existing.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "We could not cancel the appointment.");
    },
    onSuccess: () => {
      setBooking(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["schedule-invite", token] });
    },
    onError: (cause: Error) => setError(cause.message),
  });

  if (invite.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="panel w-full max-w-3xl space-y-4 p-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    );
  }

  if (invite.isError || !invite.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="panel w-full max-w-lg p-6 sm:p-8">
          <Brand />
          <span className="mt-8 flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <CircleAlert className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">This scheduling link is not valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The link may have expired or been copied incompletely. Please reply to the email from
            our talent acquisition team and we will send a fresh link.
          </p>
        </div>
      </main>
    );
  }

  const data = invite.data;
  const confirmed = booking ?? null;

  /* -------------------- Confirmation -------------------- */
  if (confirmed) {
    const ics = icsDataHref({
      uid: confirmed.appointmentId,
      title: `${confirmed.title} – ${confirmed.candidateName}${confirmed.jobTitle ? ` – ${confirmed.jobTitle}` : ""}`,
      startAt: confirmed.startAt,
      endAt: confirmed.endAt,
      timezone: confirmed.timezone,
      description: `${confirmed.title} with the Seceon talent acquisition team${confirmed.interviewer ? ` (${confirmed.interviewer})` : ""}.`,
      location: confirmed.meetingUrl ?? "Details to be shared",
      organizer: "Seceon Talent Acquisition",
    });

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="panel w-full max-w-lg p-6 sm:p-8">
          <Brand />
          <span className="mt-8 flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <CalendarCheck className="size-5" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold">You&apos;re booked!</h1>
          <div className="mt-5 space-y-1 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
            <p className="font-medium">{confirmed.title}</p>
            <p className="text-muted-foreground">{confirmed.jobTitle ?? "Seceon"}</p>
            <p className="mt-3">{formatDateIn(confirmed.startAt, displayTimezone)}</p>
            <p>
              {formatTimeIn(confirmed.startAt, displayTimezone)} –{" "}
              {formatTimeIn(confirmed.endAt, displayTimezone)}{" "}
              <span className="text-muted-foreground">
                ({timezoneAbbreviation(displayTimezone, new Date(confirmed.startAt))})
              </span>
            </p>
            <p className="pt-3 text-muted-foreground">Candidate</p>
            <p>{confirmed.candidateName}</p>
            {confirmed.interviewer ? (
              <>
                <p className="pt-3 text-muted-foreground">You will meet</p>
                <p>{confirmed.interviewer}</p>
              </>
            ) : null}
            <p className="pt-3 text-muted-foreground">Meeting details</p>
            <p className="break-all">
              {confirmed.meetingUrl ?? "Our team will share the joining details before the call."}
            </p>
          </div>
          <Button asChild className="mt-5 w-full">
            <a href={ics} download={`${confirmed.title.replace(/\s+/g, "-").toLowerCase()}.ics`}>
              Add to calendar
            </a>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            {confirmed.emailDelivered
              ? "A confirmation email is on its way to you."
              : "Please save these details — email confirmations are not switched on yet."}
          </p>
        </div>
      </main>
    );
  }

  /* -------------------- Already booked -------------------- */
  if (existing && !rescheduling) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="panel w-full max-w-lg p-6 sm:p-8">
          <Brand />
          <h1 className="mt-8 text-xl font-semibold">Your {data.title.toLowerCase()} is booked</h1>
          <div className="mt-4 space-y-1 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
            <p>{formatDateIn(existing.start_at, displayTimezone)}</p>
            <p>
              {formatTimeIn(existing.start_at, displayTimezone)} –{" "}
              {formatTimeIn(existing.end_at, displayTimezone)}{" "}
              <span className="text-muted-foreground">
                ({timezoneAbbreviation(displayTimezone, new Date(existing.start_at))})
              </span>
            </p>
            {existing.meeting_url ? <p className="break-all pt-2">{existing.meeting_url}</p> : null}
          </div>
          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
          {data.scheduling.allowReschedule ? (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1"
                onClick={() => {
                  setRescheduling(true);
                  setSelectedDate(null);
                  setSelectedSlot(null);
                }}
              >
                Reschedule
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? "Cancelling…" : "Cancel appointment"}
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              To change this appointment, please reply to our email and the team will help.
            </p>
          )}
        </div>
      </main>
    );
  }

  /* -------------------- Booking flow -------------------- */
  const slots = availability.data?.slots ?? [];
  const today = availability.data?.today ?? zonedDateKey(new Date(), hrTimezone);
  const maxDate = availability.data?.maxDate ?? "9999-12-31";

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-4xl">
        <Brand />
        <div className="panel mt-6 grid gap-6 p-5 sm:p-6 lg:grid-cols-[280px_1fr]">
          {/* Left: appointment summary */}
          <aside className="space-y-4 lg:border-r lg:border-border lg:pr-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {data.jobTitle ?? "Seceon"}
              </p>
              <h1 className="mt-1 text-xl font-semibold">{data.title}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="size-4" /> {data.durationMinutes} minutes
              </p>
            </div>
            {data.description ? (
              <p className="text-sm text-muted-foreground">{data.description}</p>
            ) : null}
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Candidate</p>
              <p className="font-medium">{data.candidate.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{data.candidate.email}</p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe className="size-3.5" /> Times shown in your local timezone
              </Label>
              <Select value={displayTimezone} onValueChange={setDisplayTimezone}>
                <SelectTrigger className="mt-1.5" aria-label="Timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([displayTimezone, hrTimezone, ...TIMEZONE_OPTIONS])).map(
                    (zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone} ({timezoneAbbreviation(zone)})
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            {rescheduling ? (
              <Button variant="ghost" size="sm" onClick={() => setRescheduling(false)}>
                Keep my current time
              </Button>
            ) : null}
          </aside>

          {/* Right: date + time + confirm */}
          <section className="space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarDays className="size-4" /> Select a date
                </h2>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous month"
                    disabled={monthKey(today) >= month}
                    onClick={() => setMonth(shiftMonth(month, -1))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="min-w-32 text-center text-sm">{monthLabel(month)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next month"
                    disabled={monthKey(maxDate) <= month}
                    onClick={() => setMonth(shiftMonth(month, 1))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              {availability.isLoading && availableDates.size === 0 ? (
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, index) => (
                    <Skeleton key={index} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {monthGrid(month).map((dateKey, index) => {
                    if (!dateKey) return <span key={`pad-${index}`} />;
                    const enabled =
                      dateKey >= today && dateKey <= maxDate && availableDates.has(dateKey);
                    const active = selectedDate === dateKey;
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        disabled={!enabled}
                        aria-label={dateKey}
                        onClick={() => {
                          setSelectedDate(dateKey);
                          setSelectedSlot(null);
                          setError(null);
                        }}
                        className={`h-9 rounded-md text-sm transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : enabled
                              ? "bg-secondary text-foreground hover:bg-primary/15"
                              : "text-muted-foreground/40"
                        }`}
                      >
                        {Number(dateKey.slice(-2))}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedDate ? (
              <div>
                <h2 className="text-sm font-semibold">
                  Available times · {formatDateIn(`${selectedDate}T12:00:00Z`, "UTC")}
                </h2>
                {availability.isFetching ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full" />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No times are available on this date. Please choose another day.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {slots.map((slot) => {
                      const active = selectedSlot?.start === slot.start;
                      return (
                        <Button
                          key={slot.start}
                          variant={active ? "default" : "outline"}
                          onClick={() => {
                            setSelectedSlot(slot);
                            setError(null);
                          }}
                        >
                          {formatTimeIn(slot.start, displayTimezone)}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {selectedSlot ? (
              <div className="rounded-lg border border-border bg-secondary/40 p-4">
                <h2 className="text-sm font-semibold">Confirm your booking</h2>
                <div className="mt-2 text-sm">
                  <p className="font-medium">
                    {data.title} · {data.durationMinutes} minutes
                  </p>
                  <p>{formatDateIn(selectedSlot.start, displayTimezone)}</p>
                  <p>
                    {formatTimeIn(selectedSlot.start, displayTimezone)} –{" "}
                    {formatTimeIn(selectedSlot.end, displayTimezone)}
                  </p>
                  <p className="text-muted-foreground">
                    Timezone: {displayTimezone} ({timezoneAbbreviation(displayTimezone)})
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="booking-name">Name</Label>
                    <Input
                      id="booking-name"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="booking-email">Email</Label>
                    <Input
                      id="booking-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="booking-phone">Phone</Label>
                    <Input
                      id="booking-phone"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    />
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  disabled={
                    bookMutation.isPending ||
                    form.name.trim().length < 2 ||
                    !form.email.includes("@")
                  }
                  onClick={() => bookMutation.mutate()}
                >
                  {bookMutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Booking…
                    </>
                  ) : (
                    "Confirm booking"
                  )}
                </Button>
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
