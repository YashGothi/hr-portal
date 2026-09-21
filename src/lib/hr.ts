export const STAGES = [
  "application",
  "screening",
  "shortlisted",
  "doc_verification",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  application: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  doc_verification: "Doc Verification",
  interview: "Interview",
  offer: "Email sent",
  hired: "Accepted",
  rejected: "Rejected",
};

/** Columns shown on the Kanban board (Doc Verification is not a board column). */
export const PIPELINE_STAGES = [
  "application",
  "screening",
  "shortlisted",
  "interview",
] as const satisfies readonly Stage[];

/** Final outcomes, grouped under a single "Status" column. */
export const STATUS_STAGES = ["hired", "rejected"] as const satisfies readonly Stage[];

/** Stages a candidate can be moved to from the UI. */
export const SELECTABLE_STAGES = [...PIPELINE_STAGES, ...STATUS_STAGES, "offer"] as const;

/** Badge classes per stage, built from semantic tokens only. */
export const STAGE_BADGE: Record<Stage, string> = {
  application: "border-border bg-secondary text-foreground",
  screening: "border-primary/40 bg-primary/15 text-primary",
  shortlisted: "border-success/40 bg-success/15 text-success",
  doc_verification: "border-warning/40 bg-warning/15 text-warning",
  interview: "border-chart-4/50 bg-chart-4/15 text-chart-4",
  offer: "border-primary/50 bg-primary/20 text-primary",
  hired: "border-success/50 bg-success/25 text-success",
  rejected: "border-destructive/40 bg-destructive/15 text-destructive",
};

export const DOC_TYPES = [
  "Resume / CV",
  "Government ID",
  "Education Certificate",
  "Experience Letter",
  "Offer / Salary Slip",
  "Background Check",
] as const;

export const DOC_STATUSES = ["pending", "verified", "rejected"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export function scoreTone(score: number | null | undefined) {
  if (score == null) return "muted" as const;
  if (score >= 75) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "destructive" as const;
}
