import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SELECTABLE_STAGES, STAGE_LABELS, type Stage } from "@/lib/hr";

import {
  useAlerts,
  useCandidates,
  useDismissAlert,
  useJobs,
  useUpcomingInterviews,
} from "@/lib/queries";
import { ScheduleInterviewDialog } from "@/components/ScheduleInterviewDialog";
import { DashboardApplications } from "@/components/DashboardApplications";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Hiring Dashboard | aiHIVE" },
      {
        name: "description",
        content: "Track live pipeline counts, screening scores and candidate document checks.",
      },
      { property: "og:title", content: "Hiring Dashboard | aiHIVE" },
      { property: "og:description", content: "Live hiring metrics for your recruiting team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-5">
      <p className="label-caps">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Dashboard() {
  const candidates = useCandidates();
  const jobs = useJobs();
  const interviews = useUpcomingInterviews();
  const alerts = useAlerts();
  const dismissAlert = useDismissAlert();

  const docs = useQuery({
    queryKey: ["documents-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidate_documents").select("status");
      if (error) throw new Error(error.message);
      return (data ?? []) as { status: string }[];
    },
  });

  const list = candidates.data ?? [];
  const scored = list.filter((c) => typeof c.ats_score === "number");
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, c) => sum + (c.ats_score ?? 0), 0) / scored.length)
    : null;
  const docList = docs.data ?? [];
  const verified = docList.filter((d) => d.status === "verified").length;
  const openJobs = (jobs.data ?? []).filter((j) => j.status === "open").length;

  const STAGE_COLOR: Record<Stage, string> = {
    application: "var(--muted-foreground)",
    screening: "var(--primary)",
    shortlisted: "var(--success)",
    doc_verification: "var(--warning)",
    interview: "var(--chart-4)",
    offer: "var(--chart-2)",
    hired: "var(--success)",
    rejected: "var(--destructive)",
  };

  const stageCounts = SELECTABLE_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: list.filter((c) => c.stage === stage).length,
  }));

  return (
    <AppShell
      title="Hiring dashboard"
      subtitle="Pipeline health, screening scores and verification progress at a glance."
      actions={
        <div className="flex gap-2">
          <ScheduleInterviewDialog
            trigger={
              <Button size="sm" variant="outline">
                Schedule interview
              </Button>
            }
          />
          <Button asChild size="sm">
            <Link to="/candidates">Open pipeline</Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Candidates"
          value={String(list.length)}
          hint={`${openJobs} open opening${openJobs === 1 ? "" : "s"}`}
        />
        <Metric
          label="Avg ATS score"
          value={avgScore == null ? "—" : `${avgScore}`}
          hint={`${scored.length} of ${list.length} screened`}
        />
        <Metric
          label="In interview"
          value={String(list.filter((c) => c.stage === "interview").length)}
          hint="Currently interviewing"
        />
        <Metric
          label="Documents verified"
          value={docList.length ? `${verified}/${docList.length}` : "—"}
          hint="Across all candidates"
        />
      </div>

      <section className="panel mt-4 p-5">
        <h2 className="text-base font-semibold">Stage distribution</h2>
        <p className="mt-1 text-xs text-muted-foreground">Candidates per pipeline stage</p>
        <div className="mt-4 h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageCounts} margin={{ top: 24, right: 16, bottom: 4, left: -16 }}>
              <XAxis
                type="category"
                dataKey="label"
                interval={0}
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                type="number"
                allowDecimals={false}
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value: number) => [String(value), "Candidates"]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={44}>
                <LabelList dataKey="count" position="top" fontSize={11} fill="var(--foreground)" />
                {stageCounts.map((entry) => (
                  <Cell key={entry.stage} fill={STAGE_COLOR[entry.stage]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <DashboardApplications candidates={list} isLoading={candidates.isLoading} />

      {(alerts.data ?? []).length > 0 ? (
        <section className="panel mt-4 p-5">
          <h2 className="text-base font-semibold">Strong matches to review</h2>
          <ul className="mt-4 divide-y divide-border">
            {(alerts.data ?? []).map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  {alert.candidate_id ? (
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: alert.candidate_id }}
                      className="text-sm font-medium hover:text-primary"
                    >
                      {alert.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{alert.title}</span>
                  )}
                  {alert.body ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{alert.body}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismissAlert.mutate(alert.id)}
                  disabled={dismissAlert.isPending}
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Upcoming interviews</h2>
          <ScheduleInterviewDialog
            trigger={
              <Button size="sm" variant="outline">
                New interview
              </Button>
            }
          />
        </div>
        {interviews.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading interviews…</p>
        ) : (interviews.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No interviews scheduled yet. Pick a candidate and set a date and time.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(interviews.data ?? []).map((candidate) => (
              <li
                key={candidate.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <Link
                    to="/candidates/$candidateId"
                    params={{ candidateId: candidate.id }}
                    className="truncate text-sm font-medium hover:text-primary"
                  >
                    {candidate.full_name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {candidate.interview_at
                      ? new Date(candidate.interview_at).toLocaleString()
                      : "Date not set"}
                    {candidate.interviewer ? ` · with ${candidate.interviewer}` : ""}
                    {candidate.interview_location ? ` · ${candidate.interview_location}` : ""}
                  </p>
                </div>
                <Badge variant="outline">Scheduled</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
