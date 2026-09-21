# LinkedIn-to-ATS application pipeline

Extends the existing HR portal — same login, same database, same design system, same pipeline board. Nothing is rebuilt or duplicated.

## What you get

**1. Job postings built for LinkedIn (existing Openings page)**
Each opening gains a public job code (e.g. `SEC-DEV-001`), preferred skills, minimum/maximum experience, education requirement, application deadline, and a Draft/Active/Closed status. Active openings show two copy buttons: the application link (`/apply/SEC-DEV-001`, on your own domain) and a ready-to-paste LinkedIn call-to-action.

**2. Public application page — no login**
`/apply/:jobCode` shows the company name, title, department, location, employment type, experience needed, description, required and preferred skills, and deadline, then the form: name, email, phone, current location, years of experience, LinkedIn URL, optional portfolio, optional cover letter, and a resume (PDF/DOC/DOCX, size-checked) with an upload progress bar. On success the candidate sees a confirmation and an Application ID — never a score. Closed, draft, or past-deadline openings show a friendly notice instead of the form.

**3. Where applications land**
Every submission becomes a candidate in your existing pipeline at the "Applied" stage, so the board, calendar, and Email Dispatch keep working unchanged. Each one records its source (LinkedIn by default, with Company Website / Referral / Indeed / Other supported) plus optional campaign tracking, and the resume file itself.

**4. Resumes stored privately**
A private resume store, path `resumes/{jobId}/{applicationId}/…`. Candidates upload through a short-lived permission; only signed-in HR can open a resume, via a time-limited link. No public URLs, nothing logged.

**5. ATS evaluation against that specific opening**
Text is pulled from the resume on the server (PDF and DOCX; a scanned or unreadable file is marked Failed with "Unable to extract readable text from resume." and never given an invented score). The resume is then parsed into skills, experience, education, and projects, and scored out of 100 with fixed, configurable weights: required skills 35, relevant experience 25, additional skills 15, education 10, description match 10, preferred skills 5. Skill matching is case-insensitive and alias-aware (React/React.js/ReactJS, Node/Node.js, AWS matching AWS Lambda). Experience separates total from relevant years against the required minimum. Categories: Strong 80+, Good 60–79, Partial 40–59, Low below 40 — indicators only. No auto-reject, no auto-hire; every decision stays with HR. Protected characteristics and photos are excluded from scoring by prompt and by design.

**6. HR views**
The LinkedIn page becomes an applications workspace: openings with their application counts, and per candidate the name, applied date, source, experience, ATS score, category, application status, and ATS status, with View details, View resume, View ATS analysis, and Re-run ATS. The candidate page gets the full analysis: score gauge out of 100 with category, matched/missing required and preferred skills, experience (required vs relevant), education, description match, and the summary — missing items read "Not identified in the submitted resume". Re-run ATS re-reads the resume against the current job requirements, and past evaluations are kept as a short history so you can see how a score changed after you edited the opening.

## Technical notes

- Migration extends `public.jobs` (job_code unique, preferred_skills, min/max_experience_years, education_requirement, application_deadline, status now draft|active|closed with a back-fill from `open`) and `public.candidates` (application_code, source_post_id, utm_source/medium/campaign, years_experience, portfolio_url, cover_letter, resume_path/file_name/file_type/uploaded_at, application_status, ats_status, ats_category, ats_error, ats_version, scoring_version, matched/missing required+preferred skills, total/relevant experience, experience_match, education_match, keyword_score). New `public.ats_evaluations` history table plus `public.job_public_view`-style narrow anon read for the apply page. GRANTs + RLS on everything new; staff-only writes, anon limited to reading active openings.
- Public endpoints: `src/routes/apply.$jobCode.tsx` (SSR page, public loader through a publishable-key server fn) and `src/routes/api/public/applications.ts` (POST submit, Zod-validated, rate-guarded by deadline/status checks) plus `GET /api/applications/:applicationId` behind `requireSupabaseAuth`.
- Resume text extraction server-side with `unpdf` (PDF) and `mammoth` (DOCX) — both Worker-safe; legacy `.doc` is accepted for storage but marked Failed for extraction with a clear reason.
- New `src/lib/ats/` module: `weights.ts` (single source of scoring config), `skills.ts` (normalization + aliases), `parse.ts`, `score.ts`. `src/lib/ats.functions.ts` is refactored to call it and to keep working for existing candidates; AI is used only for parsing/semantic matching and returns structured JSON — the final number is always computed in our code from the weights. Existing `LOVABLE_API_KEY` gateway usage is reused; no key touches the browser.
- Private `resumes` storage bucket created via tooling with RLS on `storage.objects`; HR reads through signed URLs from a server function.
