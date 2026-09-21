import { STAGE_LABELS, type Stage } from "@/lib/hr";
import type { Candidate, StageEvent } from "@/lib/queries";

type TimelineEntry = {
  id: string;
  title: string;
  at: string;
  note?: string | null;
};

function formatWhen(value: string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Builds a dated journey for one candidate: applied, shortlisted, interviewed, hired or not selected. */
export function buildTimeline(candidate: Candidate, history: StageEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: "created",
      title: "Application received",
      at: candidate.created_at,
      note: candidate.applied_role ? `Applied for ${candidate.applied_role}` : null,
    },
  ];

  for (const event of history) {
    const stage = event.to_stage as Stage;
    if (stage === "application") continue;
    entries.push({
      id: `stage-${event.id}`,
      title: `Moved to ${STAGE_LABELS[stage] ?? event.to_stage}`,
      at: event.created_at,
      note: null,
    });
  }

  if (candidate.interview_at) {
    entries.push({
      id: "interview",
      title: "Interview scheduled",
      at: candidate.interview_at,
      note:
        [candidate.interviewer, candidate.interview_location].filter(Boolean).join(" · ") || null,
    });
  }

  if (candidate.outcome !== "pending" && candidate.outcome_at) {
    entries.push({
      id: "outcome",
      title: candidate.outcome === "hired" ? "Hired" : "Not selected",
      at: candidate.outcome_at,
      note: candidate.outcome_notes,
    });
  }

  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function CandidateTimeline({
  candidate,
  history,
}: {
  candidate: Candidate;
  history: StageEvent[];
}) {
  const entries = buildTimeline(candidate, history);

  return (
    <ol className="mt-4 space-y-5">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative pl-6">
          <span className="absolute left-0 top-1.5 size-2.5 rounded-full bg-primary" />
          {index < entries.length - 1 ? (
            <span className="absolute left-[4px] top-5 h-[calc(100%+0.75rem)] w-px bg-border" />
          ) : null}
          <p className="text-sm font-medium">{entry.title}</p>
          <p className="text-xs text-muted-foreground">{formatWhen(entry.at)}</p>
          {entry.note ? <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
