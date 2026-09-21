import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  extractLinkedInJobDetails,
  type ExtractedLinkedInJob,
} from "@/lib/ats/linkedin-job.server";

const LinkedInExtractInput = z.object({
  url: z.string().trim().optional(),
  text: z.string().trim().optional(),
});

export const extractLinkedInJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => LinkedInExtractInput.parse(data))
  .handler(async ({ data }): Promise<ExtractedLinkedInJob> => {
    if (!data.url && !data.text) {
      throw new Error(
        "Please provide either a LinkedIn Job URL or paste the job description text.",
      );
    }

    const extractInput: { url?: string; text?: string } = {};
    if (data.url) extractInput.url = data.url;
    if (data.text) extractInput.text = data.text;

    return await extractLinkedInJobDetails(extractInput);
  });

const SaveJobInputSchema = z.object({
  id: z.string().optional().nullable(),
  job_code: z.string().optional().nullable(),
  title: z.string().trim().min(1, "Job title is required"),
  department: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  employment_type: z.string().default("Full-time"),
  description: z.string().optional().nullable(),
  required_skills: z.array(z.string()).default([]),
  preferred_skills: z.array(z.string()).default([]),
  min_experience_years: z.number().optional().nullable(),
  max_experience_years: z.number().optional().nullable(),
  education_requirement: z.string().optional().nullable(),
  application_deadline: z.string().optional().nullable(),
  status: z.string().default("draft"),
});

export const saveJobOpeningFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => SaveJobInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context.userId) {
      console.warn("[saveJobOpeningFn] Authorization check failed: No authenticated user ID.");
      throw new Error("Unauthorized: You must be signed in to create a job opening. (HTTP 401)");
    }

    console.log(`[saveJobOpeningFn] User verification succeeded. userId: ${context.userId}`);
    console.log(
      `[saveJobOpeningFn] Querying user_roles for userId: ${context.userId} using authenticated user client`,
    );

    // Query user_roles using the authenticated user client (respecting policy user_roles_select_own)
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    if (roleError) {
      console.error("[saveJobOpeningFn] Failed to query user_roles:", roleError.message);
      throw new Error("Unable to verify user permissions. Please try again.");
    }

    const rolesFound = roleRows?.map((r) => r.role) ?? [];
    console.log(`[saveJobOpeningFn] Role lookup result for userId ${context.userId}:`, rolesFound);

    const isAuthorized = roleRows?.some((r) => r.role === "admin" || r.role === "recruiter");
    console.log(`[saveJobOpeningFn] Authorization result: ${isAuthorized ? "ALLOWED" : "DENIED"}`);

    if (!isAuthorized) {
      throw new Error("Forbidden: You do not have permission to create job openings. (HTTP 403)");
    }

    const code =
      data.job_code?.trim().toUpperCase() ||
      `SEC-${
        data.title
          .replace(/[^A-Za-z]/g, "")
          .slice(0, 3)
          .toUpperCase() || "JOB"
      }-${Date.now().toString().slice(-4)}`;

    const payload = {
      job_code: code,
      title: data.title.trim(),
      department: data.department || null,
      location: data.location || null,
      employment_type: data.employment_type,
      description: data.description || null,
      required_skills: data.required_skills,
      preferred_skills: data.preferred_skills,
      min_experience_years: data.min_experience_years ?? null,
      max_experience_years: data.max_experience_years ?? null,
      education_requirement: data.education_requirement || null,
      application_deadline: data.application_deadline || null,
      status: data.status,
      created_by: context.userId,
    };

    try {
      if (data.id) {
        const { error } = await context.supabase.from("jobs").update(payload).eq("id", data.id);
        if (error) throw error;
        console.log(`[saveJobOpeningFn] DB operation SUCCESS: updated job ${data.id}`);
        return { action: "updated" as const };
      }

      const { error } = await context.supabase.from("jobs").insert(payload);
      if (error) throw error;
      console.log(`[saveJobOpeningFn] DB operation SUCCESS: created new job with code ${code}`);
      return { action: "created" as const };
    } catch (err: unknown) {
      console.error("[saveJobOpeningFn] Database operation error:", err);
      const dbErr = err as { message?: string; code?: string } | null;
      const msg = String(dbErr?.message || err);
      const code = dbErr?.code;

      if (code === "23505" || msg.includes("jobs_job_code_key") || msg.includes("job_code")) {
        throw new Error("A job with this Job ID already exists. Please use a different Job ID.");
      }
      if (msg.includes("row-level security") || msg.includes("permission denied")) {
        throw new Error("You do not have permission to create job openings.");
      }
      if (msg.includes("Missing required server Supabase environment variable")) {
        throw new Error("Server configuration is incomplete. Please contact the administrator.");
      }
      throw new Error("Unable to create the job opening. Please try again.");
    }
  });
