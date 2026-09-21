-- ====================================================================
-- PHASE 5: OFFER & HIRING LIFECYCLE MIGRATION
-- Adds public.offers and public.offer_events tables, partial uniqueness
-- for active candidate offers, indexes, triggers, and RLS policies.
-- ====================================================================

-- 1. OFFERS TABLE
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  compensation numeric(12, 2) NOT NULL CHECK (compensation > 0),
  currency text NOT NULL DEFAULT 'INR',
  start_date date NOT NULL,
  expires_at timestamptz NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED')),
  secure_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index: at most one active (DRAFT or SENT) offer per candidate
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_candidate_active
  ON public.offers (candidate_id)
  WHERE (status IN ('DRAFT', 'SENT'));

-- Query & foreign key indexes
CREATE INDEX IF NOT EXISTS idx_offers_candidate_id ON public.offers (candidate_id);
CREATE INDEX IF NOT EXISTS idx_offers_job_id ON public.offers (job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_secure_token ON public.offers (secure_token);
CREATE INDEX IF NOT EXISTS idx_offers_status ON public.offers (status);

-- Updated at trigger
DROP TRIGGER IF EXISTS update_offers_updated_at ON public.offers;
CREATE TRIGGER update_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permissions & RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offers_staff_read ON public.offers;
CREATE POLICY offers_staff_read ON public.offers
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS offers_staff_insert ON public.offers;
CREATE POLICY offers_staff_insert ON public.offers
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS offers_staff_update ON public.offers;
CREATE POLICY offers_staff_update ON public.offers
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS offers_staff_delete ON public.offers;
CREATE POLICY offers_staff_delete ON public.offers
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));


-- 2. OFFER EVENTS (AUDIT / HISTORY)
CREATE TABLE IF NOT EXISTS public.offer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('OFFER_CREATED', 'OFFER_SENT', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'OFFER_EXPIRED', 'OFFER_REVOKED')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_events_offer_id ON public.offer_events (offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_events_candidate_id ON public.offer_events (candidate_id);

GRANT SELECT, INSERT ON public.offer_events TO authenticated;
GRANT ALL ON public.offer_events TO service_role;
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offer_events_staff_read ON public.offer_events;
CREATE POLICY offer_events_staff_read ON public.offer_events
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS offer_events_staff_insert ON public.offer_events;
CREATE POLICY offer_events_staff_insert ON public.offer_events
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));

