import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentStatus, AppointmentType, SchedulingSettings } from "./core";

export type Appointment = {
  id: string;
  candidate_id: string;
  job_id: string | null;
  application_code: string | null;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  appointment_type: AppointmentType;
  duration_minutes: number;
  start_at: string;
  end_at: string;
  timezone: string;
  status: AppointmentStatus;
  meeting_url: string | null;
  interviewer: string | null;
  notes: string | null;
  booked_by: string;
  candidate_notified: boolean;
  hr_notified: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  rescheduled_from: string | null;
  rescheduled_to: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentTypeRow = {
  code: AppointmentType;
  title: string;
  description: string | null;
  duration_minutes: number;
  active: boolean;
  sort_order: number;
};

export type BlockedTimeRow = {
  id: string;
  block_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
};

const APPOINTMENT_COLUMNS =
  "id, candidate_id, job_id, application_code, candidate_name, candidate_email, candidate_phone, appointment_type, duration_minutes, start_at, end_at, timezone, status, meeting_url, interviewer, notes, booked_by, candidate_notified, hr_notified, cancelled_at, cancellation_reason, rescheduled_from, rescheduled_to, created_at, updated_at";

/** Team scheduling settings (single configuration row). */
export function useSchedulingSettings() {
  return useQuery({
    queryKey: ["scheduling-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduling_settings")
        .select(
          "timezone, working_days, work_start, work_end, break_start, break_end, allow_candidate_reschedule, min_notice_minutes, booking_horizon_days, default_meeting_url, interviewer_name",
        )
        .eq("id", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as SchedulingSettings | null) ?? null;
    },
  });
}

export function useUpdateSchedulingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<SchedulingSettings>) => {
      const { error } = await supabase.from("scheduling_settings").update(patch).eq("id", true);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduling-settings"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useAppointmentTypes() {
  return useQuery({
    queryKey: ["appointment-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_types")
        .select("code, title, description, duration_minutes, active, sort_order")
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as AppointmentTypeRow[];
    },
  });
}

/** All appointments, newest first. Filtered client-side for calendar views. */
export function useAppointments() {
  return useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(APPOINTMENT_COLUMNS)
        .order("start_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Appointment[];
    },
  });
}

export function useCandidateAppointments(candidateId: string | undefined) {
  return useQuery({
    enabled: Boolean(candidateId),
    queryKey: ["appointments", "candidate", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(APPOINTMENT_COLUMNS)
        .eq("candidate_id", candidateId!)
        .order("start_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Appointment[];
    },
  });
}

export function useBlockedTimes() {
  return useQuery({
    queryKey: ["blocked-times"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_blocked_times")
        .select("id, block_date, all_day, start_time, end_time, reason, created_at")
        .order("block_date", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as BlockedTimeRow[];
    },
  });
}

export function useAddBlockedTime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      block_date: string;
      all_day: boolean;
      start_time?: string | null;
      end_time?: string | null;
      reason?: string | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("hr_blocked_times").insert({
        block_date: input.block_date,
        all_day: input.all_day,
        start_time: input.all_day ? null : (input.start_time ?? null),
        end_time: input.all_day ? null : (input.end_time ?? null),
        reason: input.reason ?? null,
        created_by: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocked-times"] });
    },
  });
}

export function useRemoveBlockedTime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_blocked_times").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocked-times"] });
    },
  });
}

/** Marks an appointment completed or as a no-show (history is preserved). */
export function useSetAppointmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useUpdateAppointmentMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, meeting_url }: { id: string; meeting_url: string | null }) => {
      const { error } = await supabase.from("appointments").update({ meeting_url }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}
