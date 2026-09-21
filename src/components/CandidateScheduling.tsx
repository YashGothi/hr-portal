import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CheckCircle2, Copy, Link2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ensureSchedulingInvite,
  hrCancelAppointment,
  hrCompleteAppointment,
  hrResendSchedulingEmail,
} from "@/lib/scheduling.functions";
import { useCandidateAppointments, type Appointment } from "@/lib/scheduling/queries";
import {
  APPOINTMENT_STATUS_LABELS,
  formatDateIn,
  formatTimeIn,
  timezoneAbbreviation,
  type AppointmentType,
} from "@/lib/scheduling/core";
import { icsDataHref } from "@/lib/scheduling/ics";
import { InterviewEmailPreview } from "@/components/InterviewEmailPreview";
import { SHORTLIST_THRESHOLD } from "@/lib/ats/weights";

const TYPE_LABEL: Record<AppointmentType, string> = {
  SCREENING: "Screening Call",
  INTERVIEW: "Interview Call",
};

function scheduleUrl(token: string, type: AppointmentType) {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  return `${base}/schedule/${token}?type=${type.toLowerCase()}`;
}

/** Screening + interview scheduling for one candidate, inside the HR portal. */
export function CandidateScheduling({
  candidateId,
  candidateName,
  role,
  atsScore,
  applicationStatus,
  stage: _stage,
}: {
  candidateId: string;
  candidateName: string;
  role: string | null;
  atsScore?: number | null;
  applicationStatus?: string | null;
  stage?: string | null;
}) {
  const queryClient = useQueryClient();
  const appointments = useCandidateAppointments(candidateId);
  const [links, setLinks] = useState<Partial<Record<AppointmentType, string>>>({});

  const createInvite = useServerFn(ensureSchedulingInvite);
  const cancelAppointment = useServerFn(hrCancelAppointment);
  const completeAppointment = useServerFn(hrCompleteAppointment);
  const resendEmail = useServerFn(hrResendSchedulingEmail);

  const resendMutation = useMutation({
    mutationFn: async (appointmentId: string) => resendEmail({ data: { appointmentId } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      if (result.sent) {
        toast.success("Scheduling email sent again");
      } else {
        toast.error("Email not delivered", {
          description: result.reason ?? "Sending is not available yet.",
        });
      }
    },
    onError: () => toast.error("Could not resend the scheduling email"),
  });

  const inviteMutation = useMutation({
    mutationFn: async (appointmentType: AppointmentType) =>
      createInvite({ data: { candidateId, appointmentType } }),
    onSuccess: (result) => {
      const url = scheduleUrl(result.token, result.appointmentType as AppointmentType);
      setLinks((current) => ({ ...current, [result.appointmentType]: url }));
      void navigator.clipboard?.writeText(url).catch(() => undefined);
      toast.success("Scheduling link ready", { description: "Copied to your clipboard." });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Could not create the scheduling link";
      toast.error(msg);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => cancelAppointment({ data: { appointmentId } }),
    onSuccess: () => {
      toast.success("Appointment cancelled", { description: "The time slot is available again." });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: () => toast.error("Could not cancel the appointment"),
  });

  const completeMutation = useMutation({
    mutationFn: async (appointmentId: string) => completeAppointment({ data: { appointmentId } }),
    onSuccess: () => {
      toast.success("Interview completed", {
        description: "Candidate and appointment status updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Could not complete the appointment";
      toast.error("Failed to complete appointment", { description: msg });
    },
  });

  const rows = appointments.data ?? [];
  const booked = (type: AppointmentType) =>
    rows.find((row) => row.appointment_type === type && row.status === "BOOKED") ?? null;

  function renderSection(type: AppointmentType) {
    const appointment = booked(type);
    const history = rows.filter((row) => row.appointment_type === type && row.status !== "BOOKED");
    const link = links[type];

    const isInterviewFiltered =
      type === "INTERVIEW" &&
      ((atsScore != null && atsScore < SHORTLIST_THRESHOLD) ||
        applicationStatus === "filtered_out");

    let statusLabel = "Not scheduled";
    let badgeClass = "border-border bg-secondary text-muted-foreground";

    if (isInterviewFiltered) {
      statusLabel = "Filtered Out";
      badgeClass = "border-destructive/40 bg-destructive/15 text-destructive";
    } else if (appointment) {
      statusLabel =
        type === "INTERVIEW" && appointment.status === "BOOKED"
          ? "Interview Sent"
          : (APPOINTMENT_STATUS_LABELS[
              appointment.status as keyof typeof APPOINTMENT_STATUS_LABELS
            ] ?? "Scheduled");
      badgeClass = "border-success/40 bg-success/15 text-success";
    } else if (type === "INTERVIEW" && applicationStatus === "interview_scheduled") {
      statusLabel = "Interview Sent";
      badgeClass = "border-success/40 bg-success/15 text-success";
    } else if (history.length > 0 && history[0]) {
      const recent = history[0];
      statusLabel =
        APPOINTMENT_STATUS_LABELS[recent.status as keyof typeof APPOINTMENT_STATUS_LABELS] ??
        "Completed";
      badgeClass =
        recent.status === "COMPLETED"
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-warning/40 bg-warning/15 text-warning";
    } else if (applicationStatus === "interview_invited" || link) {
      statusLabel = "Invitation Created";
      badgeClass = "border-primary/40 bg-primary/10 text-primary";
    } else {
      statusLabel = "Not Invited";
      badgeClass = "border-border bg-secondary text-muted-foreground";
    }

    return (
      <div key={type} className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{TYPE_LABEL[type]}</h4>
          <Badge variant="outline" className={badgeClass}>
            {statusLabel}
          </Badge>
        </div>

        {isInterviewFiltered ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Interview scheduling unavailable for candidates who did not meet the ATS shortlist
            threshold.
          </p>
        ) : appointment ? (
          <AppointmentDetails
            appointment={appointment}
            candidateName={candidateName}
            role={role}
            onCancel={() => cancelMutation.mutate(appointment.id)}
            cancelling={cancelMutation.isPending}
            onResend={() => resendMutation.mutate(appointment.id)}
            resending={resendMutation.isPending}
            onComplete={() => completeMutation.mutate(appointment.id)}
            completing={completeMutation.isPending}
          />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Send the candidate a secure link and they pick a time from your live availability.
          </p>
        )}

        {!isInterviewFiltered && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={appointment ? "outline" : "default"}
              disabled={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate(type)}
            >
              <Link2 className="size-4" />
              {appointment
                ? "Copy reschedule link"
                : type === "SCREENING"
                  ? "Invite to screening"
                  : "Invite to interview"}
            </Button>
            {link ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  toast.success("Link copied");
                }}
              >
                <Copy className="size-4" /> Copy again
              </Button>
            ) : null}
            {type === "INTERVIEW" ? <InterviewEmailPreview candidateId={candidateId} /> : null}
          </div>
        )}

        {!isInterviewFiltered && link ? (
          <p className="mt-2 break-all text-xs text-muted-foreground">{link}</p>
        ) : null}

        {history.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {history.map((row) => (
              <li key={row.id}>
                {APPOINTMENT_STATUS_LABELS[row.status]} · {formatDateIn(row.start_at, row.timezone)}{" "}
                at {formatTimeIn(row.start_at, row.timezone)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <section className="panel p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="size-4" /> Scheduling
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        You decide when a candidate can book — screening first, interview only when you invite them.
      </p>
      <div className="mt-4 space-y-3">
        {renderSection("SCREENING")}
        {renderSection("INTERVIEW")}
      </div>
    </section>
  );
}

function AppointmentDetails({
  appointment,
  candidateName,
  role,
  onCancel,
  cancelling,
  onResend,
  resending,
  onComplete,
  completing,
}: {
  appointment: Appointment;
  candidateName: string;
  role: string | null;
  onCancel: () => void;
  cancelling: boolean;
  onResend: () => void;
  resending: boolean;
  onComplete?: () => void;
  completing?: boolean;
}) {
  const ics = icsDataHref({
    uid: appointment.id,
    title: `${TYPE_LABEL[appointment.appointment_type]} – ${candidateName}${role ? ` – ${role}` : ""}`,
    startAt: appointment.start_at,
    endAt: appointment.end_at,
    timezone: appointment.timezone,
    description: `${TYPE_LABEL[appointment.appointment_type]} with ${candidateName}.`,
    location: appointment.meeting_url ?? "To be shared",
    organizer: "Seceon Talent Acquisition",
  });

  const duration = appointment.duration_minutes || 30;

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p>
        {formatDateIn(appointment.start_at, appointment.timezone)} ·{" "}
        <span className="font-medium text-foreground">{duration} mins</span>
      </p>
      <p>
        {formatTimeIn(appointment.start_at, appointment.timezone)} –{" "}
        {formatTimeIn(appointment.end_at, appointment.timezone)}{" "}
        <span className="text-muted-foreground">
          ({timezoneAbbreviation(appointment.timezone, new Date(appointment.start_at))})
        </span>
      </p>
      {appointment.meeting_url ? (
        <a
          href={appointment.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block break-all text-xs text-primary underline"
        >
          {appointment.meeting_url}
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">No meeting link added yet.</p>
      )}
      <p className="text-xs text-muted-foreground">
        {appointment.candidate_notified
          ? "Confirmation email delivered."
          : "Confirmation email not delivered yet."}
      </p>
      <div className="flex flex-wrap gap-2 pt-2">
        {appointment.status === "BOOKED" && onComplete ? (
          <Button
            size="sm"
            variant="outline"
            disabled={completing}
            onClick={onComplete}
            className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            <CheckCircle2 className="size-4" /> Mark completed
          </Button>
        ) : null}
        <Button size="sm" variant="outline" asChild>
          <a href={ics} download="appointment.ics">
            Add to calendar
          </a>
        </Button>
        <Button size="sm" variant="outline" disabled={resending} onClick={onResend}>
          <Send className="size-4" /> Resend email
        </Button>
        <Button size="sm" variant="ghost" disabled={cancelling} onClick={onCancel}>
          <X className="size-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}
