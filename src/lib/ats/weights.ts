/**
 * Single source of truth for ATS scoring configuration.
 * Change the weights here — nothing else hard-codes them.
 */
export const SCORING_VERSION = "2.0.0";
export const ATS_VERSION = "ats-2026-09";

export const ATS_WEIGHTS = {
  requiredSkills: 35,
  relevantExperience: 25,
  technicalSkills: 15,
  education: 10,
  keywordMatch: 10,
  preferredSkills: 5,
} as const;

export type AtsWeightKey = keyof typeof ATS_WEIGHTS;

export const ATS_WEIGHT_LABELS: Record<AtsWeightKey, string> = {
  requiredSkills: "Required skills",
  relevantExperience: "Relevant experience",
  technicalSkills: "Additional technical & professional skills",
  education: "Education",
  keywordMatch: "Job description match",
  preferredSkills: "Preferred skills",
};

export const ATS_MAX_SCORE = Object.values(ATS_WEIGHTS).reduce((sum, n) => sum + n, 0);

export const ATS_CATEGORIES = [
  { min: 80, label: "Strong Match" },
  { min: 60, label: "Good Match" },
  { min: 40, label: "Partial Match" },
  { min: 0, label: "Low Match" },
] as const;

export type AtsCategory = (typeof ATS_CATEGORIES)[number]["label"];

export function atsCategory(score: number | null | undefined): AtsCategory | null {
  if (score == null || !Number.isFinite(score)) return null;
  const found = ATS_CATEGORIES.find((c) => score >= c.min);
  return (found ?? ATS_CATEGORIES[ATS_CATEGORIES.length - 1]!).label;
}

export const ATS_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type AtsStatus = (typeof ATS_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "applied",
  "resume_uploaded",
  "processing",
  "ats_evaluated",
  "shortlisted",
  "filtered_out",
  "interview_invited",
  "interview_scheduled",
  "interview_completed",
  "rejected",
  "interview",
  "hired",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  resume_uploaded: "Resume Uploaded",
  processing: "ATS Processing",
  ats_evaluated: "ATS Evaluated",
  shortlisted: "Shortlisted",
  filtered_out: "Filtered Out",
  interview_invited: "Interview Invited",
  interview_scheduled: "Interview Sent",
  interview_completed: "Interview Completed",
  rejected: "Rejected",
  interview: "Interview",
  hired: "Hired",
};

/**
 * Automatic shortlisting threshold. Inclusive: exactly 85 is shortlisted.
 * The decision itself is always made on the server.
 */
export const SHORTLIST_THRESHOLD = 85;

/** Statuses that may open an interview scheduling link. */
export const INTERVIEW_ELIGIBLE_STATUSES = [
  "shortlisted",
  "interview_invited",
  "interview_scheduled",
  "interview_completed",
] as const;

export function shortlistDecision(
  score: number | null | undefined,
): "shortlisted" | "filtered_out" | null {
  if (score == null || !Number.isFinite(score)) return null;
  return score >= SHORTLIST_THRESHOLD ? "shortlisted" : "filtered_out";
}

export const APPLICATION_SOURCES = [
  "LinkedIn",
  "Company Website",
  "Referral",
  "Indeed",
  "Other",
] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const RESUME_MAX_BYTES = 8 * 1024 * 1024;

export const RESUME_ACCEPTED = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;

export const NOT_IN_RESUME = "Not identified in the submitted resume";
