import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createOnboardingAtomic,
  recordOnboardingEvent,
  verifyOnboardingEligibility,
} from "./onboarding/onboarding.server";

/**
 * Loads onboarding record, default tasks, audit events, and eligibility details for a candidate.
 */
export const getCandidateOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { candidateId: string }) => {
    return z.object({ candidateId: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const eligibility = await verifyOnboardingEligibility(context.supabase, data.candidateId);

    // Fetch the most relevant onboarding record (active first, else latest)
    const { data: onboardingList, error: onboardingError } = await context.supabase
      .from("onboarding")
      .select("*, jobs(id, title, department)")
      .eq("candidate_id", data.candidateId)
      .order("created_at", { ascending: false });

    if (onboardingError) {
      throw new Error("Could not load onboarding records for candidate.");
    }

    const currentOnboarding =
      (onboardingList ?? []).find(
        (o) => o.status === "NOT_STARTED" || o.status === "IN_PROGRESS",
      ) ??
      (onboardingList ?? [])[0] ??
      null;

    let tasks: Database["public"]["Tables"]["onboarding_tasks"]["Row"][] = [];
    let events: Database["public"]["Tables"]["onboarding_events"]["Row"][] = [];

    if (currentOnboarding) {
      const { data: tasksData } = await context.supabase
        .from("onboarding_tasks")
        .select("*")
        .eq("onboarding_id", currentOnboarding.id)
        .order("created_at", { ascending: true });
      tasks = tasksData ?? [];

      const { data: eventsData } = await context.supabase
        .from("onboarding_events")
        .select("*")
        .eq("onboarding_id", currentOnboarding.id)
        .order("created_at", { ascending: true });
      events = eventsData ?? [];
    }

    return {
      eligibility,
      onboarding: currentOnboarding,
      allOnboardings: onboardingList ?? [],
      tasks,
      events,
    };
  });

/**
 * Atomically creates onboarding record, 7 default tasks, and ONBOARDING_CREATED event.
 * Rejects non-hired candidates and candidates with existing active onboarding.
 * Preserves start date consistency from accepted offer if not provided.
 */
export const createOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { candidateId: string; startDate?: string | null }) =>
    z
      .object({
        candidateId: z.string().uuid(),
        startDate: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const result = await createOnboardingAtomic(context.supabase, {
      candidateId: data.candidateId,
      startDate: data.startDate ?? null,
      createdBy: context.userId ?? null,
    });

    return result;
  });

/**
 * Starts onboarding transition: NOT_STARTED → IN_PROGRESS.
 * Conditional update guarantees race-safety.
 */
export const startOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { onboardingId: string }) =>
    z.object({ onboardingId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    // 1. Race-safe conditional update
    const { data: updated, error } = await context.supabase
      .from("onboarding")
      .update({ status: "IN_PROGRESS" })
      .eq("id", data.onboardingId)
      .eq("status", "NOT_STARTED")
      .select()
      .maybeSingle();

    if (error) throw new Error("Could not start onboarding.");
    if (!updated) {
      throw new Error(
        "Cannot start onboarding: record is not in NOT_STARTED status or transition conflict.",
      );
    }

    // 2. Audit Event
    await recordOnboardingEvent(context.supabase, {
      onboardingId: updated.id,
      candidateId: updated.candidate_id,
      eventType: "ONBOARDING_STARTED",
      notes: "Onboarding initiated and transitioned to IN_PROGRESS.",
      createdBy: context.userId ?? null,
    });

    return { onboarding: updated };
  });

/**
 * Completes an onboarding task with strict task ownership validation.
 * Idempotent: already-completed tasks do not create duplicate events.
 */
export const completeOnboardingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { taskId: string; onboardingId?: string; candidateId?: string }) =>
    z
      .object({
        taskId: z.string().uuid(),
        onboardingId: z.string().uuid().optional(),
        candidateId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // 1. Ownership & existence check
    const { data: task, error: taskError } = await context.supabase
      .from("onboarding_tasks")
      .select("*, onboarding(id, candidate_id, status)")
      .eq("id", data.taskId)
      .maybeSingle();

    if (taskError || !task) {
      throw new Error("Onboarding task not found.");
    }

    const taskWithOnboarding = task as unknown as {
      id: string;
      onboarding_id: string;
      status: string;
      onboarding?: { id: string; candidate_id: string; status: string } | null;
    };

    if (data.onboardingId && taskWithOnboarding.onboarding_id !== data.onboardingId) {
      throw new Error("Task does not belong to the specified onboarding record.");
    }

    if (
      data.candidateId &&
      taskWithOnboarding.onboarding &&
      taskWithOnboarding.onboarding.candidate_id !== data.candidateId
    ) {
      throw new Error("Task does not belong to the specified candidate.");
    }

    // 2. Idempotent check
    if (task.status === "COMPLETED") {
      return { task, alreadyCompleted: true };
    }

    const completedAt = new Date().toISOString();

    // 3. Conditional update
    const { data: updatedTask, error: updateError } = await context.supabase
      .from("onboarding_tasks")
      .update({
        status: "COMPLETED",
        completed_at: completedAt,
      })
      .eq("id", data.taskId)
      .neq("status", "COMPLETED")
      .select()
      .maybeSingle();

    if (updateError || !updatedTask) {
      // Handled concurrently by another request
      return { task, alreadyCompleted: true };
    }

    // 4. Audit Event
    await recordOnboardingEvent(context.supabase, {
      onboardingId: task.onboarding_id,
      candidateId: taskWithOnboarding.onboarding?.candidate_id ?? "",
      eventType: "ONBOARDING_TASK_COMPLETED",
      notes: `Task completed: "${task.title}"`,
      createdBy: context.userId ?? null,
    });

    return { task: updatedTask, alreadyCompleted: false };
  });

/**
 * Completes onboarding lifecycle: IN_PROGRESS → COMPLETED.
 * Strictly verifies that all required tasks are COMPLETED.
 * Race-safe conditional transition ensures exactly one completion event.
 * Preserves candidate application_status = 'hired'.
 */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { onboardingId: string }) =>
    z.object({ onboardingId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    // 1. Verify all required tasks are COMPLETED
    const { data: tasks, error: tasksError } = await context.supabase
      .from("onboarding_tasks")
      .select("id, status, title")
      .eq("onboarding_id", data.onboardingId);

    if (tasksError) throw new Error("Could not verify onboarding tasks.");

    const incompleteTasks = (tasks ?? []).filter((t) => t.status !== "COMPLETED");
    if (incompleteTasks.length > 0) {
      throw new Error(
        `Cannot complete onboarding: ${incompleteTasks.length} task(s) remain incomplete.`,
      );
    }

    const completedAt = new Date().toISOString();

    // 2. Race-safe conditional transition IN_PROGRESS → COMPLETED
    const { data: updated, error: updateError } = await context.supabase
      .from("onboarding")
      .update({
        status: "COMPLETED",
        completed_at: completedAt,
      })
      .eq("id", data.onboardingId)
      .eq("status", "IN_PROGRESS")
      .select()
      .maybeSingle();

    if (updateError) throw new Error("Could not complete onboarding.");
    if (!updated) {
      throw new Error(
        "Cannot complete onboarding: record is not currently IN_PROGRESS or was already completed.",
      );
    }

    // 3. Exactly one ONBOARDING_COMPLETED audit event
    await recordOnboardingEvent(context.supabase, {
      onboardingId: updated.id,
      candidateId: updated.candidate_id,
      eventType: "ONBOARDING_COMPLETED",
      notes: `Onboarding completed successfully with all tasks finished on ${completedAt}.`,
      createdBy: context.userId ?? null,
    });

    return { onboarding: updated };
  });

/**
 * Cancels an active onboarding record (NOT_STARTED or IN_PROGRESS).
 * Race-safe conditional update.
 */
export const cancelOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { onboardingId: string; reason?: string }) =>
    z
      .object({
        onboardingId: z.string().uuid(),
        reason: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // 1. Conditional update: only active onboarding can be cancelled
    const { data: updated, error } = await context.supabase
      .from("onboarding")
      .update({ status: "CANCELLED" })
      .eq("id", data.onboardingId)
      .in("status", ["NOT_STARTED", "IN_PROGRESS"])
      .select()
      .maybeSingle();

    if (error) throw new Error("Could not cancel onboarding.");
    if (!updated) {
      throw new Error("Cannot cancel onboarding: record is not currently active.");
    }

    // 2. Audit Event
    await recordOnboardingEvent(context.supabase, {
      onboardingId: updated.id,
      candidateId: updated.candidate_id,
      eventType: "ONBOARDING_CANCELLED",
      notes: data.reason || "Onboarding cancelled by recruiter.",
      createdBy: context.userId ?? null,
    });

    return { cancelled: true, onboarding: updated };
  });
