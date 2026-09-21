-- JOBS ------------------------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_code TEXT,
  ADD COLUMN IF NOT EXISTS preferred_skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS min_experience_years NUMERIC,
  ADD COLUMN IF NOT EXISTS max_experience_years NUMERIC,
  ADD COLUMN IF NOT EXISTS education_requirement TEXT,
  ADD COLUMN IF NOT EXISTS application_deadline DATE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.jobs SET status = 'active' WHERE status = 'open';
UPDATE public.jobs SET status = 'closed' WHERE status NOT IN ('active', 'draft', 'closed');

UPDATE public.jobs
SET job_code = 'SEC-' || upper(substr(replace(id::text, '-', ''), 1, 6))
WHERE job_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_job_code_key ON public.jobs (upper(job_code));

DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;
CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CANDIDATES (applications) ---------------------------------------------
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS application_code TEXT,
  ADD COLUMN IF NOT EXISTS source_post_id TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS years_experience NUMERIC,
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_letter TEXT,
  ADD COLUMN IF NOT EXISTS resume_path TEXT,
  ADD COLUMN IF NOT EXISTS resume_file_name TEXT,
  ADD COLUMN IF NOT EXISTS resume_file_type TEXT,
  ADD COLUMN IF NOT EXISTS resume_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS application_status TEXT NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS ats_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ats_category TEXT,
  ADD COLUMN IF NOT EXISTS ats_error TEXT,
  ADD COLUMN IF NOT EXISTS ats_version TEXT,
  ADD COLUMN IF NOT EXISTS scoring_version TEXT,
  ADD COLUMN IF NOT EXISTS matched_required_skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS missing_required_skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS matched_preferred_skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS missing_preferred_skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS total_experience_years NUMERIC,
  ADD COLUMN IF NOT EXISTS relevant_experience_years NUMERIC,
  ADD COLUMN IF NOT EXISTS experience_match TEXT,
  ADD COLUMN IF NOT EXISTS education_match TEXT,
  ADD COLUMN IF NOT EXISTS keyword_score NUMERIC;

UPDATE public.candidates
SET application_code = upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE application_code IS NULL;

ALTER TABLE public.candidates
  ALTER COLUMN application_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

CREATE UNIQUE INDEX IF NOT EXISTS candidates_application_code_key
  ON public.candidates (application_code);

UPDATE public.candidates
SET ats_status = 'completed'
WHERE ats_score IS NOT NULL AND ats_status = 'pending';

-- ATS EVALUATION HISTORY ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ats_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  ats_score INTEGER,
  ats_category TEXT,
  summary TEXT,
  result JSONB,
  scoring_version TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ats_evaluations TO authenticated;
GRANT ALL ON public.ats_evaluations TO service_role;

ALTER TABLE public.ats_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ats_evaluations_staff_read ON public.ats_evaluations
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY ats_evaluations_staff_insert ON public.ats_evaluations
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS ats_evaluations_candidate_idx
  ON public.ats_evaluations (candidate_id, created_at DESC);

-- PUBLIC READ-ONLY JOB LOOKUP FOR THE APPLICATION PAGE ------------------
CREATE OR REPLACE FUNCTION public.get_public_job(p_code TEXT)
RETURNS TABLE (
  id UUID,
  job_code TEXT,
  title TEXT,
  department TEXT,
  location TEXT,
  employment_type TEXT,
  description TEXT,
  required_skills TEXT[],
  preferred_skills TEXT[],
  min_experience_years NUMERIC,
  max_experience_years NUMERIC,
  education_requirement TEXT,
  application_deadline DATE,
  status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.id, j.job_code, j.title, j.department, j.location, j.employment_type,
         j.description, j.required_skills, j.preferred_skills,
         j.min_experience_years, j.max_experience_years, j.education_requirement,
         j.application_deadline, j.status
  FROM public.jobs j
  WHERE upper(j.job_code) = upper(trim(p_code))
    AND j.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_job(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job(TEXT) TO service_role;
