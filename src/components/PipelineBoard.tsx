import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PIPELINE_STAGES,
  SELECTABLE_STAGES,
  STAGE_BADGE,
  STAGE_LABELS,
  STATUS_STAGES,
  scoreTone,
  type Stage,
} from "@/lib/hr";
import { useMoveStage, type Candidate } from "@/lib/queries";

const TONE_CLASS = {
  success: "border-success/40 bg-success/15 text-success",
  warning: "border-warning/40 bg-warning/15 text-warning",
  destructive: "border-destructive/40 bg-destructive/15 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

/**
 * Kanban board of the hiring pipeline: one column per active stage plus a
 * single "Status" column holding the final Accepted / Rejected outcomes.
 */
export function PipelineBoard({
  candidates,
  selectedIds,
  onToggleSelect,
}: {
  candidates: Candidate[];
  selectedIds?: string[];
  onToggleSelect?: (candidate: Candidate) => void;
}) {
  const moveStage = useMoveStage();
  const [dragOver, setDragOver] = useState<Stage | null>(null);

  function move(candidate: Candidate, toStage: Stage) {
    if (toStage === candidate.stage) return;
    moveStage.mutate(
      { candidate, toStage },
      {
        onSuccess: () => toast.success(`${candidate.full_name} moved to ${STAGE_LABELS[toStage]}`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function dropHandlers(stage: Stage) {
    return {
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault();
        setDragOver(stage);
      },
      onDragLeave: () => setDragOver((current) => (current === stage ? null : current)),
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        setDragOver(null);
        const id = event.dataTransfer.getData("text/candidate-id");
        const dragged = candidates.find((c) => c.id === id);
        if (dragged) move(dragged, stage);
      },
    };
  }

  function CandidateCard({ candidate }: { candidate: Candidate }) {
    return (
      <article
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/candidate-id", candidate.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        className="cursor-grab rounded-lg border border-border bg-secondary/40 p-3 active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onToggleSelect && selectedIds && (
              <Checkbox
                checked={selectedIds.includes(candidate.id)}
                onCheckedChange={() => onToggleSelect(candidate)}
                aria-label={`Select ${candidate.full_name}`}
                className="mt-0.5 shrink-0"
              />
            )}
            <Link
              to="/candidates/$candidateId"
              params={{ candidateId: candidate.id }}
              className="text-sm font-medium hover:text-primary truncate"
            >
              {candidate.full_name}
            </Link>
          </div>
          <span
            className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${TONE_CLASS[scoreTone(candidate.ats_score)]}`}
          >
            {candidate.ats_score ?? "—"}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {candidate.applied_role ?? "No opening set"}
        </p>
        <p className="truncate text-xs text-muted-foreground">{candidate.email}</p>
        <Select value={candidate.stage} onValueChange={(value) => move(candidate, value as Stage)}>
          <SelectTrigger className="mt-3 h-8 w-full text-xs">
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
      </article>
    );
  }

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex min-w-max gap-4">
        {PIPELINE_STAGES.map((stage) => {
          const inStage = candidates.filter((c) => c.stage === stage);
          return (
            <section
              key={stage}
              {...dropHandlers(stage)}
              className={`panel w-72 shrink-0 p-4 transition-colors ${dragOver === stage ? "border-primary/60 bg-primary/5" : ""}`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <span
                  className={`rounded-md border px-2 py-1 text-xs font-semibold ${STAGE_BADGE[stage]}`}
                >
                  {STAGE_LABELS[stage]}
                </span>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {inStage.length}
                </span>
              </header>

              <div className="mt-3 space-y-3">
                {inStage.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    No candidates in {STAGE_LABELS[stage]}
                  </p>
                ) : (
                  inStage.map((candidate) => (
                    <CandidateCard key={candidate.id} candidate={candidate} />
                  ))
                )}
              </div>
            </section>
          );
        })}

        <section className="panel w-72 shrink-0 p-4">
          <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
            <span className="rounded-md border border-border bg-secondary px-2 py-1 text-xs font-semibold">
              Status
            </span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {candidates.filter((c) => STATUS_STAGES.includes(c.stage as never)).length}
            </span>
          </header>

          <div className="mt-3 space-y-4">
            {STATUS_STAGES.map((stage) => {
              const inStage = candidates.filter((c) => c.stage === stage);
              return (
                <div
                  key={stage}
                  {...dropHandlers(stage)}
                  className={`rounded-lg border border-dashed p-3 transition-colors ${dragOver === stage ? "border-primary/60 bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STAGE_BADGE[stage]}`}
                    >
                      {STAGE_LABELS[stage]}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{inStage.length}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {inStage.length === 0 ? (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        Drop here to mark {STAGE_LABELS[stage].toLowerCase()}
                      </p>
                    ) : (
                      inStage.map((candidate) => (
                        <CandidateCard key={candidate.id} candidate={candidate} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {(["offer"] as const).map((stage) => {
          const inStage = candidates.filter((c) => c.stage === stage);
          return (
            <section
              key={stage}
              {...dropHandlers(stage)}
              className={`panel w-72 shrink-0 p-4 transition-colors ${dragOver === stage ? "border-primary/60 bg-primary/5" : ""}`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <span
                  className={`rounded-md border px-2 py-1 text-xs font-semibold ${STAGE_BADGE[stage]}`}
                >
                  {STAGE_LABELS[stage]}
                </span>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {inStage.length}
                </span>
              </header>
              <div className="mt-3 space-y-3">
                {inStage.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    No candidates in {STAGE_LABELS[stage]}
                  </p>
                ) : (
                  inStage.map((candidate) => (
                    <CandidateCard key={candidate.id} candidate={candidate} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
