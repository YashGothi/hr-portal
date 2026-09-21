DROP FUNCTION IF EXISTS public.get_public_job(TEXT);

CREATE OR REPLACE FUNCTION private.get_public_job(p_code TEXT)
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

REVOKE ALL ON FUNCTION private.get_public_job(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_public_job(TEXT) TO service_role;
