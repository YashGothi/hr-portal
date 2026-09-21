import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowRight, LayoutGrid, List, Users, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { PipelineBoard } from "@/components/PipelineBoard";
import { SELECTABLE_STAGES, STAGE_LABELS, scoreTone, type Stage } from "@/lib/hr";
import { useCandidates, useJobs, useMoveStage, type Candidate } from "@/lib/queries";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/ats/weights";
import { MAX_COMPARISON_CANDIDATES } from "@/lib/applications.functions";

export const Route = createFileRoute("/_authenticated/candidates/")({
  head: () => ({
    meta: [
      { title: "Candidate Pipeline | aiHIVE" },
      {
        name: "description",
        content:
          "Track every applicant through Application, Shortlisted, Interview and Hiring stages with AI match scores.",
      },
      { property: "og:title", content: "Candidate Pipeline | aiHIVE" },
      {
        property: "og:description",
        content: "Track applicants across hiring stages with AI match scores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CandidatesPage,
});

const TONE_CLASS = {
  success: "border-success/40 bg-success/15 text-success",
  warning: "border-warning/40 bg-warning/15 text-warning",
  destructive: "border-destructive/40 bg-destructive/15 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

function CandidatesPage() {
  const candidates = useCandidates();
  const jobs = useJobs();
  const moveStage = useMoveStage();
  const queryClient = useQueryClient();

  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  function toggleSelectCandidate(cand: Candidate) {
    if (selectedIds.includes(cand.id)) {
      setSelectedIds((prev) => prev.filter((id) => id !== cand.id));
      return;
    }

    if (selectedIds.length >= MAX_COMPARISON_CANDIDATES) {
      toast.error(`You can compare up to ${MAX_COMPARISON_CANDIDATES} candidates at a time.`);
      return;
    }

    if (selectedIds.length > 0) {
      const firstSelected = (candidates.data ?? []).find((c) => c.id === selectedIds[0]);
      if (firstSelected?.job_id && cand.job_id && firstSelected.job_id !== cand.job_id) {
        toast.error("Can only compare candidates who applied to the same job opening.");
        return;
      }
    }

    setSelectedIds((prev) => [...prev, cand.id]);
  }

  function clearSelection() {
    setSelectedIds([]);
  }
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    location: "",
    job_id: "",
    resume_text: "",
  });
  const [resumeFileName, setResumeFileName] = useState("");
  const [reading, setReading] = useState(false);

  async function handleResumeFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true);
    try {
      const { extractPdfText } = await import("@/lib/pdf");
      const text = await extractPdfText(file);
      if (!text.trim()) {
        toast.error("No text found in that PDF — it may be a scanned image.");
        setForm((prev) => ({ ...prev, resume_text: "" }));
        setResumeFileName("");
        return;
      }
      setForm((prev) => ({ ...prev, resume_text: text }));
      setResumeFileName(file.name);
    } catch {
      toast.error("Could not read that PDF. Please try another file.");
      setResumeFileName("");
    } finally {
      setReading(false);
    }
  }

  const createCandidate = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getUser();
      const job = (jobs.data ?? []).find((j) => j.id === form.job_id);
      const { error } = await supabase.from("candidates").insert({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        location: form.location || null,
        job_id: form.job_id || null,
        applied_role: job?.title ?? null,
        resume_text: form.resume_text || null,
        created_by: session.user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Candidate added to Application stage");
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "", location: "", job_id: "", resume_text: "" });
      setResumeFileName("");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const list = candidates.data ?? [];
    const term = search.trim().toLowerCase();
    return list.filter((c) => {
      const matchesStage = stageFilter === "all" || c.stage === stageFilter;
      const matchesJob = jobFilter === "all" || c.job_id === jobFilter;
      const matchesTerm =
        !term ||
        c.full_name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        (c.applied_role ?? "").toLowerCase().includes(term);
      return matchesStage && matchesJob && matchesTerm;
    });
  }, [candidates.data, stageFilter, jobFilter, search]);

  return (
    <AppShell
      title="Candidate pipeline"
      subtitle="Move candidates between stages and keep every AI match score in one view."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Add candidate</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add candidate</DialogTitle>
              <DialogDescription>
                Upload the resume PDF so the AI match score can be generated.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loc">Location</Label>
                  <Input
                    id="loc"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Applying for</Label>
                <Select
                  value={form.job_id}
                  onValueChange={(value) => setForm({ ...form, job_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an opening" />
                  </SelectTrigger>
                  <SelectContent>
                    {(jobs.data ?? []).map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resume">Resume (PDF)</Label>
                <Input
                  id="resume"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleResumeFile}
                  className="cursor-pointer file:mr-3 file:text-muted-foreground"
                />
                {reading ? (
                  <p className="text-xs text-muted-foreground">Reading the PDF…</p>
                ) : resumeFileName ? (
                  <p className="text-xs text-success">
                    {resumeFileName} — {form.resume_text.length.toLocaleString()} characters read
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Upload the candidate's resume as a PDF so the AI match score can be generated.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createCandidate.mutate()}
                disabled={!form.full_name.trim() || !form.email.trim() || createCandidate.isPending}
              >
                Add candidate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or role"
          className="max-w-xs"
        />
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as "all" | Stage)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {SELECTABLE_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jobFilter} onValueChange={setJobFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All job openings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All job openings</SelectItem>
            {(jobs.data ?? []).map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}
                {job.job_code ? ` · ${job.job_code}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-1">
          <Button
            size="sm"
            variant={view === "board" ? "default" : "ghost"}
            onClick={() => setView("board")}
            title="Kanban board view"
          >
            <LayoutGrid className="size-4" />
            <span className="ml-1.5 hidden sm:inline">Board</span>
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            onClick={() => setView("list")}
            title="List view"
          >
            <List className="size-4" />
            <span className="ml-1.5 hidden sm:inline">List</span>
          </Button>
        </div>
      </div>

      {candidates.isLoading ? (
        <p className="mt-5 panel p-6 text-sm text-muted-foreground">Loading candidates…</p>
      ) : view === "board" ? (
        <div className="mt-5">
          <PipelineBoard
            candidates={filtered}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectCandidate}
          />
        </div>
      ) : (
        <div className="mt-5 panel overflow-hidden">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No candidates match this view.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 w-10">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-5 py-3 label-caps">Candidate</th>
                    <th className="px-5 py-3 label-caps">Role</th>
                    <th className="px-5 py-3 label-caps">ATS</th>
                    <th className="px-5 py-3 label-caps">Application</th>
                    <th className="px-5 py-3 label-caps">Location</th>
                    <th className="px-5 py-3 label-caps">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((candidate) => (
                    <tr key={candidate.id} className="hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedIds.includes(candidate.id)}
                          onCheckedChange={() => toggleSelectCandidate(candidate)}
                          aria-label={`Select ${candidate.full_name}`}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          to="/candidates/$candidateId"
                          params={{ candidateId: candidate.id }}
                          className="font-medium hover:text-primary"
                        >
                          {candidate.full_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{candidate.email}</p>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {candidate.applied_role ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[scoreTone(candidate.ats_score)]}`}
                        >
                          {candidate.ats_score ?? "not scored"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="secondary">
                          {APPLICATION_STATUS_LABELS[
                            candidate.application_status as ApplicationStatus
                          ] ?? candidate.application_status}
                        </Badge>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {candidate.interview_at
                            ? new Date(candidate.interview_at).toLocaleString()
                            : "Interview: not scheduled"}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="outline">{candidate.location ?? "—"}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Select
                          value={candidate.stage}
                          onValueChange={(value) =>
                            moveStage.mutate(
                              { candidate, toStage: value as Stage },
                              {
                                onSuccess: () => {
                                  toast.success(`Moved to ${STAGE_LABELS[value as Stage]}`);
                                },
                                onError: (error) => toast.error(error.message),
                              },
                            )
                          }
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Floating Comparison Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-xl border border-primary/30 bg-background/95 p-3.5 shadow-2xl backdrop-blur-md">
          <div className="text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Users className="size-3.5 text-primary" />
              {selectedIds.length} candidate{selectedIds.length > 1 ? "s" : ""} selected
            </span>
            <span className="text-muted-foreground block text-[11px]">
              Same opening comparison (2–{MAX_COMPARISON_CANDIDATES} candidates)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={selectedIds.length < 2} asChild={selectedIds.length >= 2}>
              {selectedIds.length >= 2 ? (
                <Link to="/candidates/compare" search={{ ids: selectedIds.join(",") }}>
                  Compare Selected ({selectedIds.length})
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              ) : (
                <span>Compare Selected (Min 2)</span>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="size-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
