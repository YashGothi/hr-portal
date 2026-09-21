import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Linkedin, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ApplicationsTable } from "@/components/ApplicationsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { scoreCandidate } from "@/lib/ats.functions";
import { AUTO_SHORTLIST_SCORE, rowFromResumeText, type ImportRow } from "@/lib/linkedin-import";
import { extractPdfText } from "@/lib/pdf";
import { useCandidates, useJobs } from "@/lib/queries";
import { scoreTone } from "@/lib/hr";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
  head: () => ({
    meta: [
      { title: "LinkedIn applicant import | aiHIVE" },
      {
        name: "description",
        content:
          "Import a LinkedIn applicant export, score every applicant with AI and auto-shortlist the strongest matches.",
      },
      { property: "og:title", content: "LinkedIn applicant import | aiHIVE" },
      {
        property: "og:description",
        content:
          "Bring LinkedIn applicants into your pipeline and shortlist the best automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type ResultRow = {
  name: string;
  score: number | null;
  shortlisted: boolean;
  error?: string;
  id?: string;
};

function ImportPage() {
  const { data: jobs = [] } = useJobs();
  const candidates = useCandidates();
  const queryClient = useQueryClient();
  const runScore = useServerFn(scoreCandidate);

  const [jobId, setJobId] = useState<string>("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [fileName, setFileName] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<ResultRow[]>([]);
  const selectedJob = jobs.find((job) => job.id === jobId);
  const openingApplicants = (candidates.data ?? [])
    .filter((candidate) => candidate.job_id === jobId)
    .sort((a, b) => (b.ats_score ?? -1) - (a.ats_score ?? -1));

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const parsedRows: ImportRow[] = [];
    let failed = 0;

    for (const file of Array.from(files)) {
      try {
        const text = await extractPdfText(file);
        if (!text || text.trim().length < 40) {
          failed += 1;
          continue;
        }
        parsedRows.push(rowFromResumeText(text, file.name));
      } catch {
        failed += 1;
      }
    }

    setRows(parsedRows);
    setSkipped(failed);
    setFileName(files.length === 1 ? files[0]!.name : `${files.length} resume PDFs`);
    setResults([]);
    setDone(0);
    if (parsedRows.length === 0) {
      toast.error(
        "Couldn't read any text from those PDFs. Scanned image resumes aren't supported.",
      );
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setRunning(true);
    setResults([]);
    setDone(0);
    const collected: ResultRow[] = [];
    let shortlisted = 0;

    for (const row of rows) {
      const entry: ResultRow = { name: row.full_name, score: null, shortlisted: false };
      try {
        const { data: inserted, error } = await supabase
          .from("candidates")
          .insert({
            job_id: jobId || null,
            full_name: row.full_name,
            email: row.email,
            phone: row.phone,
            location: row.location,
            applied_role: jobs.find((job) => job.id === jobId)?.title ?? row.applied_role ?? null,
            linkedin_url: row.linkedin_url,
            resume_text: row.resume_text,
            source: "linkedin",
            stage: "application",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        entry.id = inserted!.id as string;

        if (!row.resume_text || row.resume_text.trim().length < 40) {
          entry.error = "Not enough resume detail to score";
        } else {
          const result = await runScore({ data: { candidateId: entry.id } });
          entry.score = result.score;

          if (result.score > AUTO_SHORTLIST_SCORE) {
            await supabase
              .from("candidates")
              .update({ stage: "shortlisted", auto_shortlisted: true })
              .eq("id", entry.id);
            const { data: userData } = await supabase.auth.getUser();
            await supabase.from("stage_history").insert({
              candidate_id: entry.id,
              from_stage: "application",
              to_stage: "shortlisted",
              changed_by: userData.user?.id ?? null,
            });
            await supabase.from("alerts").insert({
              candidate_id: entry.id,
              title: `${row.full_name} auto-shortlisted (${result.score}/100)`,
              body: result.summary,
            });
            entry.shortlisted = true;
            shortlisted += 1;
          }
        }
      } catch (error) {
        entry.error = error instanceof Error ? error.message : "Import failed";
      }
      collected.push(entry);
      setResults([...collected]);
      setDone(collected.length);
    }

    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    queryClient.invalidateQueries({ queryKey: ["alerts"] });
    toast.success(
      `Imported ${collected.length} applicant${collected.length === 1 ? "" : "s"} · ${shortlisted} auto-shortlisted`,
    );
  }

  return (
    <AppShell
      title="LinkedIn applicants"
      subtitle={`Upload LinkedIn applicant resumes as PDFs — anyone scoring above ${AUTO_SHORTLIST_SCORE} is shortlisted for you automatically.`}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="panel space-y-5 p-5">
          <div className="flex items-center gap-2">
            <Linkedin className="size-4 text-primary" />
            <h2 className="label-caps">Upload resumes</h2>
          </div>

          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. In LinkedIn, open your job post and its applicant list.</li>
            <li>2. Download each applicant's resume as a PDF.</li>
            <li>3. Drop the PDFs below and pick the opening they belong to.</li>
          </ol>

          <div className="space-y-2">
            <Label htmlFor="linkedin-file">Applicant resumes (PDF)</Label>
            <Input
              id="linkedin-file"
              type="file"
              multiple
              accept="application/pdf,.pdf"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            {fileName ? (
              <p className="text-xs text-muted-foreground">
                {fileName} · {rows.length} applicant{rows.length === 1 ? "" : "s"} read
                {skipped > 0 ? ` · ${skipped} file(s) skipped (no readable text)` : ""}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Opening</Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger>
                <SelectValue placeholder="Match against an opening" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The opening's required skills are what each applicant is scored against.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={rows.length === 0 || running}
            onClick={() => void handleImport()}
          >
            <Upload className="size-4" />
            {running ? `Screening ${done}/${rows.length}…` : "Import and screen"}
          </Button>

          {running || done > 0 ? (
            <Progress value={rows.length ? (done / rows.length) * 100 : 0} />
          ) : null}
        </section>

        <section className="panel space-y-4 p-5">
          <h2 className="label-caps">Screening results</h2>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Results appear here as each applicant is scored.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((result, index) => (
                <li key={`${result.name}-${index}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    {result.id ? (
                      <Link
                        to="/candidates/$candidateId"
                        params={{ candidateId: result.id }}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {result.name}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-medium">{result.name}</span>
                    )}
                    {result.error ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{result.error}</p>
                    ) : null}
                  </div>
                  {result.score !== null ? (
                    <span className={`text-sm font-semibold ${scoreTone(result.score)}`}>
                      {result.score}
                    </span>
                  ) : null}
                  {result.shortlisted ? <Badge>Shortlisted</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5 lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="label-caps">Applicants for this opening</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedJob ? selectedJob.title : "Select an opening to view its applicants"}
              </p>
            </div>
            {selectedJob ? (
              <Badge variant="outline">
                {openingApplicants.length} applicant{openingApplicants.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>

          {!jobId ? (
            <p className="mt-5 text-sm text-muted-foreground">
              Choose an opening above to see every application, its ATS score and analysis.
            </p>
          ) : candidates.isLoading ? (
            <p className="mt-5 text-sm text-muted-foreground">Loading applications…</p>
          ) : (
            <ApplicationsTable applications={openingApplicants} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
