ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_confirm_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS interview_confirmed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_interview_confirm_token_key
  ON public.candidates (interview_confirm_token);

CREATE OR REPLACE FUNCTION public.confirm_interview(p_token UUID)
RETURNS TABLE (full_name TEXT, interview_at TIMESTAMPTZ, interviewer TEXT, interview_location TEXT, confirmed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.candidates c
     SET interview_confirmed_at = COALESCE(c.interview_confirmed_at, now())
   WHERE c.interview_confirm_token = p_token;

  RETURN QUERY
  SELECT c.full_name, c.interview_at, c.interviewer, c.interview_location, c.interview_confirmed_at
    FROM public.candidates c
   WHERE c.interview_confirm_token = p_token;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_interview(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_interview(UUID) TO anon, authenticated, service_role;