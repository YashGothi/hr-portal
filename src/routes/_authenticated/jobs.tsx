import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Copy, Link2, Linkedin, Loader2, Pencil, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractLinkedInJobFn, saveJobOpeningFn } from "@/lib/linkedin-job.functions";
import { useCandidates, useJobs, type Job } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Job Openings | aiHIVE" },
      {
        name: "description",
        content:
          "Create job postings for LinkedIn, share a public application link and drive AI resume matching for every applicant.",
      },
      { property: "og:title", content: "Job Openings | aiHIVE" },
      {
        property: "og:description",
        content: "Manage openings, share the application link and power AI resume matching.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JobsPage,
});

const JOB_STATUSES = ["draft", "active", "closed"] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
};

const EMPTY_FORM = {
  job_code: "",
  title: "",
  department: "",
  location: "",
  employment_type: "Full-time",
  skills: "",
  preferred: "",
  min_experience_years: "",
  max_experience_years: "",
  education_requirement: "",
  application_deadline: "",
  status: "draft",
  description: "",
};

function applyUrl(code: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/apply/${code}`;
}

function applyPath(code: string) {
  return `/apply/${code}`;
}

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Could not copy — copy it manually from the card.");
  }
}

function JobsPage() {
  const jobs = useJobs();
  const candidates = useCandidates();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importTab, setImportTab] = useState<"url" | "text">("url");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const extractLinkedInJob = useMutation({
    mutationFn: async () => {
      const url = importTab === "url" ? importUrl.trim() : undefined;
      const text = importTab === "text" ? importText.trim() : undefined;

      if (!url && !text) {
        throw new Error("Please enter a LinkedIn job URL or paste the job description text.");
      }

      return await extractLinkedInJobFn({ data: { url, text } });
    },
    onSuccess: (extracted) => {
      setForm({
        job_code: extracted.job_code,
        title: extracted.title,
        department: extracted.department,
        location: extracted.location,
        employment_type: extracted.employment_type,
        skills: extracted.required_skills.join(", "),
        preferred: extracted.preferred_skills.join(", "),
        min_experience_years: extracted.min_experience_years?.toString() ?? "",
        max_experience_years: extracted.max_experience_years?.toString() ?? "",
        education_requirement: extracted.education_requirement,
        application_deadline: "",
        status: "draft",
        description: extracted.description,
      });

      setLinkedinOpen(false);
      setImportUrl("");
      setImportText("");
      setEditingId(null);
      setOpen(true);
      toast.success("LinkedIn job details extracted! Review and publish your opening.");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to extract job posting from LinkedIn.");
    },
  });

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function openEditor(job: Job) {
    setEditingId(job.id);
    setForm({
      job_code: job.job_code ?? "",
      title: job.title,
      department: job.department ?? "",
      location: job.location ?? "",
      employment_type: job.employment_type,
      skills: job.required_skills.join(", "),
      preferred: (job.preferred_skills ?? []).join(", "),
      min_experience_years: job.min_experience_years?.toString() ?? "",
      max_experience_years: job.max_experience_years?.toString() ?? "",
      education_requirement: job.education_requirement ?? "",
      application_deadline: job.application_deadline ?? "",
      status: job.status,
      description: job.description ?? "",
    });
    setOpen(true);
  }

  const saveJob = useMutation({
    mutationFn: async () => {
      const toList = (value: string) =>
        value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));

      const res = await saveJobOpeningFn({
        data: {
          id: editingId,
          job_code: form.job_code.trim().toUpperCase() || null,
          title: form.title.trim(),
          department: form.department || null,
          location: form.location || null,
          employment_type: form.employment_type,
          description: form.description || null,
          required_skills: toList(form.skills),
          preferred_skills: toList(form.preferred),
          min_experience_years: toNumber(form.min_experience_years),
          max_experience_years: toNumber(form.max_experience_years),
          education_requirement: form.education_requirement || null,
          application_deadline: form.application_deadline || null,
          status: form.status,
        },
      });

      return res.action;
    },
    onSuccess: (result) => {
      toast.success(result === "updated" ? "Opening updated" : "Opening created");
      setOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
      if (error) {
        if (
          error.message.includes("row-level security") ||
          error.message.includes("permission denied")
        ) {
          throw new Error("You do not have permission to update job openings.");
        }
        throw new Error("Unable to update job status. Please try again.");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (error) => toast.error(error.message),
  });

  const list = jobs.data ?? [];

  return (
    <AppShell
      title="Job openings"
      subtitle="Post a role, share its application link on LinkedIn and let the ATS score every applicant against it."
      actions={
        <div className="flex items-center gap-2">
          <Dialog open={linkedinOpen} onOpenChange={setLinkedinOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
              >
                <Linkedin className="size-4 text-primary" />
                Import from LinkedIn
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Linkedin className="size-5 text-primary" />
                  Import Job from LinkedIn
                </DialogTitle>
                <DialogDescription>
                  Extract job details directly from your LinkedIn job posting URL or copied text
                  into an opening.
                </DialogDescription>
              </DialogHeader>

              <Tabs
                value={importTab}
                onValueChange={(val) => setImportTab(val as "url" | "text")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="url">LinkedIn Job URL</TabsTrigger>
                  <TabsTrigger value="text">Paste Job Text</TabsTrigger>
                </TabsList>

                <TabsContent value="url" className="mt-4 space-y-3">
                  <Label htmlFor="linkedin-job-url">LinkedIn Job Post Link</Label>
                  <Input
                    id="linkedin-job-url"
                    placeholder="https://www.linkedin.com/jobs/view/1234567890"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the link to your LinkedIn job post to extract title, location, skills &
                    requirements.
                  </p>
                </TabsContent>

                <TabsContent value="text" className="mt-4 space-y-3">
                  <Label htmlFor="linkedin-job-text">Job Posting Description</Label>
                  <Textarea
                    id="linkedin-job-text"
                    rows={6}
                    placeholder="Paste the title, responsibilities, requirements, and skills from your LinkedIn post..."
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Copy and paste the text directly from your LinkedIn job details page.
                  </p>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setLinkedinOpen(false)}
                  disabled={extractLinkedInJob.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => extractLinkedInJob.mutate()}
                  disabled={
                    extractLinkedInJob.isPending ||
                    (importTab === "url" && !importUrl.trim()) ||
                    (importTab === "text" && !importText.trim())
                  }
                  className="gap-1.5"
                >
                  {extractLinkedInJob.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      Extract & Create Opening
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={resetForm}>
                New opening
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit job opening" : "New job opening"}</DialogTitle>
                <DialogDescription>
                  Requirements here drive the ATS match score for every applicant.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="job_code">Job ID</Label>
                    <Input
                      id="job_code"
                      value={form.job_code}
                      onChange={(e) => setForm({ ...form, job_code: e.target.value })}
                      placeholder="SEC-DEV-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(value) => setForm({ ...form, status: value })}
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABEL[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Senior Backend Engineer"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input
                      id="department"
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      placeholder="Engineering"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="Bengaluru / Remote"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employment_type">Employment type</Label>
                    <Input
                      id="employment_type"
                      value={form.employment_type}
                      onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Application deadline</Label>
                    <Input
                      id="deadline"
                      type="date"
                      value={form.application_deadline}
                      onChange={(e) => setForm({ ...form, application_deadline: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min_exp">Minimum experience (years)</Label>
                    <Input
                      id="min_exp"
                      type="number"
                      min={0}
                      step={0.5}
                      value={form.min_experience_years}
                      onChange={(e) => setForm({ ...form, min_experience_years: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_exp">Maximum experience (optional)</Label>
                    <Input
                      id="max_exp"
                      type="number"
                      min={0}
                      step={0.5}
                      value={form.max_experience_years}
                      onChange={(e) => setForm({ ...form, max_experience_years: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="skills">Required skills (comma separated)</Label>
                  <Input
                    id="skills"
                    value={form.skills}
                    onChange={(e) => setForm({ ...form, skills: e.target.value })}
                    placeholder="Node.js, PostgreSQL, AWS"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preferred">Preferred skills (comma separated)</Label>
                  <Input
                    id="preferred"
                    value={form.preferred}
                    onChange={(e) => setForm({ ...form, preferred: e.target.value })}
                    placeholder="Terraform, Kubernetes"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="education">Education requirement</Label>
                  <Input
                    id="education"
                    value={form.education_requirement}
                    onChange={(e) => setForm({ ...form, education_requirement: e.target.value })}
                    placeholder="Bachelor's in Computer Science or related field"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Job description</Label>
                  <Textarea
                    id="description"
                    rows={5}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Responsibilities, experience level, must-haves…"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => saveJob.mutate()}
                  disabled={!form.title.trim() || saveJob.isPending}
                >
                  {saveJob.isPending ? "Saving…" : editingId ? "Save changes" : "Create opening"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      {jobs.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading openings…</p>
      ) : list.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No openings yet. Create one so applicants can be scored against it.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((job) => {
            const applicants = (candidates.data ?? []).filter((c) => c.job_id === job.id).length;
            const url = job.job_code ? applyUrl(job.job_code) : null;
            const path = job.job_code ? applyPath(job.job_code) : null;
            return (
              <article key={job.id} className="panel flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase text-muted-foreground">
                      {job.job_code ?? "No job ID"}
                    </p>
                    <h2 className="text-base font-semibold">{job.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {[job.department, job.location, job.employment_type]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label={`Edit ${job.title}`}
                      title="Edit opening"
                      onClick={() => openEditor(job)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Badge variant={job.status === "active" ? "default" : "secondary"}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </Badge>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {job.min_experience_years != null
                    ? `${job.min_experience_years}${job.max_experience_years ? `–${job.max_experience_years}` : "+"} years experience`
                    : "Experience not specified"}
                  {job.application_deadline
                    ? ` · closes ${new Date(job.application_deadline).toLocaleDateString()}`
                    : ""}
                </p>

                {job.required_skills.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {job.required_skills.slice(0, 6).map((skill) => (
                      <Badge key={skill} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {job.description ? (
                  <div className="mt-3">
                    <p
                      className={`whitespace-pre-line text-sm text-muted-foreground ${expanded === job.id ? "" : "line-clamp-3"}`}
                    >
                      {job.description}
                    </p>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                      className="mt-1 h-auto px-0 py-0 text-xs"
                    >
                      {expanded === job.id ? "Show less" : "Read more"}
                    </Button>
                  </div>
                ) : null}

                {job.status === "active" && url && path ? (
                  <div className="mt-4 space-y-2 rounded-lg border border-border bg-secondary/50 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Link2 className="size-3.5" /> Public application link
                    </p>
                    <p className="break-all font-mono text-[11px]">{path}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copy(url, "Application link copied")}
                      >
                        <Copy className="mr-1.5 size-3.5" /> Copy link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copy(
                            `Interested candidates can apply directly through our application portal: ${url}`,
                            "LinkedIn call-to-action copied",
                          )
                        }
                      >
                        <Copy className="mr-1.5 size-3.5" /> Copy LinkedIn post text
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-xs text-muted-foreground">{applicants} applications</span>
                  <Select
                    value={job.status}
                    onValueChange={(status) => setStatus.mutate({ id: job.id, status })}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
