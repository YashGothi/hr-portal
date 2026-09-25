import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { APPLICATION_SOURCES, RESUME_ACCEPTED, RESUME_MAX_BYTES } from "@/lib/ats/weights";

const Body = z.object({
  jobCode: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(2).max(120),
  email: z
    .string({ required_error: "Email address is required." })
    .trim()
    .min(1, "Email address is required.")
    .email("Enter a valid email address.")
    .max(180, "Email address is too long."),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(24)
    .regex(/^[+0-9][0-9\s\-()]{6,23}$/, "Enter a valid phone number"),
  location: z.string().trim().min(2).max(120),
  yearsExperience: z.coerce.number().min(0).max(60),
  linkedinUrl: z.string().trim().url().max(300),
  portfolioUrl: z.string().trim().url().max(300).optional().or(z.literal("")),
  coverLetter: z.string().trim().max(5000).optional().or(z.literal("")),
  source: z.enum(APPLICATION_SOURCES).default("LinkedIn"),
  sourcePostId: z.string().trim().max(120).optional().or(z.literal("")),
  utmSource: z.string().trim().max(120).optional().or(z.literal("")),
  utmMedium: z.string().trim().max(120).optional().or(z.literal("")),
  utmCampaign: z.string().trim().max(120).optional().or(z.literal("")),
});

export const ApplicationBodySchema = Body;

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/public/applications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return bad("Invalid submission.");
        }

        const parsed = Body.safeParse(Object.fromEntries(form.entries()));
        if (!parsed.success) {
          return bad(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
        }
        const input = parsed.data;

        const file = form.get("resume");
        if (!(file instanceof File) || file.size === 0) return bad("Attach your resume.");
        if (file.size > RESUME_MAX_BYTES) return bad("The resume file is larger than 8 MB.");
        const fileType = RESUME_ACCEPTED[file.type as keyof typeof RESUME_ACCEPTED];
        if (!fileType) return bad("Upload your resume as a PDF, DOC or DOCX file.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const trimmedJobCode = input.jobCode.trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          trimmedJobCode,
        );

        let jobQuery = supabaseAdmin.from("jobs").select("id, title, status, application_deadline");

        if (isUuid) {
          jobQuery = jobQuery.eq("id", trimmedJobCode);
        } else {
          jobQuery = jobQuery.ilike("job_code", trimmedJobCode);
        }

        const { data: job } = await jobQuery.maybeSingle();

        if (!job) return bad("This opening is no longer available.", 404);
        const expired = job.application_deadline
          ? new Date(`${job.application_deadline}T23:59:59`) < new Date()
          : false;
        if (job.status !== "active" || expired)
          return bad("Applications for this opening are closed.", 409);

        const normalizedEmail = input.email.trim().toLowerCase();

        const { data: existingCandidate } = await supabaseAdmin
          .from("candidates")
          .select("id")
          .eq("job_id", job.id)
          .ilike("email", normalizedEmail)
          .maybeSingle();

        if (existingCandidate) {
          return bad("You have already submitted an application for this position.", 409);
        }

        const { data: created, error: insertError } = await supabaseAdmin
          .from("candidates")
          .insert({
            job_id: job.id,
            full_name: input.fullName,
            email: normalizedEmail,
            phone: input.phone,
            location: input.location,
            applied_role: job.title,
            years_experience: input.yearsExperience,
            linkedin_url: input.linkedinUrl,
            portfolio_url: input.portfolioUrl || null,
            cover_letter: input.coverLetter || null,
            source: input.source,
            source_post_id: input.sourcePostId || null,
            utm_source: input.utmSource || null,
            utm_medium: input.utmMedium || null,
            utm_campaign: input.utmCampaign || null,
            stage: "application",
            application_status: "applied",
            ats_status: "pending",
          })
          .select("id, application_code")
          .single();

        if (insertError || !created) {
          if (
            insertError?.code === "23505" ||
            insertError?.message?.toLowerCase().includes("unique")
          ) {
            return bad("You have already submitted an application for this position.", 409);
          }
          console.error("application insert failed", insertError?.message);
          return bad("We could not record your application. Please try again.", 500);
        }

        const path = `${job.id}/${created.id}/resume.${fileType}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("resumes")
          .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });

        if (uploadError) {
          console.error("resume upload failed", uploadError.message);
          return bad("We could not store your resume. Please try again.", 500);
        }

        await supabaseAdmin
          .from("candidates")
          .update({
            resume_path: path,
            resume_file_name: file.name.slice(0, 200),
            resume_file_type: fileType,
            resume_uploaded_at: new Date().toISOString(),
            application_status: "resume_uploaded",
          })
          .eq("id", created.id);

        await supabaseAdmin.from("stage_history").insert({
          candidate_id: created.id,
          from_stage: null,
          to_stage: "application",
        });

        // Screen the resume against this specific opening. Failures are recorded
        // on the application; the candidate always gets a clean confirmation.
        try {
          const { evaluateResume, saveEvaluation, saveEvaluationFailure, JOB_REQUIREMENT_COLUMNS } =
            await import("@/lib/ats/engine.server");
          const { extractResumeText } = await import("@/lib/ats/extract.server");

          await supabaseAdmin
            .from("candidates")
            .update({ ats_status: "processing", application_status: "processing" })
            .eq("id", created.id);

          const { data: requirements } = await supabaseAdmin
            .from("jobs")
            .select(JOB_REQUIREMENT_COLUMNS)
            .eq("id", job.id)
            .single();

          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const resumeText = await extractResumeText(bytes, fileType);
            await supabaseAdmin
              .from("candidates")
              .update({ resume_text: resumeText })
              .eq("id", created.id);

            const outcome = await evaluateResume(requirements as never, resumeText);
            await saveEvaluation(supabaseAdmin, created.id, job.id, outcome, null);
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "ATS processing failed.";
            await saveEvaluationFailure(supabaseAdmin, created.id, job.id, message);
          }
        } catch (cause) {
          console.error("ats pipeline error", cause instanceof Error ? cause.message : cause);
        }

        return Response.json({ applicationId: created.application_code });
      },
    },
  },
});
