/**
 * Single source of the interview invitation wording. Shared by the HR preview
 * panel and the branded email template, so both always match.
 */
export const COMPANY_NAME = "Seceon";

/** Interview length, in minutes, quoted in the invitation. */
export const INTERVIEW_DURATION_MINUTES = 30;

export type InterviewInvitationInput = {
  candidateName: string;
  jobTitle: string | null;
  schedulingUrl: string;
  companyName?: string;
};

export function interviewInvitationSubject(input: InterviewInvitationInput) {
  return `Interview Invitation — ${input.jobTitle ?? "Open Position"}`;
}

export function interviewInvitationBody(input: InterviewInvitationInput) {
  const company = input.companyName ?? COMPANY_NAME;
  const role = input.jobTitle ?? "the position";
  return `Hi ${input.candidateName},

Thank you for your interest in the ${role} position at ${company}.

We are pleased to inform you that your application has progressed to the interview stage.

Please use the link below to select a convenient time for your interview:

${input.schedulingUrl}

The interview will be approximately ${INTERVIEW_DURATION_MINUTES} minutes.

Available interview times are based on the HR team's current availability. If HR is unavailable or a time slot has already been booked, that slot will not be available for selection.

Please select a suitable time at your earliest convenience.

Best regards,
HR Team
${company}`;
}

export function buildInterviewInvitationEmail(input: InterviewInvitationInput) {
  return {
    subject: interviewInvitationSubject(input),
    body: interviewInvitationBody(input),
  };
}
