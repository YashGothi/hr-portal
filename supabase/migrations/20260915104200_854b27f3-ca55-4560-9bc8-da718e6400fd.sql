ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS outcome_email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS outcome_email_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ats_breakdown jsonb;