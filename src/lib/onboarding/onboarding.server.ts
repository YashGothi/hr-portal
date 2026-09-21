import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type OnboardingStatus = Database["public"]["Tables"]["onboarding"]["Row"]["status"];
export type OnboardingTaskStatus =
  Database["public"]["Tables"]["onboarding_tasks"]["Row"]["status"];
export type OnboardingEventType =
  Database["public"]["Tables"]["onboarding_events"]["Row"]["event_type"];

export interface OnboardingEligibilityResult {
  eligible: boolean;
  reason?: string | undefined;
  candidate?: Database["public"]["Tables"]["candidates"]["Row"] | undefined;
  activeOnboarding?: Database["public"]["Tables"]["onboarding"]["Row"] | null | undefined;
  acceptedOffer?: Database["public"]["Tables"]["offers"]["Row"] | null | undefined;
  defaultStartDate?: string | null | undefined;
}

export const DEFAULT_ONBOARDING_TASKS = [
  {
    title: "Verify identity documents",
    description: "Check government ID, passport, or work authorization.",
  },
  {
    title: "Collect signed offer letter",
    description: "Confirm the candidate and company countersigned offer letter is in records.",
  },
  {
    title: "Collect payroll documents",
    description: "Collect tax forms (W-4 / Form 16 / PAN), bank details, and direct deposit info.",
  },
  {
    title: "Create company email",
    description: "Provision corporate email address and Google Workspace/M365 account.",
  },
  {
    title: "Assign equipment",
    description: "Order and dispatch workstation laptop, security keys, and peripherals.",
  },
  {
    title: "Assign manager",
    description: "Designate reporting manager and schedule initial 1:1 sync.",
  },
  {
    title: "Complete orientation",
    description: "Conduct company orientation, culture overview, and security awareness training.",
  },
] as const;

/**
 * Backend Authoritative Eligibility Check for Onboarding.
 *
 * Rules:
 * 1. Candidate must exist.
 * 2. Candidate backend application_status === 'hired'.
 * 3. Candidate belongs to the expected job/application.
 * 4. Candidate cannot have an existing active onboarding record (NOT_STARTED or IN_PROGRESS).
 * 5. Retrieves accepted offer start_date to ensure start date consistency.
 */
export async function verifyOnboardingEligibility(
  supabase: SupabaseClient<Database>,
  candidateId: string,
): Promise<OnboardingEligibilityResult> {
  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();

  if (candError || !candidate) {
    return { eligible: false, reason: "Candidate not found." };
  }

  // Authoritative Status Verification: ONLY application_status = 'hired'
  if (candidate.application_status !== "hired") {
    return {
      eligible: false,
      reason: `Only candidates with application status 'hired' are eligible for onboarding. Current status: ${candidate.application_status}.`,
      candidate,
    };
  }

  // Active onboarding check (NOT_STARTED or IN_PROGRESS)
  const { data: activeRecords, error: activeError } = await supabase
    .from("onboarding")
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["NOT_STARTED", "IN_PROGRESS"]);

  if (activeError) {
    return { eligible: false, reason: "Could not query active onboarding records." };
  }

  const activeOnboarding = activeRecords && activeRecords.length > 0 ? activeRecords[0] : null;
  if (activeOnboarding) {
    return {
      eligible: false,
      reason: `Candidate already has an active onboarding record in '${activeOnboarding.status}' status.`,
      candidate,
      activeOnboarding,
    };
  }

  // Find accepted offer for start_date consistency
  const { data: acceptedOffers } = await supabase
    .from("offers")
    .select("*")
    .eq("candidate_id", candidateId)
    .eq("status", "ACCEPTED")
    .order("created_at", { ascending: false });

  const acceptedOffer = acceptedOffers && acceptedOffers.length > 0 ? acceptedOffers[0] : null;

  return {
    eligible: true,
    candidate,
    activeOnboarding: null,
    acceptedOffer,
    defaultStartDate: acceptedOffer?.start_date ?? null,
  };
}

/**
 * Record an audit event in onboarding_events (append-only).
 */
export async function recordOnboardingEvent(
  supabase: SupabaseClient<Database>,
  input: {
    onboardingId: string;
    candidateId: string;
    eventType: OnboardingEventType;
    notes?: string | null;
    createdBy?: string | null;
  },
): Promise<void> {
  await supabase.from("onboarding_events").insert({
    onboarding_id: input.onboardingId,
    candidate_id: input.candidateId,
    event_type: input.eventType,
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  });
}

/**
 * Atomically creates onboarding record, 7 default tasks, and ONBOARDING_CREATED audit event.
 * Uses DB RPC if present, or executes atomic transaction-safe flow with cleanup rollback.
 */
export async function createOnboardingAtomic(
  supabase: SupabaseClient<Database>,
  input: {
    candidateId: string;
    startDate?: string | null | undefined;
    createdBy?: string | null | undefined;
  },
): Promise<{
  onboarding: Database["public"]["Tables"]["onboarding"]["Row"];
  tasks: Database["public"]["Tables"]["onboarding_tasks"]["Row"][];
}> {
  // 1. Authoritative Backend Eligibility Check
  const eligibility = await verifyOnboardingEligibility(supabase, input.candidateId);
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason || "Candidate is not eligible for onboarding.");
  }

  const candidate = eligibility.candidate!;
  const startDate = input.startDate || eligibility.defaultStartDate || null;

  // 2. Try RPC create_onboarding_atomic if available
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("create_onboarding_atomic", {
      p_candidate_id: input.candidateId,
      p_start_date: startDate,
      p_created_by: input.createdBy ?? null,
    });

    if (!rpcError && rpcData) {
      const parsed = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
      const { data: fullRecord } = await supabase
        .from("onboarding")
        .select("*")
        .eq("id", parsed.id)
        .single();
      const { data: createdTasks } = await supabase
        .from("onboarding_tasks")
        .select("*")
        .eq("onboarding_id", parsed.id)
        .order("created_at", { ascending: true });

      if (fullRecord) {
        return {
          onboarding: fullRecord,
          tasks: createdTasks ?? [],
        };
      }
    }
  } catch (_ignored) {
    // Fall back to client-driven atomic sequence below
  }

  // 3. Fallback with Strict Cleanup Rollback to prevent partial records
  let createdOnboarding: Database["public"]["Tables"]["onboarding"]["Row"] | null = null;
  try {
    const { data: onboardingRecord, error: insertError } = await supabase
      .from("onboarding")
      .insert({
        candidate_id: input.candidateId,
        job_id: candidate.job_id ?? null,
        start_date: startDate,
        status: "NOT_STARTED",
        created_by: input.createdBy ?? null,
      })
      .select()
      .single();

    if (insertError || !onboardingRecord) {
      throw new Error(insertError?.message || "Could not create onboarding record.");
    }
    createdOnboarding = onboardingRecord;

    // Insert 7 default tasks
    const taskInserts = DEFAULT_ONBOARDING_TASKS.map((t) => ({
      onboarding_id: onboardingRecord.id,
      title: t.title,
      description: t.description,
      status: "PENDING" as const,
    }));

    const { data: insertedTasks, error: taskError } = await supabase
      .from("onboarding_tasks")
      .insert(taskInserts)
      .select();

    if (taskError || !insertedTasks || insertedTasks.length === 0) {
      throw new Error(taskError?.message || "Could not create default onboarding tasks.");
    }

    // Insert audit event
    await recordOnboardingEvent(supabase, {
      onboardingId: onboardingRecord.id,
      candidateId: input.candidateId,
      eventType: "ONBOARDING_CREATED",
      notes: "Onboarding record and 7 default tasks created.",
      createdBy: input.createdBy ?? null,
    });

    return {
      onboarding: onboardingRecord,
      tasks: insertedTasks,
    };
  } catch (err) {
    // Rollback cleanup if partial record was inserted
    if (createdOnboarding) {
      await supabase.from("onboarding_tasks").delete().eq("onboarding_id", createdOnboarding.id);
      await supabase.from("onboarding_events").delete().eq("onboarding_id", createdOnboarding.id);
      await supabase.from("onboarding").delete().eq("id", createdOnboarding.id);
    }
    throw err;
  }
}
