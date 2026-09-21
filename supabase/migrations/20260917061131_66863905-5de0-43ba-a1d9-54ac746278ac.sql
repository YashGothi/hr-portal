ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS shortlisted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS filtered_out_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS interview_invited_at timestamp with time zone;