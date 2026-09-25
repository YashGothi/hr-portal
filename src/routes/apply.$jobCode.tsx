import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { getPublicJob } from "@/lib/applications.functions";
import { RESUME_MAX_BYTES } from "@/lib/ats/weights";

const COMPANY = "Seceon";
const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const Route = createFileRoute("/apply/$jobCode")({
  loader: ({ params }) => getPublicJob({ data: { code: params.jobCode } }),
  head: ({ loaderData }) => {
    const title = loaderData?.job
      ? `Apply: ${loaderData.job.title} | ${COMPANY} Careers`
      : `Opening unavailable | ${COMPANY} Careers`;
    const description = loaderData?.job
      ? `Apply for ${loaderData.job.title} at ${COMPANY}. Submit your details and resume in a couple of minutes.`
      : `This ${COMPANY} opening is no longer accepting applications.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ApplyPage,
});

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  yearsExperience: string;
  linkedinUrl: string;
  portfolioUrl: string;
  coverLetter: string;
};

const EMPTY: FormState = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  yearsExperience: "",
  linkedinUrl: "",
  portfolioUrl: "",
  coverLetter: "",
};

function ApplyPage() {
  const { job, closed } = Route.useLoaderData();
  const search =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (form.fullName.trim().length < 2) return "Enter your full name.";
    if (!form.email.trim()) return "Enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      return "Enter a valid email address.";
    if (!/^[+0-9][0-9\s\-()]{6,23}$/.test(form.phone.trim())) return "Enter a valid phone number.";
    if (form.location.trim().length < 2) return "Enter your current location.";
    const years = Number(form.yearsExperience);
    if (!Number.isFinite(years) || years < 0 || years > 60)
      return "Enter your years of experience.";
    if (!/^https?:\/\/.+/i.test(form.linkedinUrl.trim())) return "Enter your LinkedIn profile URL.";
    if (form.portfolioUrl.trim() && !/^https?:\/\/.+/i.test(form.portfolioUrl.trim()))
      return "Enter a valid portfolio or GitHub URL, or leave it blank.";
    if (!file) return "Attach your resume as a PDF, DOC or DOCX file.";
    if (file.size > RESUME_MAX_BYTES) return "Your resume file is larger than 8 MB.";
    if (!/\.(pdf|docx?)$/i.test(file.name)) return "Resumes must be a PDF, DOC or DOCX file.";
    return null;
  }

  function submit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (!job || !file) return;

    setError(null);
    setBusy(true);
    setProgress(5);

    const body = new FormData();
    body.set("jobCode", job.job_code);
    body.set("fullName", form.fullName.trim());
    body.set("email", form.email.trim());
    body.set("phone", form.phone.trim());
    body.set("location", form.location.trim());
    body.set("yearsExperience", form.yearsExperience);
    body.set("linkedinUrl", form.linkedinUrl.trim());
    body.set("portfolioUrl", form.portfolioUrl.trim());
    body.set("coverLetter", form.coverLetter.trim());
    body.set("source", search.get("source") ?? "LinkedIn");
    body.set("sourcePostId", search.get("post") ?? "");
    body.set("utmSource", search.get("utm_source") ?? "");
    body.set("utmMedium", search.get("utm_medium") ?? "");
    body.set("utmCampaign", search.get("utm_campaign") ?? "");
    body.set("resume", file);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/public/applications");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.max(5, Math.round((event.loaded / event.total) * 90)));
      }
    };
    request.onload = () => {
      setProgress(100);
      setBusy(false);
      try {
        const payload = JSON.parse(request.responseText) as {
          applicationId?: string;
          error?: string;
        };
        if (request.status >= 200 && request.status < 300 && payload.applicationId) {
          setApplicationId(payload.applicationId);
        } else {
          setError(payload.error ?? "We could not submit your application. Please try again.");
        }
      } catch {
        setError("We could not submit your application. Please try again.");
      }
    };
    request.onerror = () => {
      setBusy(false);
      setError("Network error. Please check your connection and try again.");
    };
    request.send(body);
  }

  const experienceLine = job?.min_experience_years
    ? `${job.min_experience_years}${job.max_experience_years ? `–${job.max_experience_years}` : "+"} years`
    : "Open to all experience levels";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Brand />
          <span className="text-xs text-muted-foreground">{COMPANY} Careers</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        {!job ? (
          <section className="panel p-8 text-center">
            <h1 className="text-xl font-semibold">This opening could not be found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The application link may be out of date. Please check the link in the job post.
            </p>
          </section>
        ) : applicationId ? (
          <section className="panel p-8 text-center">
            <h1 className="text-xl font-semibold">Application submitted successfully</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Thank you for applying for {job.title}. Our talent acquisition team will review your
              profile and be in touch.
            </p>
            <p className="mt-6 text-sm">
              Application ID
              <span className="ml-2 rounded-md border border-border bg-secondary px-2 py-1 font-mono text-sm">
                {applicationId}
              </span>
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            <section className="panel space-y-4 p-6 lg:col-span-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{COMPANY}</p>
                <h1 className="mt-1 text-2xl font-semibold">{job.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[job.department, job.location, job.employment_type].filter(Boolean).join(" · ")}
                </p>
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Experience</dt>
                  <dd>{experienceLine}</dd>
                </div>
                {job.education_requirement ? (
                  <div>
                    <dt className="text-muted-foreground">Education</dt>
                    <dd>{job.education_requirement}</dd>
                  </div>
                ) : null}
                {job.application_deadline ? (
                  <div>
                    <dt className="text-muted-foreground">Apply before</dt>
                    <dd>{new Date(job.application_deadline).toLocaleDateString()}</dd>
                  </div>
                ) : null}
              </dl>

              {job.required_skills.length ? (
                <div>
                  <p className="text-sm font-medium">Required skills</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.required_skills.map((skill) => (
                      <Badge key={skill} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {job.preferred_skills.length ? (
                <div>
                  <p className="text-sm font-medium">Preferred skills</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.preferred_skills.map((skill) => (
                      <Badge key={skill} variant="secondary">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {job.description ? (
                <div>
                  <p className="text-sm font-medium">About the role</p>
                  <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                    {job.description}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="panel space-y-5 p-6 lg:col-span-3">
              {closed ? (
                <div className="rounded-lg border border-border bg-secondary p-4 text-sm">
                  Applications for this opening are closed. Thank you for your interest in {COMPANY}
                  .
                </div>
              ) : (
                <>
                  <div>
                    <h2 className="text-lg font-semibold">Your application</h2>
                    <p className="text-sm text-muted-foreground">
                      No account needed — fill in your details and attach your resume.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full name</Label>
                      <Input
                        id="fullName"
                        value={form.fullName}
                        onChange={(e) => set("fullName", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        placeholder="you@company.com"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone number</Label>
                      <Input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Current location</Label>
                      <Input
                        id="location"
                        value={form.location}
                        onChange={(e) => set("location", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="years">Years of experience</Label>
                      <Input
                        id="years"
                        type="number"
                        min={0}
                        max={60}
                        step={0.5}
                        value={form.yearsExperience}
                        onChange={(e) => set("yearsExperience", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedin">LinkedIn profile URL</Label>
                      <Input
                        id="linkedin"
                        value={form.linkedinUrl}
                        onChange={(e) => set("linkedinUrl", e.target.value)}
                        placeholder="https://linkedin.com/in/…"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="portfolio">Portfolio / GitHub URL (optional)</Label>
                      <Input
                        id="portfolio"
                        value={form.portfolioUrl}
                        onChange={(e) => set("portfolioUrl", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="cover">Cover letter (optional)</Label>
                      <Textarea
                        id="cover"
                        rows={5}
                        value={form.coverLetter}
                        onChange={(e) => set("coverLetter", e.target.value)}
                        placeholder="Why this role is a good fit for you…"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="resume">Resume (PDF, DOC or DOCX, up to 8 MB)</Label>
                      <Input
                        id="resume"
                        type="file"
                        accept={ACCEPT}
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                      {file ? (
                        <p className="text-xs text-muted-foreground">
                          {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {busy || progress > 0 ? <Progress value={progress} /> : null}
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}

                  <Button onClick={submit} disabled={busy} className="w-full sm:w-auto">
                    {busy ? "Submitting…" : "Submit application"}
                  </Button>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
