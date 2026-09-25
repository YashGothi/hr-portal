import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Eye,
  Mail,
  Pencil,
  RotateCcw,
  Save,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SenderDnsStatus } from "@/components/SenderDnsStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STAGE_LABELS, type Stage } from "@/lib/hr";
import { useCandidates, type Candidate } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/email-dispatch")({
  head: () => ({
    meta: [
      { title: "Email Dispatch & Templates | aiHIVE" },
      {
        name: "description",
        content:
          "Prepare professional candidate email templates, personalize messages, and preview dispatch activity.",
      },
      { property: "og:title", content: "Email Dispatch & Templates | aiHIVE" },
      {
        property: "og:description",
        content: "Prepare and personalize professional candidate email templates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailDispatchPage,
});

export type TemplateId = "shortlist" | "interview" | "hired" | "rejected";

export type EmailTemplate = {
  id: TemplateId;
  label: string;
  shortLabel: string;
  description: string;
  eligibleStages: Stage[];
  needsSchedule: boolean;
};

export type Draft = { subject: string; body: string };

type HistoryItem = {
  id: string;
  recipients: string;
  subject: string;
  sentAt: Date;
  kind: "Individual" | "Bulk";
};

export const TEMPLATES: EmailTemplate[] = [
  {
    id: "shortlist",
    label: "Shortlist & screening invite",
    shortLabel: "Shortlist",
    description:
      "Congratulate shortlisted candidates and invite them to an initial screening call.",
    eligibleStages: ["application", "screening", "shortlisted"],
    needsSchedule: true,
  },
  {
    id: "interview",
    label: "Interview invite",
    shortLabel: "Interview",
    description: "Share the confirmed interview schedule and meeting details.",
    eligibleStages: ["application", "screening", "shortlisted", "interview"],
    needsSchedule: true,
  },
  {
    id: "hired",
    label: "Status update — accepted",
    shortLabel: "Accepted",
    description: "Congratulate a successful candidate and explain the next steps.",
    eligibleStages: [
      "application",
      "screening",
      "shortlisted",
      "doc_verification",
      "interview",
      "offer",
      "hired",
    ],
    needsSchedule: false,
  },
  {
    id: "rejected",
    label: "Status update — not selected",
    shortLabel: "Not selected",
    description: "Thank a candidate and share a considerate final update.",
    eligibleStages: [
      "application",
      "screening",
      "shortlisted",
      "doc_verification",
      "interview",
      "offer",
      "rejected",
    ],
    needsSchedule: false,
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(
  TEMPLATES.map((template) => [template.id, template]),
) as Record<TemplateId, EmailTemplate>;

// v2: drafts are stored with {{placeholders}} so they stay candidate-neutral.
// Drafts saved by older versions baked real names in and are discarded.
const STORAGE_KEY = "hr-automate-email-template-drafts-v2";

export function candidateRole(candidate: Candidate | undefined) {
  return candidate?.applied_role?.trim() || "the position";
}

/**
 * Placeholders keep saved templates candidate-neutral, so the editor can
 * re-personalize the same wording whenever a different recipient is selected.
 */
export const TOKEN = {
  name: "{{candidate_name}}",
  role: "{{role}}",
  schedule: "{{schedule}}",
  meeting: "{{meeting_details}}",
  confirm: "{{confirm_link}}",
} as const;

export type Personalization = {
  name: string;
  role: string;
  schedule: string;
  meeting: string;
  confirm: string;
};

const SIGN_OFF = "Kind regards,\nTalent Acquisition Team\naiHIVE";

export const DEFAULT_TEMPLATES: Record<TemplateId, Draft> = {
  shortlist: {
    subject: `Congratulations, ${TOKEN.name} — shortlisted for ${TOKEN.role}`,
    body: `Dear ${TOKEN.name},\n\nThank you for your interest in the ${TOKEN.role} opportunity. We are pleased to let you know that your application has been shortlisted.\n\nWe would like to invite you to an initial screening conversation on ${TOKEN.schedule}.${TOKEN.meeting}\n\nPlease confirm your availability using the secure link below:\n${TOKEN.confirm}\n\nIf the proposed time is not convenient, simply reply to this email and we will gladly arrange an alternative.\n\n${SIGN_OFF}`,
  },
  interview: {
    subject: `Interview invitation — ${TOKEN.role} at aiHIVE`,
    body: `Dear ${TOKEN.name},\n\nThank you for progressing through our selection process. We would be delighted to meet you for an interview regarding the ${TOKEN.role} opportunity.\n\nYour interview is scheduled for ${TOKEN.schedule}.${TOKEN.meeting}\n\nPlease confirm your attendance by opening the secure link below. It shows your interview details and lets you add them to your own calendar:\n${TOKEN.confirm}\n\nIf you need any reasonable adjustments or have questions before the interview, please let us know.\n\n${SIGN_OFF}`,
  },
  hired: {
    subject: `Congratulations, ${TOKEN.name} — your application for ${TOKEN.role}`,
    body: `Dear ${TOKEN.name},\n\nWe are delighted to confirm that you have been selected for the ${TOKEN.role} position. Congratulations on successfully completing our hiring process.\n\nOur talent acquisition team will contact you shortly with the next steps and your joining information. We are excited about the experience and perspective you will bring to the team.\n\n${SIGN_OFF}`,
  },
  rejected: {
    subject: `Update on your application — ${TOKEN.role} at aiHIVE`,
    body: `Dear ${TOKEN.name},\n\nThank you for applying for the ${TOKEN.role} position at aiHIVE and for the time you invested in our selection process.\n\nAfter careful review of all applications, we have decided to move forward with another candidate whose experience more closely matches the current requirements of this role. This was a difficult decision, as the standard of applications was genuinely high.\n\nWe were glad to learn about your background and would welcome an application from you for future openings that align with your skills. With your permission, we will keep your details on file so our talent acquisition team can reach out when a suitable role opens.\n\nThank you again for your interest in joining us. We wish you continued success in your career and in your search.\n\n${SIGN_OFF}`,
  },
};

export function personalization(
  candidate: Candidate | undefined,
  date: Date,
  time: string,
  meetingLink: string,
  origin: string,
): Personalization {
  const token = candidate?.interview_confirm_token;
  return {
    name: candidate?.full_name || "Candidate",
    role: candidateRole(candidate),
    schedule: `${format(date, "EEEE, d MMMM yyyy")} at ${time}`,
    meeting: meetingLink.trim() ? `\nMeeting details: ${meetingLink.trim()}` : "",
    confirm: token
      ? `${origin}/confirm/${token}`
      : "(confirmation link available once the candidate is saved)",
  };
}

/** Swaps placeholders for the selected candidate's details. */
export function fill(text: string, values: Personalization) {
  return text
    .replaceAll(TOKEN.name, values.name)
    .replaceAll(TOKEN.role, values.role)
    .replaceAll(TOKEN.schedule, values.schedule)
    .replaceAll(TOKEN.meeting, values.meeting)
    .replaceAll(TOKEN.confirm, values.confirm);
}

/** Puts placeholders back before a template is saved for reuse. */
export function tokenize(text: string, values: Personalization) {
  let out = text;
  const pairs: [string, string][] = [
    [values.confirm, TOKEN.confirm],
    [values.schedule, TOKEN.schedule],
    [values.meeting, TOKEN.meeting],
    [values.name, TOKEN.name],
    [values.role, TOKEN.role],
  ];
  for (const [value, token] of pairs) {
    if (value.trim()) out = out.replaceAll(value, token);
  }
  return out;
}

export type EmailDispatchStateProps = {
  candidates?: Candidate[] | undefined;
  initialCandidateId?: string | undefined;
  initialTemplateId?: TemplateId | undefined;
  initialDate?: Date | undefined;
  initialTime?: string | undefined;
  initialMeetingLink?: string | undefined;
  origin?: string | undefined;
};

export function useEmailDispatchState({
  candidates = [],
  initialCandidateId = "",
  initialTemplateId = "shortlist",
  initialDate,
  initialTime = "10:00",
  initialMeetingLink = "",
  origin = "",
}: EmailDispatchStateProps = {}) {
  const [templateId, setTemplateId] = useState<TemplateId>(initialTemplateId);
  const [candidateId, setCandidateId] = useState<string>(initialCandidateId);
  const [date, setDate] = useState<Date>(() => {
    if (initialDate) return initialDate;
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek;
  });
  const [time, setTime] = useState(initialTime);
  const [meetingLink, setMeetingLink] = useState(initialMeetingLink);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [savedDrafts, setSavedDrafts] = useState<Partial<Record<TemplateId, Draft>>>({});
  // null = follow the template + selected candidate; a string = HR's manual edit.
  const [editedSubject, setEditedSubject] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState<string | null>(null);

  const selectedTemplate = TEMPLATE_BY_ID[templateId];
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === candidateId) ?? null,
    [candidates, candidateId],
  );

  useEffect(() => {
    if (candidates.length > 0) {
      if (!candidateId || !candidates.some((c) => c.id === candidateId)) {
        const first = candidates[0];
        if (first) setCandidateId(first.id);
      }
    }
  }, [candidateId, candidates]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<Record<TemplateId, Draft>>;
          // Only keep drafts that still use placeholders — anything with a baked-in
          // name would stop personalizing when the target candidate changes.
          const valid = Object.fromEntries(
            Object.entries(parsed).filter(([, draft]) => draft?.body.includes(TOKEN.name)),
          ) as Partial<Record<TemplateId, Draft>>;
          setSavedDrafts(valid);
        }
      }
    } catch {
      // A blocked browser store should not prevent the editor from working.
    }
  }, []);

  const values = useMemo(
    () => personalization(selectedCandidate ?? undefined, date, time, meetingLink, origin),
    [selectedCandidate, date, time, meetingLink, origin],
  );

  // The visible email is always derived from the template plus the currently
  // selected candidate, so switching recipients updates the name immediately.
  const source = savedDrafts[templateId] ?? DEFAULT_TEMPLATES[templateId];
  const subjectSource = editedSubject ?? source.subject;
  const bodySource = editedBody ?? source.body;
  const subject = fill(subjectSource, values);
  const body = fill(bodySource, values);

  // HR's manual edits are stored with placeholders so they keep personalizing.
  const changeSubject = (next: string) => setEditedSubject(tokenize(next, values));
  const changeBody = (next: string) => setEditedBody(tokenize(next, values));

  const eligibleCandidates = useMemo(
    () =>
      candidates.filter((candidate) => selectedTemplate.eligibleStages.includes(candidate.stage)),
    [candidates, selectedTemplate],
  );

  function selectTemplate(nextId: TemplateId) {
    setTemplateId(nextId);
    setEditedSubject(null);
    setEditedBody(null);
  }

  function selectCandidate(nextId: string) {
    setCandidateId(nextId);
  }

  function saveTemplate() {
    const next = {
      ...savedDrafts,
      [templateId]: { subject: subjectSource, body: bodySource },
    };
    setSavedDrafts(next);
    setEditedSubject(null);
    setEditedBody(null);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      toast.success("Template saved in this browser.");
    } catch {
      toast.error("This browser could not save the template.");
    }
  }

  function resetTemplate() {
    const next = { ...savedDrafts };
    delete next[templateId];
    setSavedDrafts(next);
    setEditedSubject(null);
    setEditedBody(null);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // The in-memory reset still succeeds.
    }
    toast.success("Template restored to the professional default.");
  }

  function getIndividualDispatchPayload() {
    if (!selectedCandidate) return null;
    const personValues = personalization(selectedCandidate, date, time, meetingLink, origin);
    return {
      candidateId: selectedCandidate.id,
      recipientEmail: selectedCandidate.email,
      candidateName: selectedCandidate.full_name,
      templateId,
      subject: fill(subjectSource, personValues),
      message: fill(bodySource, personValues),
      schedule: selectedTemplate.needsSchedule ? personValues.schedule : undefined,
      meetingDetails: meetingLink.trim() || undefined,
      confirmLink: selectedCandidate.interview_confirm_token
        ? `${origin}/confirm/${selectedCandidate.interview_confirm_token}`
        : undefined,
    };
  }

  return {
    templateId,
    setTemplateId,
    selectedTemplate,
    selectTemplate,
    candidateId,
    setCandidateId,
    selectedCandidate,
    selectCandidate,
    date,
    setDate,
    time,
    setTime,
    meetingLink,
    setMeetingLink,
    mode,
    setMode,
    subject,
    body,
    changeSubject,
    changeBody,
    subjectSource,
    bodySource,
    values,
    eligibleCandidates,
    saveTemplate,
    resetTemplate,
    getIndividualDispatchPayload,
    savedDrafts,
    setSavedDrafts,
  };
}

export type { Candidate } from "@/lib/queries";

export type EmailDispatchPageProps = {
  initialCandidates?: Candidate[] | undefined;
  initialCandidateId?: string | undefined;
  initialTemplateId?: TemplateId | undefined;
};

export function EmailDispatchPage(props: EmailDispatchPageProps = {}) {
  const { initialCandidates, initialCandidateId, initialTemplateId } = props;
  const candidatesQuery = useCandidates();
  const candidates = initialCandidates ?? candidatesQuery.data ?? [];
  const isLoading = initialCandidates ? false : candidatesQuery.isLoading;

  const {
    templateId,
    selectedTemplate,
    selectTemplate,
    candidateId,
    setCandidateId,
    selectedCandidate,
    date,
    setDate,
    time,
    setTime,
    meetingLink,
    setMeetingLink,
    mode,
    setMode,
    subject,
    body,
    changeSubject,
    changeBody,
    subjectSource,
    bodySource,
    values,
    eligibleCandidates,
    saveTemplate,
    resetTemplate,
  } = useEmailDispatchState({
    candidates,
    initialCandidateId,
    initialTemplateId,
    origin: typeof window === "undefined" ? "" : window.location.origin,
  });

  const [history] = useState<HistoryItem[]>([]);
  const initials = selectedCandidate?.full_name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppShell
      title="Candidate Email Preview & Template Studio"
      subtitle="Preview branded candidate email templates, customize wording, and view interview invitations."
    >
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3">
        <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">Candidate Email Preview & Template Studio</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Select candidates, personalize template wording, and preview generated email content in view-only mode.
          </p>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(17rem,0.7fr)_minmax(32rem,1.5fr)]">
        <div className="space-y-5">
          <section className="panel p-4 sm:p-5" aria-labelledby="recipient-heading">
            <p className="label-caps">Step 1</p>
            <h2 id="recipient-heading" className="mt-1 font-semibold">
              Target recipient candidate
            </h2>
            <div className="mt-4 space-y-2">
              <Label>Candidate</Label>
              <Select value={selectedCandidate?.id ?? ""} onValueChange={setCandidateId}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={isLoading ? "Loading candidates…" : "Select a candidate"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.full_name} · {candidateRole(candidate)} ·{" "}
                      {STAGE_LABELS[candidate.stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCandidate ? (
              <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {initials || "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedCandidate.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedCandidate.email}
                  </p>
                </div>
                <Badge variant="outline" className="ml-auto shrink-0">
                  {STAGE_LABELS[selectedCandidate.stage]}
                </Badge>
              </div>
            ) : null}

            {selectedCandidate?.interview_confirmed_at ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-primary">
                <Check className="size-3.5" />
                Attendance confirmed on{" "}
                {format(new Date(selectedCandidate.interview_confirmed_at), "d MMM yyyy, h:mm a")}
              </p>
            ) : null}
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="template-heading">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="label-caps">Step 2</p>
                <h2 id="template-heading" className="mt-1 font-semibold">
                  Select email template
                </h2>
              </div>
              <Badge variant="outline">4 templates</Badge>
            </div>
            <div className="space-y-2">
              {TEMPLATES.map((template) => (
                <Button
                  key={template.id}
                  variant="outline"
                  onClick={() => selectTemplate(template.id)}
                  className={cn(
                    "h-auto w-full justify-between whitespace-normal px-3 py-3 text-left",
                    template.id === templateId &&
                      "border-primary bg-primary/10 text-foreground shadow-glow",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{template.label}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {template.description}
                    </span>
                  </span>
                  <Badge variant="secondary" className="ml-3 shrink-0">
                    {template.shortLabel}
                  </Badge>
                </Button>
              ))}
            </div>

            {selectedTemplate.needsSchedule ? (
              <div className="mt-5 space-y-4 border-t border-border pt-4">
                <p className="label-caps">Interview or screening schedule</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start font-normal">
                          <CalendarDays className="size-4 text-muted-foreground" />
                          {format(date, "dd MMM yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(nextDate) => nextDate && setDate(nextDate)}
                          className="pointer-events-auto p-3"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dispatch-time">Time</Label>
                    <div className="relative">
                      <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="dispatch-time"
                        type="time"
                        value={time}
                        onChange={(event) => setTime(event.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meeting-link">Meeting link or location</Label>
                  <Input
                    id="meeting-link"
                    value={meetingLink}
                    onChange={(event) => setMeetingLink(event.target.value)}
                    placeholder="Add a video link or office address"
                  />
                </div>
              </div>
            ) : null}
          </section>

          <SenderDnsStatus />

          <section className="panel border-primary/30 p-4 sm:p-5" aria-labelledby="bulk-heading">
            <div className="flex items-center gap-2 text-primary">
              <Users className="size-4" />
              <h2 id="bulk-heading" className="text-sm font-semibold">
                Matching Candidates Summary
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {eligibleCandidates.length}{" "}
              {eligibleCandidates.length === 1 ? "candidate matches" : "candidates match"} the{" "}
              {selectedTemplate.shortLabel.toLowerCase()} stage criteria.
            </p>
            <div className="mt-3 rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              Viewing personalized email template preview for {eligibleCandidates.length} matching candidate{eligibleCandidates.length === 1 ? "" : "s"}.
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="panel overflow-hidden" aria-labelledby="editor-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
                <Pencil className="size-4 text-primary" />
                <h2 id="editor-heading" className="font-semibold">
                  Custom email content
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
                >
                  {mode === "edit" ? <Eye className="size-4" /> : <Pencil className="size-4" />}
                  {mode === "edit" ? "Preview" : "Edit"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={resetTemplate}
                  title="Reset template"
                  aria-label="Reset template"
                >
                  <RotateCcw className="size-4" />
                </Button>
                <Button size="sm" onClick={saveTemplate}>
                  <Save className="size-4" />
                  Save template
                </Button>
              </div>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Recipient:{" "}
                  <strong className="font-medium text-foreground">
                    {selectedCandidate?.full_name ?? "No candidate selected"}
                  </strong>
                  {selectedCandidate?.email ? ` (${selectedCandidate.email})` : ""}
                </span>
                <span className="flex items-center gap-1 text-primary">
                  {mode === "edit" ? <Pencil className="size-3" /> : <Eye className="size-3" />}
                  {mode === "edit" ? "Editing active" : "Preview mode"}
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-subject" className="label-caps">
                  Subject line
                </Label>
                {mode === "edit" ? (
                  <Input
                    id="email-subject"
                    value={subject}
                    onChange={(event) => changeSubject(event.target.value)}
                  />
                ) : (
                  <div className="rounded-md border border-border bg-secondary/40 px-3 py-3 text-sm font-semibold">
                    {subject}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-body" className="label-caps">
                  Email body
                </Label>
                {mode === "edit" ? (
                  <Textarea
                    id="email-body"
                    value={body}
                    onChange={(event) => changeBody(event.target.value)}
                    className="min-h-80 resize-y leading-6"
                    spellCheck
                  />
                ) : (
                  <div className="min-h-80 whitespace-pre-wrap rounded-md border border-border bg-secondary/40 p-4 text-sm leading-6">
                    {body}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Personalized for {values.name}. The confirm-attendance link in this email is live
                  — opening it records the candidate&apos;s confirmation and shows it on the
                  calendar.
                  {selectedCandidate?.interview_confirm_token ? (
                    <>
                      {" "}
                      <a
                        href={`/confirm/${selectedCandidate.interview_confirm_token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Open the confirmation page
                      </a>
                    </>
                  ) : null}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(`Subject: ${subject}\n\n${body}`)
                      .then(() => toast.success("Email subject & body copied to clipboard!"))
                      .catch(() => toast.error("Could not copy to clipboard."));
                  }}
                >
                  <Copy className="size-4" />
                  Copy Email Content
                </Button>
              </div>
            </div>
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="history-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-primary" />
                <h2 id="history-heading" className="font-semibold">
                  Email delivery history
                </h2>
              </div>
              <Badge variant="outline">This session</Badge>
            </div>
            {history.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-border p-6 text-center">
                <Mail className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No dispatches yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sent emails will appear here for the current session.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-md border border-border bg-secondary/30 p-3 sm:flex-row sm:items-center"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.recipients}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.subject}</p>
                    </div>
                    <div className="flex items-center gap-2 sm:block sm:text-right">
                      <Badge variant="secondary">{item.kind}</Badge>
                      <p className="text-xs text-muted-foreground sm:mt-1">
                        {format(item.sentAt, "h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
