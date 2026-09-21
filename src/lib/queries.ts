import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Stage } from "@/lib/hr";
import type { AtsBreakdownItem, ResumeParsed } from "@/lib/ats.functions";

export type Job = {
  id: string;
  job_code: string | null;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string;
  description: string | null;
  required_skills: string[];
  preferred_skills: string[];
  min_experience_years: number | null;
  max_experience_years: number | null;
  education_requirement: string | null;
  application_deadline: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
};

export type Candidate = {
  id: string;
  job_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  applied_role: string | null;
  resume_text: string | null;
  ats_score: number | null;
  ats_summary: string | null;
  ats_strengths: string[];
  ats_gaps: string[];
  ats_scored_at: string | null;
  stage: Stage;
  notes: string | null;
  shortlist_email_status: string;
  shortlist_email_sent_at: string | null;
  interview_at: string | null;
  interviewer: string | null;
  interview_location: string | null;
  interview_email_status: string;
  interview_email_sent_at: string | null;
  interview_confirm_token: string | null;
  interview_confirmed_at: string | null;
  outcome: string;
  outcome_at: string | null;
  outcome_notes: string | null;
  outcome_email_status: string;
  outcome_email_sent_at: string | null;
  ats_breakdown: AtsBreakdownItem[] | null;
  resume_parsed: ResumeParsed | null;
  source: string;
  auto_shortlisted: boolean;
  linkedin_url: string | null;

  application_code: string | null;
  source_post_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  years_experience: number | null;
  portfolio_url: string | null;
  cover_letter: string | null;
  resume_path: string | null;
  resume_file_name: string | null;
  resume_file_type: string | null;
  resume_uploaded_at: string | null;
  application_status: string;
  ats_status: string;
  ats_category: string | null;
  ats_error: string | null;
  ats_version: string | null;
  scoring_version: string | null;
  matched_required_skills: string[];
  missing_required_skills: string[];
  matched_preferred_skills: string[];
  missing_preferred_skills: string[];
  total_experience_years: number | null;
  relevant_experience_years: number | null;
  experience_match: string | null;
  education_match: string | null;
  keyword_score: number | null;

  created_at: string;
};

export type Alert = {
  id: string;
  candidate_id: string | null;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
};

/** The signed-in user's own profile row (name + email). */
export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as Profile | null;
      return {
        id: user.id,
        email: row?.email ?? user.email ?? null,
        full_name: row?.full_name ?? null,
      } satisfies Profile;
    },
  });
}

/** Unread alerts (strong LinkedIn matches auto-shortlisted by the AI screen). */
export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () =>
      unwrap<Alert[]>(
        (await supabase
          .from("alerts")
          .select("*")
          .eq("read", false)
          .order("created_at", { ascending: false })
          .limit(20)) as never,
      ),
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alerts").update({ read: true }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export type CandidateDocument = {
  id: string;
  candidate_id: string;
  doc_type: string;
  file_url: string | null;
  status: string;
  notes: string | null;
  verified_at: string | null;
  created_at: string;
};

export type StageEvent = {
  id: string;
  candidate_id: string;
  from_stage: string | null;
  to_stage: string;
  created_at: string;
};

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: async () =>
      unwrap<Job[]>(
        (await supabase
          .from("jobs")
          .select("*")
          .order("created_at", { ascending: false })) as never,
      ),
  });
}

export function useCandidates() {
  return useQuery({
    queryKey: ["candidates"],
    queryFn: async () =>
      unwrap<Candidate[]>(
        (await supabase
          .from("candidates")
          .select("*")
          .order("created_at", { ascending: false })) as never,
      ),
  });
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: ["candidate", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data as unknown as Candidate;
    },
  });
}

export function useCandidateDocuments(candidateId: string) {
  return useQuery({
    queryKey: ["documents", candidateId],
    queryFn: async () =>
      unwrap<CandidateDocument[]>(
        (await supabase
          .from("candidate_documents")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: true })) as never,
      ),
  });
}

export function useStageHistory(candidateId: string) {
  return useQuery({
    queryKey: ["stage-history", candidateId],
    queryFn: async () =>
      unwrap<StageEvent[]>(
        (await supabase
          .from("stage_history")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false })) as never,
      ),
  });
}

/**
 * Moves a candidate to a new stage, records the change, and queues the
 * pipeline stage and records the move in the candidate's history.
 */
export function useMoveStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ candidate, toStage }: { candidate: Candidate; toStage: Stage }) => {
      const patch = { stage: toStage };

      const { error } = await supabase.from("candidates").update(patch).eq("id", candidate.id);
      if (error) throw new Error(error.message);

      const { data: session } = await supabase.auth.getUser();
      await supabase.from("stage_history").insert({
        candidate_id: candidate.id,
        from_stage: candidate.stage,
        to_stage: toStage,
        changed_by: session.user?.id ?? null,
      });

      return { toStage };
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", variables.candidate.id] });
      queryClient.invalidateQueries({ queryKey: ["stage-history", variables.candidate.id] });
    },
  });
}

/** Upcoming interviews, soonest first. */
export function useUpcomingInterviews() {
  return useQuery({
    queryKey: ["interviews"],
    queryFn: async () =>
      unwrap<Candidate[]>(
        (await supabase
          .from("candidates")
          .select("*")
          .not("interview_at", "is", null)
          .order("interview_at", { ascending: true })) as never,
      ),
  });
}

/**
 * Saves interview date/time, interviewer and location for a candidate, moves
 * them to the interview stage and queues the confirmation email.
 */
export function useScheduleInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidate,
      interviewAt,
      interviewer,
      location,
    }: {
      candidate: Candidate;
      interviewAt: string;
      interviewer: string;
      location: string;
    }) => {
      const { error } = await supabase
        .from("candidates")
        .update({
          interview_at: new Date(interviewAt).toISOString(),
          interviewer,
          interview_location: location,

          stage: "interview",
        })
        .eq("id", candidate.id);
      if (error) throw new Error(error.message);

      if (candidate.stage !== "interview") {
        const { data: session } = await supabase.auth.getUser();
        await supabase.from("stage_history").insert({
          candidate_id: candidate.id,
          from_stage: candidate.stage,
          to_stage: "interview",
          changed_by: session.user?.id ?? null,
        });
      }
    },
    onSuccess: (_r, variables) => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", variables.candidate.id] });
      queryClient.invalidateQueries({ queryKey: ["stage-history", variables.candidate.id] });
    },
  });
}

/**
 * Records the interview outcome (hired or rejected), moves the candidate to the
 * hiring stage when hired.
 */
export function useSetOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidate,
      outcome,
      notes,
    }: {
      candidate: Candidate;
      outcome: "hired" | "rejected";
      notes: string;
    }) => {
      const nextStage: Stage = outcome === "hired" ? "hired" : "rejected";
      const patch = {
        outcome,
        outcome_at: new Date().toISOString(),
        outcome_notes: notes || null,
        stage: nextStage,
      };
      const { error } = await supabase.from("candidates").update(patch).eq("id", candidate.id);
      if (error) throw new Error(error.message);

      if (candidate.stage !== nextStage) {
        const { data: session } = await supabase.auth.getUser();
        await supabase.from("stage_history").insert({
          candidate_id: candidate.id,
          from_stage: candidate.stage,
          to_stage: nextStage,
          changed_by: session.user?.id ?? null,
        });
      }
    },
    onSuccess: (_r, variables) => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", variables.candidate.id] });
      queryClient.invalidateQueries({ queryKey: ["stage-history", variables.candidate.id] });
    },
  });
}

/**
 * Moves an interview to a different date, keeping the time of day, interviewer
 * and location intact. Used by drag-and-drop on the interview calendar.
 */
export function useRescheduleInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ candidate, day }: { candidate: Candidate; day: Date }) => {
      const current = candidate.interview_at ? new Date(candidate.interview_at) : new Date();
      const next = new Date(day);
      next.setHours(current.getHours(), current.getMinutes(), 0, 0);

      const { error } = await supabase
        .from("candidates")
        .update({ interview_at: next.toISOString() })
        .eq("id", candidate.id);
      if (error) throw new Error(error.message);
      return next;
    },
    onSuccess: (_r, variables) => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", variables.candidate.id] });
    },
  });
}
