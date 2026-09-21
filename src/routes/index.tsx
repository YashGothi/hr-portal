import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, BarChart3, FileCheck2, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "aiHIVE — AI HR Automation & Candidate Pipeline" },
      {
        name: "description",
        content:
          "aiHIVE brings AI ATS scoring, candidate stage tracking, document verification and hiring workflows into one recruiter workspace.",
      },
      { property: "og:title", content: "aiHIVE — AI HR Automation & Candidate Pipeline" },
      {
        property: "og:description",
        content:
          "One workspace for AI resume scoring, candidate stages, document checks and shortlist emails.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: BarChart3,
    title: "Hiring dashboard",
    body: "Live counts per stage, average match score and document verification progress.",
  },
  {
    icon: Sparkles,
    title: "AI ATS scoring",
    body: "Every resume is scored 0–100 against the opening, with strengths and gaps.",
  },
  {
    icon: BadgeCheck,
    title: "Stage tracking",
    body: "Application to Shortlisted, Interview and Hiring — with a full change history.",
  },
  {
    icon: FileCheck2,
    title: "Document verification",
    body: "Track IDs, certificates and experience letters as pending, verified or rejected.",
  },
  {
    icon: Mail,
    title: "Candidate communication",
    body: "Keep shortlist, interview and outcome communication connected to each hiring stage.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-5">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link to="/auth">HR sign in</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-16 pb-14 text-center">
        <p className="label-caps">End-to-end HR automation</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">
          Screen, score and move candidates without the spreadsheet
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          aiHIVE gives your recruiting team one place for AI resume scoring, candidate stages,
          document verification and shortlist notifications.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <Link to="/auth">
              Open the workspace <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <article key={title} className="panel p-5">
            <Icon className="size-5 text-primary" />
            <h2 className="mt-3 text-base font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
