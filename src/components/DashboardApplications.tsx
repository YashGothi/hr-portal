import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureSchedulingInvite } from "@/lib/scheduling.functions";
import { STAGE_LABELS, scoreTone } from "@/lib/hr";
import type { Candidate } from "@/lib/queries";

const TONE_CLASS = {
  success: "border-success/40 bg-success/15 text-success",
  warning: "border-warning/40 bg-warning/15 text-warning",
  destructive: "border-destructive/40 bg-destructive/15 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

/** All applications with their ATS score and a one-click scheduling invite. */
export function DashboardApplications({
  candidates,
  isLoading,
}: {
  candidates: Candidate[];
  isLoading: boolean;
}) {
  const createInvite = useServerFn(ensureSchedulingInvite);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term
      ? candidates.filter((c) =>
          [c.full_name, c.email, c.applied_role, c.application_code]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        )
      : candidates;
    return [...list].sort((a, b) => (b.ats_score ?? -1) - (a.ats_score ?? -1));
  }, [candidates, query]);

  async function invite(candidateId: string, type: "SCREENING" | "INTERVIEW") {
    setBusyId(candidateId + type);
    try {
      const { token } = await createInvite({
        data: { candidateId, appointmentType: type },
      });
      const url = `${window.location.origin}/schedule/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(
          `${type === "SCREENING" ? "Screening" : "Interview"} booking link copied — send it to the candidate.`,
        );
      } catch {
        toast.success(`Booking link ready: ${url}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the booking link.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Applications &amp; ATS scores</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every applicant, highest match first. Invite sends them a self-booking link.
          </p>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email or role"
          className="h-9 w-full sm:w-64"
        />
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading applications…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No applications match this search yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Candidate</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Applied</th>
                <th className="py-2 pr-3 font-medium">ATS</th>
                <th className="py-2 pr-3 font-medium">Stage</th>
                <th className="py-2 font-medium">Invite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((person) => (
                <tr key={person.id}>
                  <td className="py-3 pr-3">
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: person.id }}
                      className="font-medium hover:text-primary"
                    >
                      {person.full_name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">{person.applied_role ?? "—"}</td>
                  <td className="py-3 pr-3 text-muted-foreground">
                    {new Date(person.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[scoreTone(person.ats_score)]}`}
                    >
                      {person.ats_score ?? "—"}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <Badge variant="outline">{STAGE_LABELS[person.stage]}</Badge>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={busyId === person.id + "SCREENING"}
                        onClick={() => void invite(person.id, "SCREENING")}
                      >
                        <Copy className="mr-1 size-3.5" />
                        {busyId === person.id + "SCREENING" ? "Working…" : "Screening"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        disabled={busyId === person.id + "INTERVIEW"}
                        onClick={() => void invite(person.id, "INTERVIEW")}
                      >
                        <CalendarPlus className="mr-1 size-3.5" />
                        {busyId === person.id + "INTERVIEW" ? "Working…" : "Interview"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
