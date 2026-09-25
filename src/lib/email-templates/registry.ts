import type { ComponentType } from "react";
import { template as shortlistTemplate } from "./shortlist-invite";
import { template as interviewTemplate } from "./interview-invite";
import { template as interviewInvitationTemplate } from "./interview-invitation";
import { template as hiredTemplate } from "./hired";
import { template as rejectedTemplate } from "./rejected";
import { template as schedulingConfirmationTemplate } from "./scheduling-confirmation";
import { template as schedulingHrNoticeTemplate } from "./scheduling-hr-notice";
import { template as interviewReminderTemplate } from "./interview-reminder";
import { template as offerLetterTemplate } from "./offer-letter";
import { template as onboardingInvitationTemplate } from "./onboarding-invitation";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  shortlist: shortlistTemplate,
  interview: interviewTemplate,
  "interview-invitation": interviewInvitationTemplate,
  "offer-letter": offerLetterTemplate,
  "onboarding-invitation": onboardingInvitationTemplate,
  hired: hiredTemplate,
  rejected: rejectedTemplate,
  "scheduling-confirmation": schedulingConfirmationTemplate,
  "scheduling-hr-notice": schedulingHrNoticeTemplate,
  "interview-reminder": interviewReminderTemplate,
};
