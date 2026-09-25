import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelOnboarding,
  completeOnboarding,
  createOnboarding,
  getCandidateOnboarding,
  resendOnboardingInvite,
  reviewOnboardingDocumentAction,
} from "@/lib/onboarding.functions";
import type { OnboardingDocumentWithSignedUrl } from "@/lib/onboarding.functions";

const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED: "border-border bg-secondary text-secondary-foreground",
  IN_PROGRESS: "border-primary/40 bg-primary/15 text-primary",
  COMPLETED:
    "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold",
  CANCELLED: "border-destructive/40 bg-destructive/15 text-destructive",
};

const EVENT_LABELS: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  ONBOARDING_CREATED: {
    label: "Onboarding record initialized",
    icon: Play,
    color: "text-primary",
  },
  ONBOARDING_INVITE_SENT: {
    label: "Invitation email delivered to candidate",
    icon: Mail,
    color: "text-sky-500",
  },
  ONBOARDING_STARTED: {
    label: "Candidate accessed onboarding portal",
    icon: ExternalLink,
    color: "text-amber-500",
  },
  ONBOARDING_DOC_UPLOADED: {
    label: "Document uploaded by candidate",
    icon: FileText,
    color: "text-indigo-500",
  },
  ONBOARDING_DOC_VERIFIED: {
    label: "Document verified by recruiter",
    icon: FileCheck2,
    color: "text-emerald-500",
  },
  ONBOARDING_DOC_REJECTED: {
    label: "Document rejected by recruiter",
    icon: AlertCircle,
    color: "text-rose-500",
  },
  ONBOARDING_COMPLETED: {
    label: "All requirements verified — Onboarding completed",
    icon: CheckCircle2,
    color: "text-emerald-600",
  },
  ONBOARDING_CANCELLED: {
    label: "Onboarding cancelled",
    icon: Ban,
    color: "text-destructive",
  },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const resendInviteFn = useServerFn(resendOnboardingInvite);
  const reviewDocFn = useServerFn(reviewOnboardingDocumentAction);
  const completeFn = useServerFn(completeOnboarding);
  const cancelFn = useServerFn(cancelOnboarding);

  const [startDate, setStartDate] = useState("");
  const [isInitiating, setIsInitiating] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Reject modal state
  const [rejectingDoc, setRejectingDoc] = useState<OnboardingDocumentWithSignedUrl | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");

  const onboardingQuery = useQuery({
    queryKey: ["candidate-onboarding", candidateId],
    queryFn: async () => fetchOnboarding({ data: { candidateId } }),
    enabled: isHired,
  });

  const onboarding = onboardingQuery.data?.onboarding;
  const documents = (onboardingQuery.data?.documents ?? []) as OnboardingDocumentWithSignedUrl[];
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
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      toast.success(
        res?.emailSent
          ? "Onboarding initiated and invitation email sent to candidate."
          : "Onboarding initiated. Invitation link generated.",
      );
      setIsInitiating(false);
      setStartDate("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (onboardingId: string) => {
      return resendInviteFn({
        data: {
          onboardingId,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      toast.success(
        res?.emailSent
          ? "Invitation resent to candidate with fresh 14-day token."
          : "Fresh invitation token generated.",
      );
      if (res?.onboardingUrl) {
        navigator.clipboard?.writeText(res.onboardingUrl).catch(() => {});
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reviewDocMutation = useMutation({
    mutationFn: async ({
      documentId,
      decision,
      notes,
    }: {
      documentId: string;
      decision: "VERIFIED" | "REJECTED";
      notes?: string | null;
    }) => {
      if (!onboarding) return;
      return reviewDocFn({
        data: {
          onboardingId: onboarding.id,
          documentId,
          decision,
          ...(notes !== undefined ? { reviewNotes: notes } : {}),
        },
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      if (vars.decision === "VERIFIED") {
        toast.success("Document marked as verified.");
      } else {
        toast.info("Document marked as rejected with recruiter feedback.");
      }
      setRejectingDoc(null);
      setRejectionNotes("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async (onboardingId: string) => {
      return completeFn({ data: { onboardingId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-onboarding", candidateId] });
      toast.success("Onboarding successfully completed! All compliance documents verified.");
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

  // Calculate dynamic compliance progress
  const requiredDocs = documents.filter((d) => d.is_required);
  const totalRequiredCount = requiredDocs.length;
  const verifiedRequiredCount = requiredDocs.filter((d) => d.document_status === "VERIFIED").length;
  const pendingReviewCount = documents.filter((d) => d.document_status === "PENDING_REVIEW").length;

  const progressPercent =
    totalRequiredCount > 0 ? Math.round((verifiedRequiredCount / totalRequiredCount) * 100) : 100;
  const allRequiredVerified =
    totalRequiredCount > 0 && verifiedRequiredCount === totalRequiredCount;

  return (
    <section className="panel p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserCheck className="size-4 text-primary" /> Candidate Onboarding &amp; Compliance
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
        <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading onboarding records...
        </div>
      ) : !onboarding ? (
        /* Hired Candidate Without Active Onboarding */
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Candidate is Hired and Ready for Onboarding
              </p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Initiating onboarding generates a secure 256-bit candidate portal link, configures the
              required document compliance checklist (Identity Verification, Signed Offer Letter,
              Payroll &amp; Tax Forms), and dispatches the candidate welcome email.
            </p>

            {effectiveDefaultDate && (
              <p className="text-xs text-muted-foreground">
                Accepted offer start date:{" "}
                <span className="font-medium text-foreground">{effectiveDefaultDate}</span>
              </p>
            )}

            {!isInitiating ? (
              <Button size="sm" onClick={() => setIsInitiating(true)} className="gap-1.5 mt-2">
                <Play className="size-3.5" /> Initiate Onboarding
              </Button>
            ) : (
              <div className="pt-3 border-t border-border/60 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="onboardingStartDate" className="text-xs font-medium">
                    Target Start Date
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
                    Confirm &amp; Send Invitation
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
        <div className="space-y-5">
          {/* Header Summary Card */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Candidate</p>
                <p className="text-sm font-semibold text-foreground">{candidateName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Target Start Date</p>
                <p className="text-sm font-medium flex items-center gap-1 text-foreground">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  {onboarding.start_date || "Not set"}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Document Compliance Progress</span>
                <span className="font-semibold text-foreground">
                  {verifiedRequiredCount}/{totalRequiredCount} Required Verified ({progressPercent}
                  %)
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              {pendingReviewCount > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 mt-1">
                  <Clock className="size-3" /> {pendingReviewCount} document(s) uploaded and
                  awaiting recruiter review.
                </p>
              )}
            </div>

            {/* Recruiter Action Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
              {/* Resend Invite */}
              {(onboarding.status === "NOT_STARTED" || onboarding.status === "IN_PROGRESS") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resendInviteMutation.mutate(onboarding.id)}
                  disabled={resendInviteMutation.isPending}
                  className="gap-1.5 text-xs"
                >
                  {resendInviteMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Send className="size-3 text-sky-500" />
                  )}
                  Resend Portal Invite
                </Button>
              )}

              {/* Complete Onboarding Button with Server-Side Completion Gate */}
              {onboarding.status === "IN_PROGRESS" && (
                <Button
                  size="sm"
                  onClick={() => completeOnboardingMutation.mutate(onboarding.id)}
                  disabled={!allRequiredVerified || completeOnboardingMutation.isPending}
                  className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  title={
                    !allRequiredVerified
                      ? `Cannot complete: ${totalRequiredCount - verifiedRequiredCount} required document(s) must be verified first.`
                      : "Complete onboarding lifecycle"
                  }
                >
                  {completeOnboardingMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  Complete Onboarding
                </Button>
              )}

              {/* Completed Status Text */}
              {onboarding.status === "COMPLETED" && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" /> Onboarding Completed on{" "}
                  {onboarding.completed_at
                    ? new Date(onboarding.completed_at).toLocaleDateString()
                    : ""}
                </span>
              )}

              {/* Cancel Button */}
              {(onboarding.status === "NOT_STARTED" || onboarding.status === "IN_PROGRESS") &&
                !isCancelling && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsCancelling(true)}
                    className="gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                  >
                    <Ban className="size-3" /> Cancel
                  </Button>
                )}
            </div>

            {/* Cancellation Prompt */}
            {isCancelling && (
              <div className="pt-3 border-t border-border/60 space-y-2">
                <Label htmlFor="cancelReason" className="text-xs text-destructive font-medium">
                  Reason for cancelling onboarding:
                </Label>
                <Input
                  id="cancelReason"
                  placeholder="e.g. Candidate withdrew acceptance, delayed start"
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
                    className="text-xs gap-1.5"
                  >
                    {cancelMutation.isPending && <Loader2 className="size-3 animate-spin" />}
                    Confirm Cancellation
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsCancelling(false);
                      setCancelReason("");
                    }}
                    disabled={cancelMutation.isPending}
                    className="text-xs"
                  >
                    Keep Active
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Document Compliance Requirements List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" /> Document Compliance Checklist (
                {documents.length})
              </h4>
              {!allRequiredVerified && onboarding.status === "IN_PROGRESS" && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {totalRequiredCount - verifiedRequiredCount} required item(s) pending verification
                </span>
              )}
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No document requirements defined.
              </p>
            ) : (
              <div className="space-y-2.5">
                {documents.map((doc) => {
                  const isVerified = doc.document_status === "VERIFIED";
                  const isPending = doc.document_status === "PENDING_REVIEW";
                  const isRejected = doc.document_status === "REJECTED";
                  const isNotSubmitted = doc.document_status === "NOT_SUBMITTED";

                  return (
                    <div
                      key={doc.id}
                      className={`rounded-lg border p-3.5 transition-colors ${
                        isVerified
                          ? "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10"
                          : isPending
                            ? "border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/15"
                            : isRejected
                              ? "border-rose-500/40 bg-rose-50/20 dark:bg-rose-950/10"
                              : "border-border/80 bg-card"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {/* Title & Requirements */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {doc.title}
                            </span>
                            {doc.is_required ? (
                              <Badge variant="outline" className="text-[10px] py-0 border-border">
                                Required
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 border-border text-muted-foreground"
                              >
                                Optional
                              </Badge>
                            )}

                            {/* Status Badge */}
                            {isVerified && (
                              <Badge className="text-[10px] py-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-medium gap-1">
                                <Check className="size-2.5" /> Verified
                              </Badge>
                            )}
                            {isPending && (
                              <Badge className="text-[10px] py-0 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-medium gap-1 animate-pulse">
                                <Clock className="size-2.5" /> Ready for Review
                              </Badge>
                            )}
                            {isRejected && (
                              <Badge className="text-[10px] py-0 bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 font-medium gap-1">
                                <AlertCircle className="size-2.5" /> Rejected
                              </Badge>
                            )}
                            {isNotSubmitted && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] py-0 text-muted-foreground font-normal"
                              >
                                Not Submitted
                              </Badge>
                            )}
                          </div>

                          {doc.description && (
                            <p className="text-xs text-muted-foreground">{doc.description}</p>
                          )}
                        </div>

                        {/* Document Actions */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          {/* View Document (15-minute signed URL) */}
                          {doc.signedUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="h-7 text-xs gap-1 px-2.5"
                            >
                              <a
                                href={doc.signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View uploaded document (opens secure signed URL)"
                              >
                                <Eye className="size-3 text-primary" /> View
                              </a>
                            </Button>
                          )}

                          {/* Recruiter Review Buttons (only when onboarding active) */}
                          {(onboarding.status === "NOT_STARTED" ||
                            onboarding.status === "IN_PROGRESS") && (
                            <>
                              {!isVerified && doc.storage_path && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() =>
                                    reviewDocMutation.mutate({
                                      documentId: doc.id,
                                      decision: "VERIFIED",
                                    })
                                  }
                                  disabled={reviewDocMutation.isPending}
                                  className="h-7 text-xs gap-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  title="Approve and verify document"
                                >
                                  <Check className="size-3" /> Verify
                                </Button>
                              )}

                              {doc.storage_path && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRejectingDoc(doc);
                                    setRejectionNotes("");
                                  }}
                                  disabled={reviewDocMutation.isPending}
                                  className="h-7 text-xs gap-1 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                  title="Reject document with feedback"
                                >
                                  <X className="size-3" /> Reject
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* File Metadata Pill */}
                      {doc.document_name && (
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground border-t border-border/40 pt-2">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <FileText className="size-3 text-primary" />
                            {doc.document_name}
                          </span>
                          {doc.file_size_bytes && (
                            <span>{formatFileSize(doc.file_size_bytes)}</span>
                          )}
                          {doc.uploaded_at && (
                            <span>
                              Uploaded {new Date(doc.uploaded_at).toLocaleDateString()} at{" "}
                              {new Date(doc.uploaded_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Rejection Notes Display */}
                      {isRejected && doc.review_notes && (
                        <div className="mt-2 rounded border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-800 dark:text-rose-200">
                          <strong>Rejection Reason:</strong> {doc.review_notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audit Events Timeline */}
          {events.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/60">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Onboarding Activity Timeline ({events.length})
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {events.map((ev) => {
                  const meta = EVENT_LABELS[ev.event_type] || {
                    label: ev.event_type,
                    icon: Clock,
                    color: "text-muted-foreground",
                  };
                  const Icon = meta.icon;

                  return (
                    <div
                      key={ev.id}
                      className="flex items-start gap-2 text-xs text-muted-foreground py-1 border-b border-border/30 last:border-0"
                    >
                      <Icon className={`size-3.5 mt-0.5 shrink-0 ${meta.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{meta.label}</p>
                        {ev.notes && (
                          <p className="text-[11px] text-muted-foreground truncate">{ev.notes}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(ev.created_at).toLocaleDateString()}{" "}
                        {new Date(ev.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rejection Modal Dialog */}
      <Dialog open={!!rejectingDoc} onOpenChange={(open) => !open && setRejectingDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-600">
              <AlertCircle className="size-5" /> Reject Document Requirement
            </DialogTitle>
            <DialogDescription className="text-xs">
              Provide feedback for the candidate explaining why{" "}
              <strong>{rejectingDoc?.title}</strong> was rejected. The candidate will see this
              feedback in their onboarding portal so they can upload a corrected copy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="rejectionNotesInput" className="text-xs font-medium">
              Review Notes / Reason for Rejection <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="rejectionNotesInput"
              rows={3}
              placeholder="e.g. Document image is blurry or expired. Please upload a clear copy of your valid passport."
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRejectingDoc(null)}
              disabled={reviewDocMutation.isPending}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!rejectingDoc) return;
                if (!rejectionNotes.trim()) {
                  toast.error("Rejection feedback is required.");
                  return;
                }
                reviewDocMutation.mutate({
                  documentId: rejectingDoc.id,
                  decision: "REJECTED",
                  notes: rejectionNotes.trim(),
                });
              }}
              disabled={reviewDocMutation.isPending || !rejectionNotes.trim()}
              className="text-xs gap-1.5"
            >
              {reviewDocMutation.isPending && <Loader2 className="size-3 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
