import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getResumeLink, rerunAts } from "@/lib/applications.functions";
import { AtsAnalysis } from "@/components/AtsAnalysis";
import { AppShell } from "@/components/AppShell";
import { CandidateTimeline } from "@/components/CandidateTimeline";
import { CandidateScheduling } from "@/components/CandidateScheduling";
import { CandidateOffer } from "@/components/CandidateOffer";
import { CandidateOnboarding } from "@/components/CandidateOnboarding";
import { showUndoToast } from "@/components/UndoToast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOC_TYPES, SELECTABLE_STAGES, STAGE_LABELS, type Stage } from "@/lib/hr";
import {
  useCandidate,
  useCandidateDocuments,
  useJobs,
  useMoveStage,
  useSetOutcome,
  useStageHistory,
} from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/candidates/$candidateId")({
  head: () => ({
    meta: [
      { title: "Candidate Profile | aiHIVE" },
      {
        name: "description",
        content:
          "Review a candidate's AI ATS score, resume, stage history and document verification status.",
      },
      { property: "og:title", content: "Candidate Profile | aiHIVE" },
      {
        property: "og:description",
        content: "AI ATS score, stage history and document verification for one candidate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CandidateDetail,
});

const DOC_BADGE = {
  verified: "border-success/40 bg-success/15 text-success",
  rejected: "border-destructive/40 bg-destructive/15 text-destructive",
  pending: "border-warning/40 bg-warning/15 text-warning",
} as const;

function CandidateDetail() {
  const { candidateId } = useParams({ from: "/_authenticated/candidates/$candidateId" });
  const candidate = useCandidate(candidateId);
  const documents = useCandidateDocuments(candidateId);
  const history = useStageHistory(candidateId);
  const jobs = useJobs();
  const moveStage = useMoveStage();
  const setOutcome = useSetOutcome();
  const queryClient = useQueryClient();
  const runScore = useServerFn(rerunAts);
  const resumeLink = useServerFn(getResumeLink);

  const [resume, setResume] = useState("");
  const [notes, setNotes] = useState("");
  const [docType, setDocType] = useState<string>(DOC_TYPES[0]);
  const [docUrl, setDocUrl] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  useEffect(() => {
    if (candidate.data) {
      setResume(candidate.data.resume_text ?? "");
      setNotes(candidate.data.notes ?? "");
      setOutcomeNotes(candidate.data.outcome_notes ?? "");
    }
  }, [candidate.data]);

  const saveDetails = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("candidates")
        .update({ resume_text: resume, notes })
        .eq("id", candidateId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (error) => toast.error(error.message),
  });

  /** Links the candidate to a job opening and keeps their role label in sync. */
  const linkOpening = useMutation({
    mutationFn: async (jobId: string) => {
      const job = (jobs.data ?? []).find((j) => j.id === jobId);
      const { error } = await supabase
        .from("candidates")
        .update({
          job_id: jobId || null,
          applied_role: job?.title ?? null,
        })
        .eq("id", candidateId);
      if (error) throw new Error(error.message);
      return job?.title ?? null;
    },
    onSuccess: (title) => {
      toast.success(title ? `Linked to ${title}` : "Opening removed");
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const scoreNow = useMutation({
    mutationFn: async () => runScore({ data: { candidateId } }),
    onSuccess: (result) => {
      toast.success(`ATS match score: ${result.score}/100 (${result.category})`);
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["ats-history", candidateId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Screening failed"),
  });

  /** Only http(s) links may be saved or rendered — blocks javascript:/data: URIs. */
  function isSafeHttpUrl(value: string): boolean {
    return /^https?:\/\/\S+$/i.test(value);
  }

  async function decide(outcome: "hired" | "rejected") {
    if (!candidate.data) return;
    try {
      await setOutcome.mutateAsync({
        candidate: candidate.data,
        outcome,
        notes: outcomeNotes.trim(),
      });
      toast.success(outcome === "hired" ? "Marked as hired." : "Marked as not selected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the outcome.");
    }
  }

  const addDocument = useMutation({
    mutationFn: async () => {
      const trimmedUrl = docUrl.trim();
      if (trimmedUrl && !isSafeHttpUrl(trimmedUrl)) {
        throw new Error("Document links must start with https:// or http://");
      }
      const { error } = await supabase.from("candidate_documents").insert({
        candidate_id: candidateId,
        doc_type: docType,
        file_url: trimmedUrl || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setDocUrl("");
      queryClient.invalidateQueries({ queryKey: ["documents", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["documents-summary"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const setDocStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: session } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("candidate_documents")
        .update({
          status,
          verified_by: session.user?.id ?? null,
          verified_at: status === "pending" ? null : new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["documents-summary"] });
    },
    onError: (error) => toast.error(error.message),
  });

  if (candidate.isLoading) {
    return (
      <AppShell title="Candidate">
        <p className="text-sm text-muted-foreground">Loading candidate…</p>
      </AppShell>
    );
  }

  const person = candidate.data;
  if (!person) {
    return (
      <AppShell title="Candidate not found">
        <Button asChild variant="secondary">
          <Link to="/candidates">Back to pipeline</Link>
        </Button>
      </AppShell>
    );
  }

  const docList = documents.data ?? [];
  const verifiedCount = docList.filter((d) => d.status === "verified").length;

  return (
    <AppShell
      title={person.full_name}
      subtitle={`${person.applied_role ?? "Role not set"} · ${person.email}`}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/candidates">
              <ArrowLeft className="size-4" /> Pipeline
            </Link>
          </Button>
          <Select
            value={person.job_id ?? "none"}
            onValueChange={(value) => linkOpening.mutate(value === "none" ? "" : value)}
          >
            <SelectTrigger className="w-52" aria-label="Job opening">
              <SelectValue placeholder="Link to opening" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No opening linked</SelectItem>
              {(jobs.data ?? []).map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={person.stage}
            onValueChange={(value) => {
              const fromStage = person.stage;
              const toStage = value as Stage;
              if (fromStage === toStage) return;
              moveStage.mutate(
                { candidate: person, toStage },
                {
                  onSuccess: () => {
                    showUndoToast({
                      message: `${person.full_name} moved to ${STAGE_LABELS[toStage]}`,
                      onUndo: async () => {
                        try {
                          await moveStage.mutateAsync({
                            candidate: person,
                            toStage: fromStage,
                            expectedCurrentStage: toStage,
                          });
                          toast.success(
                            `${person.full_name} reverted to ${STAGE_LABELS[fromStage]}`,
                          );
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "Failed to revert candidate stage",
                          );
                        }
                      },
                    });
                  },
                  onError: (error) => toast.error(error.message),
                },
              );
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECTABLE_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <AtsAnalysis
            person={person}
            job={(jobs.data ?? []).find((job) => job.id === person.job_id)}
            onRerunAts={() => scoreNow.mutate()}
            isRerunning={scoreNow.isPending}
            onViewResume={
              person.resume_path
                ? async () => {
                    try {
                      const { url } = await resumeLink({ data: { candidateId } });
                      window.open(url, "_blank", "noopener,noreferrer");
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Could not open the resume.",
                      );
                    }
                  }
                : undefined
            }
          />
        </div>

        <section className="panel p-5 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="label-caps">Interview outcome</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {person.outcome === "hired"
                  ? `Hired${person.outcome_at ? ` on ${new Date(person.outcome_at).toLocaleDateString()}` : ""}`
                  : person.outcome === "rejected"
                    ? `Not selected${person.outcome_at ? ` on ${new Date(person.outcome_at).toLocaleDateString()}` : ""}`
                    : "No decision recorded yet."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={setOutcome.isPending}
                onClick={() => decide("hired")}
                variant={person.outcome === "hired" ? "default" : "outline"}
              >
                Mark hired
              </Button>
              <Button
                size="sm"
                variant={person.outcome === "rejected" ? "destructive" : "outline"}
                disabled={setOutcome.isPending}
                onClick={() => decide("rejected")}
              >
                Mark rejected
              </Button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="outcome-notes">Decision notes</Label>
            <Textarea
              id="outcome-notes"
              rows={2}
              placeholder="Interview feedback, offer details or reason for rejection…"
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
            />
            {person.outcome_notes ? (
              <p className="text-xs text-muted-foreground">Saved: {person.outcome_notes}</p>
            ) : null}
          </div>
        </section>

        <section className="panel p-5">
          <p className="label-caps">Candidate</p>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Stage</dt>
              <dd>
                <Badge variant="outline">{STAGE_LABELS[person.stage]}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{person.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Location</dt>
              <dd>{person.location ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Documents verified</dt>
              <dd>
                {verifiedCount}/{docList.length || 0}
              </dd>
            </div>
          </dl>

          <p className="label-caps mt-6">Timeline</p>
          <CandidateTimeline candidate={person} history={history.data ?? []} />
        </section>

        <div className="lg:col-span-2 space-y-5">
          <CandidateScheduling
            candidateId={person.id}
            candidateName={person.full_name}
            role={person.applied_role}
            atsScore={person.ats_score}
            applicationStatus={person.application_status}
            stage={person.stage}
          />

          <CandidateOffer
            candidateId={person.id}
            candidateName={person.full_name}
            candidateEmail={person.email}
            jobTitle={person.applied_role}
            jobId={person.job_id}
          />

          <CandidateOnboarding
            candidateId={person.id}
            candidateName={person.full_name}
            isHired={person.application_status === "hired"}
            jobId={person.job_id}
          />
        </div>

        <section className="panel p-5 lg:col-span-2">
          <p className="label-caps">Document verification</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docUrl">Link (optional)</Label>
              <Input
                id="docUrl"
                className="w-64"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => addDocument.mutate()}
              disabled={addDocument.isPending}
            >
              Add document
            </Button>
          </div>

          <ul className="mt-4 divide-y divide-border">
            {docList.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">
                No documents tracked for this candidate yet.
              </li>
            ) : (
              docList.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{doc.doc_type}</p>
                    {doc.file_url && isSafeHttpUrl(doc.file_url) ? (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Open document
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">No link attached</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${DOC_BADGE[doc.status as keyof typeof DOC_BADGE] ?? DOC_BADGE.pending}`}
                    >
                      {doc.status}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDocStatus.mutate({ id: doc.id, status: "verified" })}
                    >
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDocStatus.mutate({ id: doc.id, status: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="panel p-5">
          <p className="label-caps">Resume & notes</p>
          <div className="mt-3 space-y-3">
            <Textarea
              rows={8}
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Paste resume text…"
            />
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Interview notes, feedback…"
            />
            <Button onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending}>
              Save
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
