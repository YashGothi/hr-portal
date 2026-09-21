import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CandidateComparison } from "@/components/CandidateComparison";
import { compareCandidates } from "@/lib/applications.functions";

const searchSchema = z.object({
  ids: z.string().optional().default(""),
});

export const Route = createFileRoute("/_authenticated/candidates/compare")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Candidate Comparison | aiHIVE" },
      {
        name: "description",
        content: "Side-by-side recruiter comparison of candidates for the same job opening.",
      },
    ],
  }),
  component: CandidateComparisonRoute,
});

function CandidateComparisonRoute() {
  const { ids } = Route.useSearch();
  const fetchComparison = useServerFn(compareCandidates);

  const candidateIds = (ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const query = useQuery({
    queryKey: ["compare-candidates", candidateIds],
    queryFn: () => fetchComparison({ data: { candidateIds } }),
    enabled: candidateIds.length >= 2,
    retry: false,
  });

  if (candidateIds.length < 2) {
    return (
      <AppShell title="Candidate Comparison" subtitle="Side-by-side ATS profile comparison">
        <div className="panel p-8 text-center space-y-4 max-w-lg mx-auto">
          <AlertCircle className="size-8 text-warning mx-auto" />
          <h2 className="text-lg font-bold text-foreground">Select Candidates to Compare</h2>
          <p className="text-sm text-muted-foreground">
            Please select at least 2 candidates (up to 5) who applied to the same job opening from
            the candidate pipeline.
          </p>
          <Button asChild variant="secondary">
            <Link to="/candidates">
              <ArrowLeft className="size-4 mr-1.5" /> Back to Pipeline
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  if (query.isLoading) {
    return (
      <AppShell title="Candidate Comparison" subtitle="Loading candidate data…">
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          Loading side-by-side ATS comparison data…
        </div>
      </AppShell>
    );
  }

  if (query.isError || !query.data) {
    const errorMsg =
      query.error instanceof Error
        ? query.error.message
        : "Could not load candidate comparison data.";

    return (
      <AppShell title="Candidate Comparison" subtitle="Unable to compare candidates">
        <div className="panel p-8 text-center space-y-4 max-w-lg mx-auto border-destructive/40 bg-destructive/5">
          <AlertCircle className="size-8 text-destructive mx-auto" />
          <h2 className="text-lg font-bold text-destructive">Comparison Unavailable</h2>
          <p className="text-sm text-foreground">{errorMsg}</p>
          <Button asChild variant="outline">
            <Link to="/candidates">
              <ArrowLeft className="size-4 mr-1.5" /> Return to Candidate Pipeline
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Candidate Comparison"
      subtitle={`Comparing ${query.data.candidates.length} candidates for ${query.data.job.title}`}
    >
      <CandidateComparison job={query.data.job} candidates={query.data.candidates} />
    </AppShell>
  );
}
