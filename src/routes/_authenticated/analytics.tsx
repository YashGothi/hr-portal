import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useJobs } from "@/lib/queries";
import { getAnalyticsDashboard } from "@/lib/analytics.functions";
import type { DateRangePreset } from "@/lib/analytics/analytics.server";
import { downloadCsv } from "@/lib/analytics/export-csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import {
  Calendar,
  Briefcase,
  Download,
  Users,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  FileText,
  UserCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Recruitment Analytics & Reporting | aiHIVE" },
      {
        name: "description",
        content:
          "Comprehensive hiring metrics, ATS screening distribution, and recruitment funnel reports.",
      },
    ],
  }),
  component: AnalyticsPage,
});

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  badgeText,
  badgeVariant = "secondary",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badgeText?: string;
  badgeVariant?: "secondary" | "outline" | "default";
}) {
  return (
    <div className="panel p-5 relative overflow-hidden transition-all duration-200 hover:border-primary/40">
      <div className="flex items-center justify-between">
        <p className="label-caps">{label}</p>
        {Icon ? <Icon className="size-4 text-muted-foreground/70" /> : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="font-display text-3xl font-semibold text-foreground tracking-tight">
          {value}
        </p>
        {badgeText ? (
          <Badge variant={badgeVariant} className="text-[0.6875rem] px-1.5 py-0">
            {badgeText}
          </Badge>
        ) : null}
      </div>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AnalyticsPage() {
  const [selectedJobId, setSelectedJobId] = useState<string>("ALL");
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [activeTab, setActiveTab] = useState<
    "performance" | "ats" | "pipeline" | "funnel" | "interviews" | "offers" | "onboarding"
  >("performance");

  const jobsQuery = useJobs();
  const jobs = jobsQuery.data ?? [];

  const queryParams = useMemo(() => {
    return {
      data: {
        jobId: selectedJobId === "ALL" ? null : selectedJobId,
        preset,
        from: preset === "custom" && customFrom ? customFrom : null,
        to: preset === "custom" && customTo ? customTo : null,
      },
    };
  }, [selectedJobId, preset, customFrom, customTo]);

  const analyticsQuery = useQuery({
    queryKey: ["analytics-dashboard", queryParams],
    queryFn: async () => {
      const data = await getAnalyticsDashboard(queryParams);
      return data;
    },
    staleTime: 30_000,
  });

  const data = analyticsQuery.data;
  const isLoading = analyticsQuery.isLoading;
  const isError = analyticsQuery.isError;

  // CSV Export Handlers
  function handleExportJobPerformance() {
    if (!data?.jobPerformance) return;
    const headers = [
      "Job Title",
      "Department",
      "Status",
      "Applications",
      "Shortlisted",
      "Interviews",
      "Offers",
      "Hired",
      "Onboarding",
    ];
    const rows = data.jobPerformance.map((j) => [
      j.jobTitle,
      j.department,
      j.status,
      j.applications,
      j.shortlisted,
      j.interviews,
      j.offers,
      j.hired,
      j.onboarding,
    ]);
    downloadCsv(`job_performance_${preset}`, headers, rows);
  }

  function handleExportAtsSummary() {
    if (!data?.atsOverview) return;
    const headers = ["Category", "Range", "Candidate Count", "Threshold"];
    const rows = [
      ["Strong Match", "85 - 100", data.atsOverview.categories.strong, "Meets Shortlist (>=85)"],
      ["Good Match", "70 - 84", data.atsOverview.categories.good, "Review Recommended"],
      ["Partial Match", "50 - 69", data.atsOverview.categories.partial, "Below Threshold"],
      ["Low Match", "0 - 49", data.atsOverview.categories.low, "Below Threshold"],
      ["Unscored", "N/A", data.atsOverview.categories.unscored, "Pending Screening"],
    ];
    downloadCsv(`ats_summary_${preset}`, headers, rows);
  }

  function handleExportPipelineSummary() {
    if (!data?.candidatePipeline) return;
    const headers = ["Stage Code", "Stage Label", "Candidate Count", "Percentage"];
    const rows = data.candidatePipeline.map((p) => [p.stage, p.label, p.count, `${p.percentage}%`]);
    downloadCsv(`pipeline_stages_${preset}`, headers, rows);
  }

  function handleExportFunnel() {
    if (!data?.funnel) return;
    const headers = ["Funnel Step", "Description", "Candidates Count", "Conversion From Prior"];
    const rows = data.funnel.map((f) => [
      f.step,
      f.description,
      f.count,
      f.conversionFromPrevious !== null ? `${f.conversionFromPrevious}%` : "100% (Baseline)",
    ]);
    downloadCsv(`recruitment_funnel_${preset}`, headers, rows);
  }

  function handleExportInterviewSummary() {
    if (!data?.interviewAnalytics) return;
    const headers = ["Metric / Appointment Type", "Count"];
    const rows: (string | number)[][] = [
      ["Total Interviews in Period", data.interviewAnalytics.totalInPeriod],
      ["Completed", data.interviewAnalytics.completed],
      ["Scheduled / Confirmed", data.interviewAnalytics.scheduledOrConfirmed],
      ["Upcoming", data.interviewAnalytics.upcoming],
      ["Cancelled", data.interviewAnalytics.cancelled],
      ["Rescheduled", data.interviewAnalytics.rescheduled],
    ];
    data.interviewAnalytics.byType.forEach((t) => {
      rows.push([`Type: ${t.title} (${t.code})`, t.count]);
    });
    downloadCsv(`interviews_summary_${preset}`, headers, rows);
  }

  function handleExportOffersSummary() {
    if (!data?.offerAnalytics) return;
    const headers = ["Status", "Offer Count", "Rate"];
    const rows = [
      ["Draft", data.offerAnalytics.draft, "-"],
      ["Sent (Awaiting Decision)", data.offerAnalytics.sent, "-"],
      [
        "Accepted",
        data.offerAnalytics.accepted,
        data.offerAnalytics.acceptanceRate !== null
          ? `${data.offerAnalytics.acceptanceRate}% acceptance`
          : "-",
      ],
      ["Declined", data.offerAnalytics.declined, "-"],
      ["Expired", data.offerAnalytics.expired, "-"],
      ["Revoked", data.offerAnalytics.revoked, "-"],
      ["Total Created", data.offerAnalytics.totalInPeriod, "-"],
    ];
    downloadCsv(`offers_summary_${preset}`, headers, rows);
  }

  function handleExportOnboardingSummary() {
    if (!data?.onboardingAnalytics) return;
    const headers = ["Lifecycle / Compliance Requirement", "Count"];
    const rows = [
      ["Onboarding: Not Started", data.onboardingAnalytics.notStarted],
      ["Onboarding: In Progress", data.onboardingAnalytics.inProgress],
      ["Onboarding: Completed", data.onboardingAnalytics.completed],
      ["Onboarding: Cancelled", data.onboardingAnalytics.cancelled],
      ["Total Documents Tracked", data.onboardingAnalytics.documents.total],
      ["Documents Verified", data.onboardingAnalytics.documents.verified],
      ["Documents Pending Review", data.onboardingAnalytics.documents.pendingReview],
      ["Documents Rejected", data.onboardingAnalytics.documents.rejected],
      ["Required Documents Pending", data.onboardingAnalytics.documents.requiredPending],
      ["Required Documents Verified", data.onboardingAnalytics.documents.requiredVerified],
    ];
    downloadCsv(`onboarding_summary_${preset}`, headers, rows);
  }

  // Chart data formatting
  const atsChartData =
    data?.atsOverview.scoreDistribution.map((b) => ({
      range: b.range,
      count: b.count,
    })) ?? [];

  const pipelineChartData =
    data?.candidatePipeline.map((p) => ({
      name: p.label,
      count: p.count,
    })) ?? [];

  return (
    <AppShell
      title="Recruitment Analytics"
      subtitle="Factual recruitment metrics, ATS screening efficiency, and candidate funnel progression"
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Job Filter */}
          <div className="flex items-center gap-1.5">
            <Briefcase className="size-3.5 text-muted-foreground" />
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger className="h-8.5 w-44 text-xs">
                <SelectValue placeholder="All Openings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Openings</SelectItem>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title} {j.department ? `(${j.department})` : ""} [{j.status.toUpperCase()}]
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3.5 text-muted-foreground" />
            <Select value={preset} onValueChange={(val) => setPreset(val as DateRangePreset)}>
              <SelectTrigger className="h-8.5 w-36 text-xs">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8.5 px-2.5 text-xs"
            onClick={() => analyticsQuery.refetch()}
            disabled={isLoading}
            title="Refresh Analytics"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-12">
        {/* Custom Date Picker Inputs if preset is custom */}
        {preset === "custom" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-xs">
            <span className="text-xs font-medium text-foreground">Custom Date Bounds:</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">From:</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">To:</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              onClick={() => analyticsQuery.refetch()}
            >
              Apply Bounds
            </Button>
          </div>
        ) : null}

        {/* Filter Summary Banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Scope:</span>
            <Badge variant="outline" className="text-[0.6875rem] font-medium">
              {data?.appliedFilter.jobTitle
                ? `Job: ${data.appliedFilter.jobTitle}`
                : "All Openings"}
            </Badge>
            <Badge variant="outline" className="text-[0.6875rem] font-medium capitalize">
              Range:{" "}
              {preset === "custom"
                ? `${customFrom || "start"} to ${customTo || "now"}`
                : preset === "all_time" || preset === "all"
                  ? "All Time"
                  : preset.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground/80">
            Read-only authoritative view. Metrics derived from live application and event tables.
          </p>
        </div>

        {/* Error State */}
        {isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
            <AlertCircle className="mx-auto size-8 text-destructive" />
            <h3 className="mt-2 font-display text-base font-semibold text-destructive">
              Failed to load recruitment analytics
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {analyticsQuery.error instanceof Error
                ? analyticsQuery.error.message
                : "An unexpected database query error occurred."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 text-xs"
              onClick={() => analyticsQuery.refetch()}
            >
              Try Again
            </Button>
          </div>
        ) : null}

        {/* Loading Skeletons */}
        {isLoading && !data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl border border-border bg-card/60 animate-pulse p-4"
                />
              ))}
            </div>
            <div className="h-64 rounded-xl border border-border bg-card/60 animate-pulse" />
          </div>
        ) : null}

        {/* Main Analytics Content */}
        {data ? (
          <>
            {/* --- SECTION 1: RECRUITMENT OVERVIEW --- */}
            <div className="space-y-6">
              {/* Part A: Current Pipeline Snapshot */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                      Current Pipeline Snapshot
                    </h2>
                    <Badge
                      variant="outline"
                      className="text-[0.625rem] border-primary/40 text-primary"
                    >
                      Real-Time Live State
                    </Badge>
                  </div>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    Instantaneous organization state • Not date-bounded
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <MetricCard
                    label="Job Openings"
                    value={data.currentSnapshot.totalJobs}
                    hint={`${data.currentSnapshot.openJobs} open • ${data.currentSnapshot.closedJobs} closed • ${data.currentSnapshot.draftJobs} draft`}
                    icon={Briefcase}
                  />
                  <MetricCard
                    label="Active in Interview"
                    value={data.currentSnapshot.activeInterviewsCurrent}
                    hint="Currently in interview stage"
                    icon={Clock}
                  />
                  <MetricCard
                    label="Upcoming Confirmed"
                    value={data.currentSnapshot.upcomingConfirmedInterviews}
                    hint="Scheduled future appointments"
                    icon={Calendar}
                  />
                  <MetricCard
                    label="Active Onboarding"
                    value={data.currentSnapshot.activeOnboardingCurrent}
                    hint="Not started or in progress"
                    icon={FileCheck}
                  />
                  <MetricCard
                    label="Total Lifetime Hires"
                    value={data.currentSnapshot.totalHiredLifetime}
                    hint="All-time hired candidates"
                    icon={CheckCircle2}
                  />
                  <MetricCard
                    label="Total Applications"
                    value={data.currentSnapshot.totalApplicationsLifetime}
                    hint="All-time intake records"
                    icon={Users}
                  />
                </div>
              </section>

              {/* Part B: Date-Range Period Activity */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                      Period Activity Metrics
                    </h2>
                    <Badge variant="secondary" className="text-[0.625rem] capitalize">
                      {preset === "all_time" || preset === "all"
                        ? "All Time"
                        : preset.replace("_", " ")}
                    </Badge>
                  </div>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    Events occurring strictly within selected range
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <MetricCard
                    label="Applications Intake"
                    value={data.periodActivity.applicationsReceived}
                    hint={`${data.periodActivity.hiredInPeriod} hired in period`}
                    icon={Users}
                  />
                  <MetricCard
                    label="ATS Scored"
                    value={data.periodActivity.atsScoredCount}
                    hint={
                      data.periodActivity.averageAtsScore !== null
                        ? `Avg ${data.periodActivity.averageAtsScore}/100 score`
                        : "No scores recorded"
                    }
                    icon={Award}
                  />
                  <MetricCard
                    label="Interviews Conducted"
                    value={data.periodActivity.interviewsConducted}
                    hint={`${data.periodActivity.interviewsCancelled} cancelled • ${data.periodActivity.interviewsRescheduled} moved`}
                    icon={Clock}
                  />
                  <MetricCard
                    label="Offers Accepted"
                    value={data.periodActivity.offersAccepted}
                    hint={`${data.periodActivity.offersDeclined} declined • ${data.periodActivity.offersCreated} created`}
                    icon={UserCheck}
                  />
                  <MetricCard
                    label="Offer Accept Rate"
                    value={
                      data.offerAnalytics.acceptanceRate !== null
                        ? `${data.offerAnalytics.acceptanceRate}%`
                        : "N/A"
                    }
                    hint="Denominator: Accepted + Declined"
                    icon={TrendingUp}
                  />
                  <MetricCard
                    label="Onboardings Started"
                    value={data.periodActivity.onboardingInitiated}
                    hint={`${data.periodActivity.onboardingCompleted} completed in period`}
                    icon={FileCheck}
                  />
                </div>
              </section>
            </div>

            {/* --- SECTION 2: RECRUITMENT FUNNEL VISUALIZATION --- */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
                    Recruitment Funnel
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Progression based strictly on verifiable database evidence in the selected date
                    range
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleExportFunnel}
                >
                  <Download className="mr-1.5 size-3.5" /> Export Funnel CSV
                </Button>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                    {data.funnel.map((item, idx) => {
                      const isFirst = idx === 0;
                      return (
                        <div
                          key={item.step}
                          className="relative flex flex-col justify-between rounded-xl border border-border/80 bg-background/50 p-3.5 transition-all hover:bg-muted/30"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                              <span>Step {idx + 1}</span>
                              {!isFirst && item.conversionFromPrevious !== null ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                  {item.conversionFromPrevious}%
                                </span>
                              ) : null}
                            </div>
                            <h4 className="mt-1 font-display text-sm font-bold text-foreground">
                              {item.step}
                            </h4>
                            <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                              {item.count}
                            </p>
                          </div>
                          <div className="mt-3 space-y-1">
                            <span className="block text-[0.6rem] leading-tight text-primary/80 font-medium">
                              Evidence: {item.evidenceSource}
                            </span>
                            <p className="text-[0.6875rem] text-muted-foreground leading-tight">
                              {item.description}
                            </p>
                          </div>
                          {idx < data.funnel.length - 1 ? (
                            <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 hidden lg:block">
                              <ArrowRight className="size-4 text-muted-foreground/50 bg-card rounded-full p-0.5 border border-border" />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* --- SECTION 3 & 4: ATS OVERVIEW & PIPELINE DISTRIBUTION --- */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* ATS Overview */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">
                        ATS Screening Distribution
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Scored applications by category & threshold (Score ≥85 shortlists)
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleExportAtsSummary}
                    >
                      <Download className="mr-1.5 size-3" /> CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <p className="text-[0.6875rem] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                        Strong (≥85)
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold text-foreground">
                        {data.atsOverview.categories.strong}
                      </p>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        Shortlist ready
                      </span>
                    </div>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="text-[0.6875rem] font-semibold text-primary uppercase tracking-wider">
                        Good (70–84)
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold text-foreground">
                        {data.atsOverview.categories.good}
                      </p>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        Consider review
                      </span>
                    </div>
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <p className="text-[0.6875rem] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                        Partial (50–69)
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold text-foreground">
                        {data.atsOverview.categories.partial}
                      </p>
                      <span className="text-[0.6875rem] text-muted-foreground">Skill gaps</span>
                    </div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                      <p className="text-[0.6875rem] font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                        Low (&lt;50)
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold text-foreground">
                        {data.atsOverview.categories.low}
                      </p>
                      <span className="text-[0.6875rem] text-muted-foreground">Unqualified</span>
                    </div>
                  </div>

                  {/* ATS Score Distribution Chart */}
                  <div className="pt-2">
                    <p className="mb-2 text-xs font-medium text-foreground">
                      Score Frequency Histogram
                    </p>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={atsChartData}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{
                              fontSize: "12px",
                              backgroundColor: "var(--background)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                            }}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {atsChartData.map((_, i) => (
                              <Cell
                                key={`cell-${i}`}
                                fill={
                                  i === 3
                                    ? "var(--success)"
                                    : i === 2
                                      ? "var(--primary)"
                                      : i === 1
                                        ? "var(--warning)"
                                        : "var(--destructive)"
                                }
                              />
                            ))}
                            <LabelList
                              dataKey="count"
                              position="top"
                              style={{ fontSize: 10, fill: "var(--foreground)" }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Candidate Pipeline by Actual Stage */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Candidate Pipeline Stages
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Breakdown of applications across real database stages
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleExportPipelineSummary}
                    >
                      <Download className="mr-1.5 size-3" /> CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={pipelineChartData}
                        layout="vertical"
                        margin={{ top: 5, right: 25, left: 35, bottom: 5 }}
                      >
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip
                          contentStyle={{
                            fontSize: "12px",
                            backgroundColor: "var(--background)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]}>
                          <LabelList
                            dataKey="count"
                            position="right"
                            style={{ fontSize: 10, fill: "var(--foreground)" }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {data.candidatePipeline.map((item) => (
                      <div
                        key={item.stage}
                        className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5"
                      >
                        <span className="font-medium text-foreground">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{item.count}</span>
                          <span className="text-[0.6875rem] text-muted-foreground">
                            ({item.percentage}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* --- SECTION 5 & 6: INTERVIEWS & OFFERS ANALYTICS --- */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Interview Analytics */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">
                        Interview Operations
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Scheduled meetings, appointment statuses, and interview rounds
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleExportInterviewSummary}
                    >
                      <Download className="mr-1.5 size-3" /> CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="panel p-3">
                      <p className="label-caps text-[0.625rem]">Scheduled / Confirmed</p>
                      <p className="mt-1 font-display text-xl font-bold text-foreground">
                        {data.interviewAnalytics.scheduledOrConfirmed}
                      </p>
                      <span className="text-[0.6875rem] text-emerald-600 dark:text-emerald-400">
                        {data.interviewAnalytics.upcoming} upcoming
                      </span>
                    </div>
                    <div className="panel p-3">
                      <p className="label-caps text-[0.625rem]">Completed</p>
                      <p className="mt-1 font-display text-xl font-bold text-foreground">
                        {data.interviewAnalytics.completed}
                      </p>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        Finished evaluations
                      </span>
                    </div>
                    <div className="panel p-3">
                      <p className="label-caps text-[0.625rem]">Cancelled / Rescheduled</p>
                      <p className="mt-1 font-display text-xl font-bold text-foreground">
                        {data.interviewAnalytics.cancelled + data.interviewAnalytics.rescheduled}
                      </p>
                      <span className="text-[0.6875rem] text-rose-500">
                        {data.interviewAnalytics.cancelled} cancelled •{" "}
                        {data.interviewAnalytics.rescheduled} moved
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      By Appointment Type
                    </h4>
                    {data.interviewAnalytics.byType.length > 0 ? (
                      <div className="space-y-1.5">
                        {data.interviewAnalytics.byType.map((t) => (
                          <div
                            key={t.code}
                            className="flex items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2 text-xs"
                          >
                            <span className="font-medium text-foreground">{t.title}</span>
                            <Badge variant="secondary">{t.count} sessions</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic py-2">
                        No appointment types recorded for this range.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Offer Analytics */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">Offer Lifecycle</CardTitle>
                      <CardDescription className="text-xs">
                        Offer generation, acceptance rates, and candidate decision velocity
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleExportOffersSummary}
                    >
                      <Download className="mr-1.5 size-3" /> CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="panel p-3">
                      <p className="label-caps text-[0.625rem]">Accepted</p>
                      <p className="mt-1 font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
                        {data.offerAnalytics.accepted}
                      </p>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        {data.offerAnalytics.acceptanceRate !== null
                          ? `${data.offerAnalytics.acceptanceRate}% rate`
                          : "No resolved offers"}
                      </span>
                    </div>
                    <div className="panel p-3">
                      <p className="label-caps text-[0.625rem]">Pending Decision</p>
                      <p className="mt-1 font-display text-xl font-bold text-foreground">
                        {data.offerAnalytics.sent}
                      </p>
                      <span className="text-[0.6875rem] text-primary">Awaiting signature</span>
                    </div>
                    <div className="panel p-3">
                      <p className="label-caps text-[0.625rem]">Declined</p>
                      <p className="mt-1 font-display text-xl font-bold text-rose-500">
                        {data.offerAnalytics.declined}
                      </p>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        Candidate rejected
                      </span>
                    </div>
                    <div className="panel p-3">
                      <p className="label-caps text-[0.625rem]">Draft / Revoked</p>
                      <p className="mt-1 font-display text-xl font-bold text-foreground">
                        {data.offerAnalytics.draft +
                          data.offerAnalytics.revoked +
                          data.offerAnalytics.expired}
                      </p>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        {data.offerAnalytics.draft} draft • {data.offerAnalytics.expired} exp
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span>Offer Conversion Velocity</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {data.offerAnalytics.accepted} hired from{" "}
                        {data.offerAnalytics.totalInPeriod} offers
                      </span>
                    </div>
                    <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{
                          width: `${data.offerAnalytics.acceptanceRate ?? 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[0.6875rem] text-muted-foreground/80">
                      Calculation: {data.offerAnalytics.acceptanceDenominatorNotes}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* --- SECTION 7: ONBOARDING COMPLIANCE & DOCUMENTS --- */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Onboarding Compliance & Document Verification
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Phase 6 document compliance engine tracking and recruiter review activity
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleExportOnboardingSummary}
                  >
                    <Download className="mr-1.5 size-3" /> CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
                  <div className="panel p-3">
                    <p className="label-caps text-[0.625rem]">Total Onboardings</p>
                    <p className="mt-1 font-display text-xl font-bold text-foreground">
                      {data.onboardingAnalytics.totalInPeriod}
                    </p>
                  </div>
                  <div className="panel p-3">
                    <p className="label-caps text-[0.625rem]">In Progress</p>
                    <p className="mt-1 font-display text-xl font-bold text-primary">
                      {data.onboardingAnalytics.inProgress}
                    </p>
                    <span className="text-[0.6875rem] text-muted-foreground">Uploading docs</span>
                  </div>
                  <div className="panel p-3">
                    <p className="label-caps text-[0.625rem]">Completed</p>
                    <p className="mt-1 font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
                      {data.onboardingAnalytics.completed}
                    </p>
                    <span className="text-[0.6875rem] text-muted-foreground">100% verified</span>
                  </div>
                  <div className="panel p-3">
                    <p className="label-caps text-[0.625rem]">Not Started</p>
                    <p className="mt-1 font-display text-xl font-bold text-muted-foreground">
                      {data.onboardingAnalytics.notStarted}
                    </p>
                    <span className="text-[0.6875rem] text-muted-foreground">
                      Awaiting portal open
                    </span>
                  </div>
                  <div className="panel p-3">
                    <p className="label-caps text-[0.625rem]">Docs Verified</p>
                    <p className="mt-1 font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
                      {data.onboardingAnalytics.documents.verified}
                    </p>
                    <span className="text-[0.6875rem] text-muted-foreground">
                      Approved by staff
                    </span>
                  </div>
                  <div className="panel p-3">
                    <p className="label-caps text-[0.625rem]">Docs Pending Review</p>
                    <p className="mt-1 font-display text-xl font-bold text-amber-600 dark:text-amber-400">
                      {data.onboardingAnalytics.documents.pendingReview}
                    </p>
                    <span className="text-[0.6875rem] text-muted-foreground">Action required</span>
                  </div>
                  <div className="panel p-3">
                    <p className="label-caps text-[0.625rem]">Docs Rejected</p>
                    <p className="mt-1 font-display text-xl font-bold text-rose-500">
                      {data.onboardingAnalytics.documents.rejected}
                    </p>
                    <span className="text-[0.6875rem] text-muted-foreground">
                      Awaiting re-upload
                    </span>
                  </div>
                  <div className="panel p-3">
                    <p className="label-caps text-[0.625rem]">Not Submitted</p>
                    <p className="mt-1 font-display text-xl font-bold text-muted-foreground">
                      {data.onboardingAnalytics.documents.notSubmitted}
                    </p>
                    <span className="text-[0.6875rem] text-muted-foreground">
                      Pending candidate
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* --- SECTION 8: DETAILED REPORT TABLES --- */}
            <Card>
              <CardHeader className="pb-3 border-b border-border/60">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Detailed Report Tables
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Granular breakdown by job opening, ATS score category, and operational streams
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant={activeTab === "performance" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setActiveTab("performance")}
                    >
                      Job Performance
                    </Button>
                    <Button
                      variant={activeTab === "ats" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setActiveTab("ats")}
                    >
                      ATS Categories
                    </Button>
                    <Button
                      variant={activeTab === "pipeline" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setActiveTab("pipeline")}
                    >
                      Pipeline
                    </Button>
                    <Button
                      variant={activeTab === "interviews" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setActiveTab("interviews")}
                    >
                      Interviews
                    </Button>
                    <Button
                      variant={activeTab === "offers" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setActiveTab("offers")}
                    >
                      Offers
                    </Button>
                    <Button
                      variant={activeTab === "onboarding" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setActiveTab("onboarding")}
                    >
                      Onboarding
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {activeTab === "performance" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Job Opening Performance Matrix ({data.jobPerformance.length} roles)
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleExportJobPerformance}
                      >
                        <Download className="mr-1.5 size-3" /> Export CSV
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 text-xs">
                            <TableHead>Role Title</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Applications</TableHead>
                            <TableHead className="text-right">Shortlisted</TableHead>
                            <TableHead className="text-right">Interviews</TableHead>
                            <TableHead className="text-right">Offers</TableHead>
                            <TableHead className="text-right">Hired</TableHead>
                            <TableHead className="text-right">Onboarding</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          {data.jobPerformance.length > 0 ? (
                            data.jobPerformance.map((job) => (
                              <TableRow key={job.jobId} className="hover:bg-muted/30">
                                <TableCell className="font-medium text-foreground">
                                  {job.jobTitle}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {job.department}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      job.status.toLowerCase() === "open" ||
                                      job.status.toLowerCase() === "active"
                                        ? "default"
                                        : "secondary"
                                    }
                                    className="text-[0.625rem] capitalize"
                                  >
                                    {job.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  {job.applications}
                                </TableCell>
                                <TableCell className="text-right">{job.shortlisted}</TableCell>
                                <TableCell className="text-right">{job.interviews}</TableCell>
                                <TableCell className="text-right">{job.offers}</TableCell>
                                <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                                  {job.hired}
                                </TableCell>
                                <TableCell className="text-right">{job.onboarding}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell
                                colSpan={9}
                                className="text-center text-muted-foreground py-6"
                              >
                                No job openings found.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                {activeTab === "ats" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        ATS Score Category Distribution
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleExportAtsSummary}
                      >
                        <Download className="mr-1.5 size-3" /> Export CSV
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 text-xs">
                            <TableHead>Category</TableHead>
                            <TableHead>Score Range</TableHead>
                            <TableHead className="text-right">Candidate Count</TableHead>
                            <TableHead className="text-right">% of Scored</TableHead>
                            <TableHead>Shortlist Threshold Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          <TableRow>
                            <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Strong Match
                            </TableCell>
                            <TableCell>85 – 100</TableCell>
                            <TableCell className="text-right font-bold">
                              {data.atsOverview.categories.strong}
                            </TableCell>
                            <TableCell className="text-right">
                              {data.atsOverview.totalScored > 0
                                ? `${Math.round((data.atsOverview.categories.strong / data.atsOverview.totalScored) * 100)}%`
                                : "0%"}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[0.625rem]">
                                Meets Shortlist (≥85)
                              </Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold text-primary">Good Match</TableCell>
                            <TableCell>70 – 84</TableCell>
                            <TableCell className="text-right font-bold">
                              {data.atsOverview.categories.good}
                            </TableCell>
                            <TableCell className="text-right">
                              {data.atsOverview.totalScored > 0
                                ? `${Math.round((data.atsOverview.categories.good / data.atsOverview.totalScored) * 100)}%`
                                : "0%"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[0.625rem]">
                                Below Shortlist (&lt;85)
                              </Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold text-amber-600 dark:text-amber-400">
                              Partial Match
                            </TableCell>
                            <TableCell>50 – 69</TableCell>
                            <TableCell className="text-right font-bold">
                              {data.atsOverview.categories.partial}
                            </TableCell>
                            <TableCell className="text-right">
                              {data.atsOverview.totalScored > 0
                                ? `${Math.round((data.atsOverview.categories.partial / data.atsOverview.totalScored) * 100)}%`
                                : "0%"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[0.625rem]">
                                Below Shortlist (&lt;85)
                              </Badge>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold text-rose-500">Low Match</TableCell>
                            <TableCell>0 – 49</TableCell>
                            <TableCell className="text-right font-bold">
                              {data.atsOverview.categories.low}
                            </TableCell>
                            <TableCell className="text-right">
                              {data.atsOverview.totalScored > 0
                                ? `${Math.round((data.atsOverview.categories.low / data.atsOverview.totalScored) * 100)}%`
                                : "0%"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-[0.625rem] text-rose-500 border-rose-500/30"
                              >
                                Below Shortlist (&lt;85)
                              </Badge>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                {activeTab === "pipeline" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Pipeline Stage Breakdown
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleExportPipelineSummary}
                      >
                        <Download className="mr-1.5 size-3" /> Export CSV
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 text-xs">
                            <TableHead>Stage Name</TableHead>
                            <TableHead>Stage Code</TableHead>
                            <TableHead className="text-right">Candidate Count</TableHead>
                            <TableHead className="text-right">% of Active Intake</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          {data.candidatePipeline.map((p) => (
                            <TableRow key={p.stage}>
                              <TableCell className="font-medium text-foreground">
                                {p.label}
                              </TableCell>
                              <TableCell className="text-muted-foreground font-mono text-[0.6875rem]">
                                {p.stage}
                              </TableCell>
                              <TableCell className="text-right font-bold">{p.count}</TableCell>
                              <TableCell className="text-right">{p.percentage}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                {activeTab === "interviews" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Interview Sessions Breakdown
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleExportInterviewSummary}
                      >
                        <Download className="mr-1.5 size-3" /> Export CSV
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 text-xs">
                            <TableHead>Appointment Type / Metric</TableHead>
                            <TableHead className="text-right">Sessions Count</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          <TableRow>
                            <TableCell className="font-medium">
                              Total Interviews in Selected Period
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.interviewAnalytics.totalInPeriod}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-emerald-600 dark:text-emerald-400">
                              Completed Sessions
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.interviewAnalytics.completed}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">
                              Scheduled / Confirmed (Upcoming)
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.interviewAnalytics.scheduledOrConfirmed}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-rose-500">
                              Cancelled Sessions
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.interviewAnalytics.cancelled}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-amber-500">
                              Rescheduled Sessions
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.interviewAnalytics.rescheduled}
                            </TableCell>
                          </TableRow>
                          {data.interviewAnalytics.byType.map((t) => (
                            <TableRow key={t.code}>
                              <TableCell className="text-muted-foreground">
                                Type: {t.title} ({t.code})
                              </TableCell>
                              <TableCell className="text-right font-medium">{t.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                {activeTab === "offers" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Offer Status Matrix
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleExportOffersSummary}
                      >
                        <Download className="mr-1.5 size-3" /> Export CSV
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 text-xs">
                            <TableHead>Offer Status</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead>Remarks</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          <TableRow>
                            <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Accepted
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.offerAnalytics.accepted}
                            </TableCell>
                            <TableCell>
                              {data.offerAnalytics.acceptanceRate !== null
                                ? `${data.offerAnalytics.acceptanceRate}% acceptance rate`
                                : "No resolved offers"}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold text-primary">
                              Sent (Pending Decision)
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.offerAnalytics.sent}
                            </TableCell>
                            <TableCell>Candidate reviewing offer package</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold text-rose-500">Declined</TableCell>
                            <TableCell className="text-right font-bold">
                              {data.offerAnalytics.declined}
                            </TableCell>
                            <TableCell>Candidate declined terms</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold text-muted-foreground">
                              Draft
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.offerAnalytics.draft}
                            </TableCell>
                            <TableCell>Unsent draft compensation package</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold text-muted-foreground">
                              Expired
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.offerAnalytics.expired}
                            </TableCell>
                            <TableCell>Past acceptance deadline</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold text-muted-foreground">
                              Revoked
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.offerAnalytics.revoked}
                            </TableCell>
                            <TableCell>Revoked prior to decision</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                {activeTab === "onboarding" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Onboarding Compliance Summary
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleExportOnboardingSummary}
                      >
                        <Download className="mr-1.5 size-3" /> Export CSV
                      </Button>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 text-xs">
                            <TableHead>Metric / Requirement Stream</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead>Status Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          <TableRow>
                            <TableCell className="font-medium text-primary">
                              Onboarding: In Progress
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.onboardingAnalytics.inProgress}
                            </TableCell>
                            <TableCell>Candidate currently uploading documents</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-emerald-600 dark:text-emerald-400">
                              Onboarding: Completed
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.onboardingAnalytics.completed}
                            </TableCell>
                            <TableCell>All required compliance documents verified</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-muted-foreground">
                              Onboarding: Not Started
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.onboardingAnalytics.notStarted}
                            </TableCell>
                            <TableCell>Candidate has not opened portal token</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-rose-500">
                              Onboarding: Cancelled
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.onboardingAnalytics.cancelled}
                            </TableCell>
                            <TableCell>Onboarding flow terminated</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-emerald-600 dark:text-emerald-400">
                              Documents: Verified
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.onboardingAnalytics.documents.verified}
                            </TableCell>
                            <TableCell>Approved by recruiter</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-amber-600 dark:text-amber-400">
                              Documents: Pending Review
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.onboardingAnalytics.documents.pendingReview}
                            </TableCell>
                            <TableCell>Requires recruiter inspection</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-rose-500">
                              Documents: Rejected
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.onboardingAnalytics.documents.rejected}
                            </TableCell>
                            <TableCell>Candidate notified to re-upload</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-muted-foreground">
                              Documents: Not Submitted
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {data.onboardingAnalytics.documents.notSubmitted}
                            </TableCell>
                            <TableCell>Awaiting candidate file upload</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
