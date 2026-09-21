-- ====================================================================
-- PHASE 6A: ONBOARDING & EMPLOYEE HANDOFF LIFECYCLE MIGRATION
-- Adds public.onboarding, public.onboarding_tasks, and
-- public.onboarding_events tables, partial uniqueness for active
-- onboarding, indexes, triggers, RLS policies, and atomic creation RPC.
-- ====================================================================

-- 1. ONBOARDING TABLE
CREATE TABLE IF NOT EXISTS public.onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  start_date date,
  status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Partial unique index: at most one active (NOT_STARTED or IN_PROGRESS) onboarding per candidate
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_candidate_active
  ON public.onboarding (candidate_id)
  WHERE (status IN ('NOT_STARTED', 'IN_PROGRESS'));

-- Query & foreign key indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_candidate_id ON public.onboarding (candidate_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_job_id ON public.onboarding (job_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON public.onboarding (status);

-- Updated at trigger
DROP TRIGGER IF EXISTS update_onboarding_updated_at ON public.onboarding;
CREATE TRIGGER update_onboarding_updated_at
  BEFORE UPDATE ON public.onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permissions & RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding TO authenticated;
GRANT ALL ON public.onboarding TO service_role;
ALTER TABLE public.onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_staff_read ON public.onboarding;
CREATE POLICY onboarding_staff_read ON public.onboarding
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_staff_insert ON public.onboarding;
CREATE POLICY onboarding_staff_insert ON public.onboarding
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_staff_update ON public.onboarding;
CREATE POLICY onboarding_staff_update ON public.onboarding
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_staff_delete ON public.onboarding;
CREATE POLICY onboarding_staff_delete ON public.onboarding
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));


-- 2. ONBOARDING TASKS TABLE
CREATE TABLE IF NOT EXISTS public.onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.onboarding(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_onboarding_id ON public.onboarding_tasks (onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_status ON public.onboarding_tasks (status);

DROP TRIGGER IF EXISTS update_onboarding_tasks_updated_at ON public.onboarding_tasks;
CREATE TRIGGER update_onboarding_tasks_updated_at
  BEFORE UPDATE ON public.onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_tasks TO authenticated;
GRANT ALL ON public.onboarding_tasks TO service_role;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_tasks_staff_read ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_staff_read ON public.onboarding_tasks
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_tasks_staff_insert ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_staff_insert ON public.onboarding_tasks
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_tasks_staff_update ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_staff_update ON public.onboarding_tasks
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_tasks_staff_delete ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_staff_delete ON public.onboarding_tasks
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));


-- 3. ONBOARDING EVENTS (AUDIT / HISTORY) TABLE
CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.onboarding(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('ONBOARDING_CREATED', 'ONBOARDING_STARTED', 'ONBOARDING_TASK_COMPLETED', 'ONBOARDING_COMPLETED', 'ONBOARDING_CANCELLED')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_onboarding_id ON public.onboarding_events (onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_candidate_id ON public.onboarding_events (candidate_id);

GRANT SELECT, INSERT ON public.onboarding_events TO authenticated;
GRANT ALL ON public.onboarding_events TO service_role;
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_events_staff_read ON public.onboarding_events;
CREATE POLICY onboarding_events_staff_read ON public.onboarding_events
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_events_staff_insert ON public.onboarding_events;
CREATE POLICY onboarding_events_staff_insert ON public.onboarding_events
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));


-- 4. ATOMIC ONBOARDING CREATION RPC FUNCTION
CREATE OR REPLACE FUNCTION public.create_onboarding_atomic(
  p_candidate_id uuid,
  p_start_date date DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_candidate record;
  v_onboarding_id uuid;
  v_job_id uuid;
  v_start_date date := p_start_date;
BEGIN
  -- 1. Check candidate existence and application_status = 'hired'
  SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  IF v_candidate.application_status IS DISTINCT FROM 'hired' THEN
    RAISE EXCEPTION 'Only candidates with application status hired can be onboarded.';
  END IF;

  -- 2. Check for existing active onboarding
  IF EXISTS (
    SELECT 1 FROM public.onboarding
    WHERE candidate_id = p_candidate_id
      AND status IN ('NOT_STARTED', 'IN_PROGRESS')
  ) THEN
    RAISE EXCEPTION 'Candidate already has an active onboarding record.';
  END IF;

  -- 3. If start date not provided, check accepted offer
  IF v_start_date IS NULL THEN
    SELECT start_date INTO v_start_date
    FROM public.offers
    WHERE candidate_id = p_candidate_id AND status = 'ACCEPTED'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  v_job_id := v_candidate.job_id;

  -- 4. Insert Onboarding record
  INSERT INTO public.onboarding (
    candidate_id,
    job_id,
    start_date,
    status,
    created_by
  ) VALUES (
    p_candidate_id,
    v_job_id,
    v_start_date,
    'NOT_STARTED',
    p_created_by
  )
  RETURNING id INTO v_onboarding_id;

  -- 5. Insert 7 Default Tasks
  INSERT INTO public.onboarding_tasks (onboarding_id, title, description, status) VALUES
    (v_onboarding_id, 'Verify identity documents', 'Check government ID, passport, or work authorization.', 'PENDING'),
    (v_onboarding_id, 'Collect signed offer letter', 'Confirm the candidate and company countersigned offer letter is in records.', 'PENDING'),
    (v_onboarding_id, 'Collect payroll documents', 'Collect tax forms (W-4 / Form 16 / PAN), bank details, and direct deposit info.', 'PENDING'),
    (v_onboarding_id, 'Create company email', 'Provision corporate email address and Google Workspace/M365 account.', 'PENDING'),
    (v_onboarding_id, 'Assign equipment', 'Order and dispatch workstation laptop, security keys, and peripherals.', 'PENDING'),
    (v_onboarding_id, 'Assign manager', 'Designate reporting manager and schedule initial 1:1 sync.', 'PENDING'),
    (v_onboarding_id, 'Complete orientation', 'Conduct company orientation, culture overview, and security awareness training.', 'PENDING');

  -- 6. Insert ONBOARDING_CREATED event
  INSERT INTO public.onboarding_events (
    onboarding_id,
    candidate_id,
    event_type,
    notes,
    created_by
  ) VALUES (
    v_onboarding_id,
    p_candidate_id,
    'ONBOARDING_CREATED',
    'Onboarding record and 7 default tasks created.',
    p_created_by
  );

  RETURN jsonb_build_object(
    'id', v_onboarding_id,
    'candidate_id', p_candidate_id,
    'job_id', v_job_id,
    'start_date', v_start_date,
    'status', 'NOT_STARTED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_onboarding_atomic(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_onboarding_atomic(uuid, date, uuid) TO service_role;
