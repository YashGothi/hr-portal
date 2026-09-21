import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarDays, Clock, Plus, Trash2, Utensils } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddBlockedTime,
  useAppointments,
  useAppointmentTypes,
  useBlockedTimes,
  useRemoveBlockedTime,
  useSchedulingSettings,
  useSetAppointmentStatus,
  useUpdateSchedulingSettings,
  type Appointment,
} from "@/lib/scheduling/queries";
import {
  APPOINTMENT_STATUS_LABELS,
  DEFAULT_TIMEZONE,
  WEEKDAY_LABELS,
  bookableWindows,
  formatDateIn,
  formatTimeIn,
  minutesToTime,
  timezoneAbbreviation,
  zonedDateKey,
  type SchedulingSettings,
} from "@/lib/scheduling/core";

export const Route = createFileRoute("/_authenticated/scheduling")({
  head: () => ({
    meta: [
      { title: "Interview scheduling & availability | aiHIVE" },
      {
        name: "description",
        content:
          "Manage working hours, lunch break, blocked time and every booked screening or interview call in one place.",
      },
      { property: "og:title", content: "Interview scheduling & availability | aiHIVE" },
      {
        property: "og:description",
        content:
          "Working hours, blocked time and booked candidate calls for the talent acquisition team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SchedulingPage,
});

const TIMEZONES = [DEFAULT_TIMEZONE, "Asia/Dubai", "Europe/London", "America/New_York", "UTC"];

function trimTime(value: string) {
  return value.slice(0, 5);
}

function addDays(dateKey: string, delta: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function SchedulingPage() {
  const settingsQuery = useSchedulingSettings();
  const typesQuery = useAppointmentTypes();
  const appointmentsQuery = useAppointments();
  const blocksQuery = useBlockedTimes();
  const updateSettings = useUpdateSchedulingSettings();
  const addBlock = useAddBlockedTime();
  const removeBlock = useRemoveBlockedTime();
  const setStatus = useSetAppointmentStatus();

  const settings = settingsQuery.data;
  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;

  const [view, setView] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(() => zonedDateKey(new Date(), DEFAULT_TIMEZONE));
  const [block, setBlock] = useState({
    block_date: zonedDateKey(new Date(), DEFAULT_TIMEZONE),
    all_day: false,
    start_time: "15:00",
    end_time: "16:00",
    reason: "",
  });

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    const weekday = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7;
    const monday = addDays(anchor, -weekday);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, [anchor, view]);

  const appointments = appointmentsQuery.data ?? [];
  const blocks = blocksQuery.data ?? [];

  function patch(next: Partial<SchedulingSettings>) {
    updateSettings.mutate(next, {
      onSuccess: () => toast.success("Availability updated"),
      onError: () => toast.error("Could not save your availability"),
    });
  }

  return (
    <AppShell
      title="Scheduling"
      subtitle="Your availability, blocked time and every booked candidate call"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant={view === "day" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("day")}
          >
            Day
          </Button>
          <Button
            variant={view === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("week")}
          >
            Week
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Availability settings */}
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="size-4" /> Working hours
          </h2>
          {!settings ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading your availability…</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="work-start">Day starts</Label>
                  <Input
                    id="work-start"
                    type="time"
                    defaultValue={trimTime(settings.work_start)}
                    onBlur={(event) => patch({ work_start: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="work-end">Day ends</Label>
                  <Input
                    id="work-end"
                    type="time"
                    defaultValue={trimTime(settings.work_end)}
                    onBlur={(event) => patch({ work_end: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="break-start">Break starts</Label>
                  <Input
                    id="break-start"
                    type="time"
                    defaultValue={trimTime(settings.break_start)}
                    onBlur={(event) => patch({ break_start: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="break-end">Break ends</Label>
                  <Input
                    id="break-end"
                    type="time"
                    defaultValue={trimTime(settings.break_end)}
                    onBlur={(event) => patch({ break_end: event.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Working days</Label>
                <div className="mt-2 space-y-2">
                  {WEEKDAY_LABELS.map((label, index) => (
                    <label key={label} className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <Switch
                        checked={settings.working_days.includes(index)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...settings.working_days, index]
                            : settings.working_days.filter((day) => day !== index);
                          patch({ working_days: [...new Set(next)].sort() });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={(value) => patch({ timezone: value })}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([timezone, ...TIMEZONES])).map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {zone} ({timezoneAbbreviation(zone)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="meeting-url">Default meeting link</Label>
                  <Input
                    id="meeting-url"
                    placeholder="https://meet.google.com/your-room"
                    defaultValue={settings.default_meeting_url ?? ""}
                    onBlur={(event) =>
                      patch({ default_meeting_url: event.target.value.trim() || null })
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Added to every new booking. Leave empty to share joining details yourself.
                  </p>
                </div>
                <div>
                  <Label htmlFor="interviewer">Shown to candidates as</Label>
                  <Input
                    id="interviewer"
                    placeholder="Talent Acquisition Team"
                    defaultValue={settings.interviewer_name ?? ""}
                    onBlur={(event) =>
                      patch({ interviewer_name: event.target.value.trim() || null })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="notice">Notice (minutes)</Label>
                    <Input
                      id="notice"
                      type="number"
                      min={0}
                      defaultValue={settings.min_notice_minutes}
                      onBlur={(event) =>
                        patch({ min_notice_minutes: Math.max(0, Number(event.target.value) || 0) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="horizon">Book up to (days)</Label>
                    <Input
                      id="horizon"
                      type="number"
                      min={1}
                      defaultValue={settings.booking_horizon_days}
                      onBlur={(event) =>
                        patch({
                          booking_horizon_days: Math.max(1, Number(event.target.value) || 30),
                        })
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between text-sm">
                  <span>Candidates may reschedule or cancel</span>
                  <Switch
                    checked={settings.allow_candidate_reschedule}
                    onCheckedChange={(checked) => patch({ allow_candidate_reschedule: checked })}
                  />
                </label>
              </div>

              <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <Utensils className="size-3.5" /> Bookable windows
                </p>
                {bookableWindows(settings).map((window) => (
                  <p key={window.startMin}>
                    {minutesToTime(window.startMin)} – {minutesToTime(window.endMin)}
                  </p>
                ))}
              </div>

              <div className="border-t border-border pt-4 text-xs text-muted-foreground">
                {(typesQuery.data ?? []).map((type) => (
                  <p key={type.code}>
                    {type.title} · {type.duration_minutes} minutes {type.active ? "" : "(inactive)"}
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Calendar */}
        <section className="panel p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4" />{" "}
              {view === "day"
                ? formatDateIn(`${anchor}T12:00:00Z`, "UTC")
                : `Week of ${formatDateIn(`${days[0]}T12:00:00Z`, "UTC")}`}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAnchor(addDays(anchor, view === "day" ? -1 : -7))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAnchor(zonedDateKey(new Date(), timezone))}
              >
                Today
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAnchor(addDays(anchor, view === "day" ? 1 : 7))}
              >
                Next
              </Button>
            </div>
          </div>

          <div
            className={`mt-4 grid gap-3 ${view === "week" ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}
          >
            {days.map((dateKey) => (
              <DaySchedule
                key={dateKey}
                dateKey={dateKey}
                settings={settings}
                appointments={appointments}
                blocks={blocks}
                onStatus={(id, status) =>
                  setStatus.mutate(
                    { id, status },
                    { onSuccess: () => toast.success("Appointment updated") },
                  )
                }
              />
            ))}
          </div>
        </section>

        {/* Blocked time */}
        <section className="panel p-5 lg:col-span-3">
          <h2 className="text-sm font-semibold">Blocked time</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Blocking time removes every overlapping slot from candidate booking pages immediately.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <div>
              <Label htmlFor="block-date">Date</Label>
              <Input
                id="block-date"
                type="date"
                value={block.block_date}
                onChange={(event) => setBlock({ ...block, block_date: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="block-from">From</Label>
              <Input
                id="block-from"
                type="time"
                disabled={block.all_day}
                value={block.start_time}
                onChange={(event) => setBlock({ ...block, start_time: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="block-to">To</Label>
              <Input
                id="block-to"
                type="time"
                disabled={block.all_day}
                value={block.end_time}
                onChange={(event) => setBlock({ ...block, end_time: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="block-reason">Reason</Label>
              <Input
                id="block-reason"
                placeholder="Optional"
                value={block.reason}
                onChange={(event) => setBlock({ ...block, reason: event.target.value })}
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={block.all_day}
                  onCheckedChange={(checked) => setBlock({ ...block, all_day: checked })}
                />
                Entire day
              </label>
              <Button
                size="sm"
                disabled={addBlock.isPending}
                onClick={() =>
                  addBlock.mutate(
                    {
                      block_date: block.block_date,
                      all_day: block.all_day,
                      start_time: block.start_time,
                      end_time: block.end_time,
                      reason: block.reason || null,
                    },
                    {
                      onSuccess: () => toast.success("Time blocked"),
                      onError: () => toast.error("Check the times and try again"),
                    },
                  )
                }
              >
                <Plus className="size-4" /> Block
              </Button>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-border">
            {blocks.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">Nothing blocked yet.</li>
            ) : (
              blocks.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    {formatDateIn(`${row.block_date}T12:00:00Z`, "UTC")} ·{" "}
                    {row.all_day
                      ? "Entire day"
                      : `${trimTime(row.start_time ?? "")} – ${trimTime(row.end_time ?? "")}`}
                    {row.reason ? (
                      <span className="text-muted-foreground"> · {row.reason}</span>
                    ) : null}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove blocked time"
                    onClick={() => removeBlock.mutate(row.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

/** One day: booked calls, blocked periods, lunch and the working window. */
function DaySchedule({
  dateKey,
  settings,
  appointments,
  blocks,
  onStatus,
}: {
  dateKey: string;
  settings: SchedulingSettings | null | undefined;
  appointments: Appointment[];
  blocks: {
    block_date: string;
    all_day: boolean;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
  }[];
  onStatus: (id: string, status: "COMPLETED" | "NO_SHOW") => void;
}) {
  if (!settings) return null;
  const timezone = settings.timezone;
  const weekday = (new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 7) % 7;
  const working = settings.working_days.includes(weekday);

  const dayAppointments = appointments
    .filter((row) => zonedDateKey(new Date(row.start_at), timezone) === dateKey)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const dayBlocks = blocks.filter((row) => row.block_date === dateKey);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{formatDateIn(`${dateKey}T12:00:00Z`, "UTC")}</p>
        {working ? (
          <span className="text-xs text-muted-foreground">
            {trimTime(settings.work_start)}–{trimTime(settings.work_end)}
          </span>
        ) : (
          <Badge variant="outline" className="border-border bg-secondary text-muted-foreground">
            Outside working days
          </Badge>
        )}
      </div>

      {working ? (
        <div className="mt-2 space-y-1.5 text-sm">
          {dayAppointments.length === 0 && dayBlocks.length === 0 ? (
            <p className="text-muted-foreground">Fully available.</p>
          ) : null}

          {dayAppointments.map((row) => (
            <div
              key={row.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
                row.status === "BOOKED"
                  ? row.appointment_type === "INTERVIEW"
                    ? "border-chart-4/50 bg-chart-4/10"
                    : "border-primary/40 bg-primary/10"
                  : "border-border bg-secondary/50 opacity-70"
              }`}
            >
              <span className="min-w-0">
                <span className="font-medium">
                  {formatTimeIn(row.start_at, timezone)}–{formatTimeIn(row.end_at, timezone)}
                </span>{" "}
                <span className="truncate">
                  {row.appointment_type === "INTERVIEW" ? "Interview" : "Screening"} ·{" "}
                  {row.candidate_name}
                </span>
                {row.status !== "BOOKED" ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {APPOINTMENT_STATUS_LABELS[row.status]}
                  </span>
                ) : null}
              </span>
              {row.status === "BOOKED" ? (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onStatus(row.id, "COMPLETED")}>
                    Done
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onStatus(row.id, "NO_SHOW")}>
                    No show
                  </Button>
                </span>
              ) : null}
            </div>
          ))}

          {dayBlocks.map((row, index) => (
            <div
              key={`${row.block_date}-${index}`}
              className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-warning"
            >
              {row.all_day
                ? "Entire day blocked"
                : `${trimTime(row.start_time ?? "")}–${trimTime(row.end_time ?? "")} blocked`}
              {row.reason ? ` · ${row.reason}` : ""}
            </div>
          ))}

          <div className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
            Times in {timezoneAbbreviation(timezone)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
