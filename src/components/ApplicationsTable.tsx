import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getResumeLink, rerunAts } from "@/lib/applications.functions";
import { APPLICATION_STATUS_LABELS, atsCategory, type ApplicationStatus } from "@/lib/ats/weights";
import type { Candidate } from "@/lib/queries";

const ATS_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

function scoreClasses(score: number | null) {
  if (score == null) return "border-border bg-muted text-muted-foreground";
  if (score >= 80) return "border-success/40 bg-success/15 text-success";
  if (score >= 60) return "border-primary/40 bg-primary/15 text-primary";
  if (score >= 40) return "border-warning/40 bg-warning/15 text-warning";
  return "border-destructive/40 bg-destructive/15 text-destructive";
}

/** Applications for one opening, with ATS status and HR actions. */
export function ApplicationsTable({ applications }: { applications: Candidate[] }) {
  const queryClient = useQueryClient();
  const runAts = useServerFn(rerunAts);
  const resumeLink = useServerFn(getResumeLink);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function openResume(candidateId: string) {
    try {
      const { url } = await resumeLink({ data: { candidateId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the resume.");
    }
  }

  async function reRun(candidateId: string) {
    setBusyId(candidateId);
    try {
      const result = await runAts({ data: { candidateId } });
      toast.success(`ATS re-run complete — ${result.score}/100 (${result.category})`);
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["ats-history", candidateId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ATS re-run failed.");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    } finally {
      setBusyId(null);
    }
  }

  if (applications.length === 0) {
    return (
      <p className="mt-5 text-sm text-muted-foreground">
        No applications for this opening yet. Share its application link on LinkedIn to start
        receiving them.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Candidate</th>
            <th className="py-2 pr-3 font-medium">Applied</th>
            <th className="py-2 pr-3 font-medium">Source</th>
            <th className="py-2 pr-3 font-medium">Experience</th>
            <th className="py-2 pr-3 font-medium">ATS</th>
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pr-3 font-medium">Application</th>
            <th className="py-2 pr-3 font-medium">ATS status</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((person) => (
            <tr key={person.id}>
              <td className="py-3 pr-3">
                <Link
                  to="/candidates/$candidateId"
                  params={{ candidateId: person.id }}
                  className="font-medium hover:text-primary"
                >
                  {person.full_name}
                </Link>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {person.application_code ?? "—"}
                </p>
              </td>
              <td className="py-3 pr-3 text-muted-foreground">
                {new Date(person.created_at).toLocaleDateString()}
              </td>
              <td className="py-3 pr-3 text-muted-foreground">{person.source}</td>
              <td className="py-3 pr-3 text-muted-foreground">
                {person.years_experience ?? person.total_experience_years ?? "—"} yrs
              </td>
              <td className="py-3 pr-3">
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${scoreClasses(person.ats_score)}`}
                >
                  {person.ats_score ?? "—"}
                </span>
              </td>
              <td className="py-3 pr-3 text-muted-foreground">
                {person.ats_category ?? atsCategory(person.ats_score) ?? "—"}
              </td>
              <td className="py-3 pr-3">
                <Badge variant="secondary">
                  {APPLICATION_STATUS_LABELS[person.application_status as ApplicationStatus] ??
                    person.application_status}
                </Badge>
              </td>
              <td className="py-3 pr-3 text-muted-foreground">
                {ATS_STATUS_LABEL[person.ats_status] ?? person.ats_status}
              </td>
              <td className="py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                    <Link to="/candidates/$candidateId" params={{ candidateId: person.id }}>
                      Details
                    </Link>
                  </Button>
                  {person.resume_path ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => void openResume(person.id)}
                    >
                      <FileText className="mr-1 size-3.5" /> Resume
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={busyId === person.id}
                    onClick={() => void reRun(person.id)}
                  >
                    <RefreshCw className="mr-1 size-3.5" />
                    {busyId === person.id ? "Running…" : "Re-run ATS"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
