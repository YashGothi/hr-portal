import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECTABLE_STAGES, STAGE_BADGE, STAGE_LABELS, type Stage } from "@/lib/hr";
import { useCandidates, useMoveStage, useRescheduleInterview, type Candidate } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Interview Calendar | aiHIVE" },
      {
        name: "description",
        content:
          "See every scheduled interview and recent hire on one calendar, and drag candidates to a new day or stage.",
      },
      { property: "og:title", content: "Interview Calendar | aiHIVE" },
      {
        property: "og:description",
        content: "Scheduled interviews and recent hires on a single calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type CalendarEntry = {
  candidate: Candidate;
  kind: "interview" | "hired";
  at: Date;
};

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Monday-first grid of 6 weeks covering the given month. */
function buildGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

function CalendarPage() {
  const candidates = useCandidates();
  const moveStage = useMoveStage();
  const reschedule = useRescheduleInterview();
  const [month, setMonth] = useState(() => new Date());
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const entries = useMemo<CalendarEntry[]>(() => {
    const list = candidates.data ?? [];
    const out: CalendarEntry[] = [];
    for (const candidate of list) {
      if (candidate.interview_at) {
        out.push({ candidate, kind: "interview", at: new Date(candidate.interview_at) });
      }
      if (candidate.stage === "hired") {
        out.push({
          candidate,
          kind: "hired",
          at: new Date(candidate.outcome_at ?? candidate.created_at),
        });
      }
    }
    return out;
  }, [candidates.data]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const key = dayKey(entry.at);
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    for (const list of map.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());
    return map;
  }, [entries]);

  const grid = useMemo(() => buildGrid(month), [month]);
  const todayKey = dayKey(new Date());

  function shiftMonth(delta: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  function moveToStage(candidate: Candidate, toStage: Stage) {
    if (toStage === candidate.stage) return;
    moveStage.mutate(
      { candidate, toStage },
      {
        onSuccess: () => toast.success(`${candidate.full_name} moved to ${STAGE_LABELS[toStage]}`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function dropOnDay(day: Date, candidateId: string) {
    const candidate = (candidates.data ?? []).find((c) => c.id === candidateId);
    if (!candidate || !candidate.interview_at) return;
    reschedule.mutate(
      { candidate, day },
      {
        onSuccess: (next) =>
          toast.success(
            `${candidate.full_name}'s interview moved to ${next.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}`,
          ),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  const upcoming = entries
    .filter((e) => e.kind === "interview" && e.at.getTime() >= Date.now())
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <AppShell
      title="Interview calendar"
      subtitle="Scheduled interviews and recent hires, month by month. Drag an interview to another day to reschedule it."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>
            Today
          </Button>
        </div>
      }
    >
      <div className="panel overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-border bg-secondary/40">
          {WEEKDAYS.map((day) => (
            <span
              key={day}
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((day) => {
            const key = dayKey(day);
            const items = byDay.get(key) ?? [];
            const inMonth = day.getMonth() === month.getMonth();
            return (
              <div
                key={key}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverKey(key);
                }}
                onDragLeave={() => setDragOverKey((current) => (current === key ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverKey(null);
                  const id = event.dataTransfer.getData("text/candidate-id");
                  if (id) dropOnDay(day, id);
                }}
                className={`min-h-28 border-b border-r border-border p-2 transition-colors ${
                  inMonth ? "" : "bg-secondary/20"
                } ${dragOverKey === key ? "bg-primary/10" : ""}`}
              >
                <span
                  className={`text-xs font-semibold ${
                    key === todayKey
                      ? "rounded-md bg-primary px-1.5 py-0.5 text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {day.getDate()}
                </span>
                <div className="mt-1.5 space-y-1.5">
                  {items.map((entry) => (
                    <div
                      key={`${entry.candidate.id}-${entry.kind}`}
                      draggable={entry.kind === "interview"}
                      onDragStart={(event) =>
                        event.dataTransfer.setData("text/candidate-id", entry.candidate.id)
                      }
                      className={`rounded-md border p-1.5 text-[11px] ${
                        entry.kind === "interview"
                          ? "cursor-grab border-chart-4/50 bg-chart-4/10 active:cursor-grabbing"
                          : "border-success/40 bg-success/10"
                      }`}
                    >
                      <Link
                        to="/candidates/$candidateId"
                        params={{ candidateId: entry.candidate.id }}
                        className="block truncate font-medium hover:text-primary"
                      >
                        {entry.candidate.full_name}
                      </Link>
                      <p className="truncate text-muted-foreground">
                        {entry.kind === "interview"
                          ? entry.at.toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Hired"}
                        {entry.kind === "interview" && entry.candidate.interview_confirmed_at
                          ? " · Confirmed"
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="font-display text-sm font-semibold">Upcoming interviews</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No interviews scheduled yet — schedule one from the dashboard.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {upcoming.map((entry) => (
              <li
                key={entry.candidate.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3"
              >
                <div className="min-w-0">
                  <Link
                    to="/candidates/$candidateId"
                    params={{ candidateId: entry.candidate.id }}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {entry.candidate.full_name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.at.toLocaleString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {entry.candidate.interviewer ? ` · ${entry.candidate.interviewer}` : ""}
                    {entry.candidate.interview_location
                      ? ` · ${entry.candidate.interview_location}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {entry.candidate.interview_confirmed_at ? (
                    <span className="rounded-md border border-success/40 bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                      Attendance confirmed
                    </span>
                  ) : (
                    <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                      Awaiting confirmation
                    </span>
                  )}
                  <span
                    className={`rounded-md border px-2 py-1 text-xs font-semibold ${STAGE_BADGE[entry.candidate.stage]}`}
                  >
                    {STAGE_LABELS[entry.candidate.stage]}
                  </span>
                  <Select
                    value={entry.candidate.stage}
                    onValueChange={(value) => moveToStage(entry.candidate, value as Stage)}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SELECTABLE_STAGES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {STAGE_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
