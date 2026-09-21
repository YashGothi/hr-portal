ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS interviewer text,
  ADD COLUMN IF NOT EXISTS interview_location text,
  ADD COLUMN IF NOT EXISTS interview_email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS interview_email_sent_at timestamp with time zone;