import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Ban,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Play,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cancelOnboarding,
  completeOnboarding,
  completeOnboardingTask,
  createOnboarding,
  getCandidateOnboarding,
  startOnboarding,
} from "@/lib/onboarding.functions";

const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED: "border-border bg-secondary text-secondary-foreground",
  IN_PROGRESS: "border-primary/40 bg-primary/15 text-primary",
  COMPLETED: "border-success/40 bg-success/15 text-success font-semibold",
  CANCELLED: "border-destructive/40 bg-destructive/15 text-destructive",
};

export function CandidateOnboarding({
  candidateId,
  candidateName,
  isHired,
  jobId: _jobId,
}: {
  candidateId: string;
  candidateName: string;
  isHired: boolean;
  jobId?: string | null;
}) {
  const queryClient = useQueryClient();
  const fetchOnboarding = useServerFn(getCandidateOnboarding);
  const createFn = useServerFn(createOnboarding);
  const startFn = useServerFn(startOnboarding);
  const completeTaskFn = useServerFn(completeOnboardingTask);
  const completeFn = useServerFn(completeOnboarding);
  const cancelFn = useServerFn(cancelOnboarding);

  const [startDate, setStartDate] = useState("");
  const [isInitiating, setIsInitiating] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const onboardingQuery = useQuery({
    queryKey: ["candidate-onboarding", candidateId],
    queryFn: async () => fetchOnboarding({ data: { candidateId } }),
    enabled: isHired,
  });

  const onboarding = onboardingQuery.data?.onboarding;
  const tasks = onboardingQuery.data?.tasks ?? [];
  const events = onboardingQuery.data?.events ?? [];
  const eligibility = onboardingQuery.data?.eligibility;

  // Initialize start date from accepted offer once available
  const effectiveDefaultDate = eligibility?.defaultStartDate ?? "";

  const createMutation = useMutation({
    mutationFn: async () => {
      return createFn({
        data: {
          candidateId,
          startDate: startDate || effectiveDefaultDate || null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      toast.success("Onboarding initiated with 7 default tasks.");
      setIsInitiating(false);
      setStartDate("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startMutation = useMutation({
    mutationFn: async (onboardingId: string) => {
      return startFn({ data: { onboardingId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      toast.success("Onboarding transitioned to IN_PROGRESS.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!onboarding) return;
      return completeTaskFn({
        data: {
          taskId,
          onboardingId: onboarding.id,
          candidateId,
        },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      if (res?.alreadyCompleted) {
        toast.info("Task was already completed.");
      } else {
        toast.success("Task marked as completed.");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async (onboardingId: string) => {
      return completeFn({ data: { onboardingId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      toast.success("Onboarding successfully completed!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (onboardingId: string) => {
      return cancelFn({
        data: {
          onboardingId,
          ...(cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      toast.info("Onboarding cancelled.");
      setIsCancelling(false);
      setCancelReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Calculate progress
  const completedTaskCount = tasks.filter((t) => t.status === "COMPLETED").length;
  const totalTaskCount = tasks.length;
  const progressPercent =
    totalTaskCount > 0 ? Math.round((completedTaskCount / totalTaskCount) * 100) : 0;
  const allTasksDone = totalTaskCount > 0 && completedTaskCount === totalTaskCount;

  return (
    <section className="panel p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <UserCheck className="size-4 text-primary" /> Onboarding &amp; Handoff
        </h3>
        {onboarding && (
          <Badge className={`text-xs ${STATUS_BADGE[onboarding.status] || ""}`}>
            {onboarding.status.replace("_", " ")}
          </Badge>
        )}
      </div>

      {!isHired ? (
        /* Non-hired Candidate State */
        <div className="rounded-lg border border-border/80 bg-muted/40 p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1 text-xs">
              <p className="font-medium text-foreground">Onboarding Not Available</p>
              <p className="text-muted-foreground">
                Onboarding is available after the candidate is hired.
              </p>
            </div>
          </div>
        </div>
      ) : onboardingQuery.isLoading ? (
        /* Loading State */
        <div className="py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading onboarding records...
        </div>
      ) : !onboarding ? (
        /* Hired Candidate Without Active Onboarding */
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">Candidate is hired and ready for onboarding.</p>
            <p className="text-xs text-muted-foreground">
              Initiating onboarding will automatically create the 7 default compliance and IT
              provisioning tasks.
            </p>

            {effectiveDefaultDate && (
              <p className="text-xs text-muted-foreground">
                Accepted offer start date:{" "}
                <span className="font-medium text-foreground">{effectiveDefaultDate}</span>
              </p>
            )}

            {!isInitiating ? (
              <Button size="sm" onClick={() => setIsInitiating(true)} className="gap-1.5">
                <Play className="size-3.5" /> Initiate Onboarding
              </Button>
            ) : (
              <div className="pt-2 border-t border-border/60 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="onboardingStartDate" className="text-xs">
                    Start Date
                  </Label>
                  <Input
                    id="onboardingStartDate"
                    type="date"
                    defaultValue={effectiveDefaultDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-xs max-w-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Defaults to accepted offer start date if available.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending}
                    className="gap-1.5"
                  >
                    {createMutation.isPending && <Loader2 className="size-3 animate-spin" />}
                    Confirm &amp; Create Tasks
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsInitiating(false)}
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Active or Completed Onboarding Display */
        <div className="space-y-4">
          {/* Header Card: Status & Dates */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Candidate</p>
                <p className="text-sm font-semibold">{candidateName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Start Date</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  {onboarding.start_date || "Not set"}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1 pt-2 border-t border-border/60">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Task Completion</span>
                <span className="font-semibold text-foreground">
                  {completedTaskCount}/{totalTaskCount} ({progressPercent}%)
                </span>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
              {onboarding.status === "NOT_STARTED" && (
                <Button
                  size="sm"
                  onClick={() => startMutation.mutate(onboarding.id)}
                  disabled={startMutation.isPending}
                  className="gap-1.5"
                >
                  {startMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Start Onboarding
                </Button>
              )}

              {onboarding.status === "IN_PROGRESS" && (
                <Button
                  size="sm"
                  onClick={() => completeOnboardingMutation.mutate(onboarding.id)}
                  disabled={!allTasksDone || completeOnboardingMutation.isPending}
                  className="gap-1.5"
                >
                  {completeOnboardingMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  Complete Onboarding
                </Button>
              )}

              {(onboarding.status === "NOT_STARTED" || onboarding.status === "IN_PROGRESS") &&
                !isCancelling && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsCancelling(true)}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Ban className="size-3.5" /> Cancel Onboarding
                  </Button>
                )}

              {onboarding.status === "COMPLETED" && (
                <span className="text-xs text-success font-medium flex items-center gap-1">
                  <CheckCircle2 className="size-4" /> Onboarding completed on{" "}
                  {onboarding.completed_at
                    ? new Date(onboarding.completed_at).toLocaleDateString()
                    : ""}
                </span>
              )}
            </div>

            {/* Cancellation Prompt */}
            {isCancelling && (
              <div className="pt-3 border-t border-border/60 space-y-2">
                <Label htmlFor="cancelReason" className="text-xs text-destructive">
                  Reason for cancelling onboarding:
                </Label>
                <Input
                  id="cancelReason"
                  placeholder="e.g., Offer rescinded or start date delayed"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => cancelMutation.mutate(onboarding.id)}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending && <Loader2 className="size-3 animate-spin" />}
                    Confirm Cancellation
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsCancelling(false)}
                    disabled={cancelMutation.isPending}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Task Checklist */}
          <div className="space-y-2">
            <p className="label-caps">Tasks Checklist</p>
            <ul className="divide-y divide-border/60 border border-border/60 rounded-lg bg-card overflow-hidden">
              {tasks.length === 0 ? (
                <li className="p-3 text-xs text-muted-foreground text-center">
                  No tasks found for this onboarding record.
                </li>
              ) : (
                tasks.map((task) => {
                  const isCompleted = task.status === "COMPLETED";
                  const canComplete =
                    (onboarding.status === "NOT_STARTED" || onboarding.status === "IN_PROGRESS") &&
                    !isCompleted;

                  return (
                    <li
                      key={task.id}
                      className="p-3 flex items-start justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        {isCompleted ? (
                          <CheckCircle2 className="size-4 text-success mt-0.5 shrink-0" />
                        ) : (
                          <Circle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div className="space-y-0.5">
                          <p
                            className={`font-medium ${
                              isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                            }`}
                          >
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-[11px] text-muted-foreground">{task.description}</p>
                          )}
                          {task.completed_at && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="size-3" />
                              Completed {new Date(task.completed_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>

                      {canComplete && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[11px] px-2.5"
                          onClick={() => completeTaskMutation.mutate(task.id)}
                          disabled={completeTaskMutation.isPending}
                        >
                          Complete
                        </Button>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          {/* Audit Trail */}
          {events.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/60">
              <p className="label-caps">Onboarding Audit History</p>
              <ul className="space-y-1.5 text-xs">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-start justify-between gap-2 p-2 rounded bg-muted/40 text-muted-foreground"
                  >
                    <div>
                      <span className="font-semibold text-foreground">
                        {ev.event_type.replace(/_/g, " ")}
                      </span>
                      {ev.notes && <p className="text-[11px] mt-0.5">{ev.notes}</p>}
                    </div>
                    <span className="text-[10px] shrink-0">
                      {new Date(ev.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
