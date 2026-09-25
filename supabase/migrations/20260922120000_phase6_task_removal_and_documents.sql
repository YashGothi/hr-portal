-- ====================================================================
-- PHASE 6: TASK REMOVAL, CONFIGURABLE DOCUMENTS & ONBOARDING PORTAL
-- 1. Drops public.onboarding_tasks (0 rows in production).
-- 2. Adds token fields (candidate_token_hash, token_expires_at, token_revoked_at) to public.onboarding.
--    Ensures partial unique index idx_onboarding_candidate_active exists to prevent concurrent active onboardings.
-- 3. Creates public.onboarding_documents table for configurable requirements & uploads.
--    Includes database constraint: review_notes required when status = 'REJECTED'.
-- 4. Updates public.onboarding_events check constraint for Phase 6B events.
-- 5. Updates public.create_onboarding_atomic RPC (strict allow-list authorization, internal 256-bit token gen + SHA-256 hash, auth.uid() audit identity).
-- 6. Adds public.resend_onboarding_invite_atomic RPC (strict allow-list authorization, FOR UPDATE row lock serialization, token replacement).
-- 7. Adds public.resolve_onboarding_token security definer RPC (race-safe start transition, strict candidate data minimization without onboarding_id).
-- 8. Ensures private storage bucket onboarding-documents and storage.objects RLS.
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. REMOVE PREDEFINED ONBOARDING TASKS TABLE AND OBSOLETE RPC OVERLOAD
DROP TABLE IF EXISTS public.onboarding_tasks CASCADE;
DROP FUNCTION IF EXISTS public.create_onboarding_atomic(uuid, date, uuid);


-- 2. UPDATE ONBOARDING TABLE WITH TOKEN FIELDS & CONCURRENCY PROTECTION
ALTER TABLE public.onboarding
  ADD COLUMN IF NOT EXISTS candidate_token_hash text UNIQUE,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_candidate_token_hash
  ON public.onboarding (candidate_token_hash);

-- Database-level protection against concurrent active onboarding records for the same candidate
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_candidate_active
  ON public.onboarding (candidate_id)
  WHERE (status IN ('NOT_STARTED', 'IN_PROGRESS'));


-- 3. CREATE ONBOARDING DOCUMENTS TABLE (OPTION A: REQUIREMENTS + SUBMISSIONS)
CREATE TABLE IF NOT EXISTS public.onboarding_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.onboarding(id) ON DELETE CASCADE,
  requirement_key text NOT NULL,
  title text NOT NULL,
  description text,
  is_required boolean NOT NULL DEFAULT true,
  storage_path text,
  document_name text,
  file_size_bytes integer,
  mime_type text,
  document_status text NOT NULL DEFAULT 'NOT_SUBMITTED'
    CHECK (document_status IN ('NOT_SUBMITTED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED')),
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_onboarding_document_requirement UNIQUE (onboarding_id, requirement_key),
  CONSTRAINT chk_onboarding_documents_rejection_notes CHECK (
    document_status <> 'REJECTED'
    OR (
      review_notes IS NOT NULL
      AND length(trim(review_notes)) > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_onboarding_id
  ON public.onboarding_documents (onboarding_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_status
  ON public.onboarding_documents (document_status);

DROP TRIGGER IF EXISTS update_onboarding_documents_updated_at ON public.onboarding_documents;
CREATE TRIGGER update_onboarding_documents_updated_at
  BEFORE UPDATE ON public.onboarding_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permissions & RLS for onboarding_documents
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_documents TO authenticated;
GRANT ALL ON public.onboarding_documents TO service_role;
ALTER TABLE public.onboarding_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_documents_staff_read ON public.onboarding_documents;
CREATE POLICY onboarding_documents_staff_read ON public.onboarding_documents
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_documents_staff_insert ON public.onboarding_documents;
CREATE POLICY onboarding_documents_staff_insert ON public.onboarding_documents
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_documents_staff_update ON public.onboarding_documents;
CREATE POLICY onboarding_documents_staff_update ON public.onboarding_documents
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS onboarding_documents_staff_delete ON public.onboarding_documents;
CREATE POLICY onboarding_documents_staff_delete ON public.onboarding_documents
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));


-- 4. UPDATE AUDIT EVENT TYPES IN ONBOARDING EVENTS
ALTER TABLE public.onboarding_events
  DROP CONSTRAINT IF EXISTS onboarding_events_event_type_check;

ALTER TABLE public.onboarding_events
  ADD CONSTRAINT onboarding_events_event_type_check
  CHECK (event_type IN (
    'ONBOARDING_CREATED',
    'ONBOARDING_STARTED',
    'ONBOARDING_INVITE_SENT',
    'ONBOARDING_DOC_UPLOADED',
    'ONBOARDING_DOC_VERIFIED',
    'ONBOARDING_DOC_REJECTED',
    'ONBOARDING_COMPLETED',
    'ONBOARDING_CANCELLED'
  ));


-- 5. ATOMIC ONBOARDING CREATION RPC (STRICT ALLOW-LIST AUTHORIZATION, SERVER-GENERATED TOKEN & SHA-256 HASH)
CREATE OR REPLACE FUNCTION public.create_onboarding_atomic(
  p_candidate_id uuid,
  p_start_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_candidate record;
  v_onboarding_id uuid;
  v_job_id uuid;
  v_start_date date := p_start_date;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
BEGIN
  -- 1. Strict Allow-List Authorization:
  -- service_role -> ALLOW
  -- staff authenticated user -> ALLOW
  -- non-staff authenticated user -> DENY
  -- anon -> DENY
  -- any other role -> DENY
  IF auth.role() <> 'service_role' AND NOT private.is_staff(v_caller_uid) THEN
    RAISE EXCEPTION 'Unauthorized: only staff can perform this action.';
  END IF;

  -- 2. Check candidate existence and application_status = 'hired'
  SELECT * INTO v_candidate FROM public.candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  IF v_candidate.application_status IS DISTINCT FROM 'hired' THEN
    RAISE EXCEPTION 'Only candidates with application status hired can be onboarded.';
  END IF;

  -- 3. Check for existing active onboarding (backed by unique partial index idx_onboarding_candidate_active)
  IF EXISTS (
    SELECT 1 FROM public.onboarding
    WHERE candidate_id = p_candidate_id
      AND status IN ('NOT_STARTED', 'IN_PROGRESS')
  ) THEN
    RAISE EXCEPTION 'Candidate already has an active onboarding record.';
  END IF;

  -- 4. If start date not provided, check accepted offer
  IF v_start_date IS NULL THEN
    SELECT start_date INTO v_start_date
    FROM public.offers
    WHERE candidate_id = p_candidate_id AND status = 'ACCEPTED'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 5. Cryptographically random 256-bit token generated inside database
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '14 days';

  v_job_id := v_candidate.job_id;

  -- 6. Insert Onboarding record storing only SHA-256 hash (audit creator derived from auth.uid())
  INSERT INTO public.onboarding (
    candidate_id,
    job_id,
    start_date,
    status,
    candidate_token_hash,
    token_expires_at,
    created_by
  ) VALUES (
    p_candidate_id,
    v_job_id,
    v_start_date,
    'NOT_STARTED',
    v_token_hash,
    v_expires_at,
    v_caller_uid
  )
  RETURNING id INTO v_onboarding_id;

  -- 7. Insert default onboarding requirements (initial seed for Option A model;
  -- lifecycle and completion logic operates dynamically over onboarding_documents rows)
  INSERT INTO public.onboarding_documents (onboarding_id, requirement_key, title, description, is_required) VALUES
    (v_onboarding_id, 'identity_verification', 'Identity Verification', 'Upload government ID, passport, or national identity document.', true),
    (v_onboarding_id, 'signed_offer_letter', 'Signed Offer Letter', 'Upload countersigned offer letter and employment agreement.', true),
    (v_onboarding_id, 'payroll_tax_forms', 'Payroll & Tax Documentation', 'Upload tax forms (W-4 / Form 16 / PAN) and direct deposit bank details.', true);

  -- 8. Insert ONBOARDING_CREATED event
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
    'Onboarding record created with required document compliance items.',
    v_caller_uid
  );

  -- 9. Return raw_token once to caller for invitation email generation
  RETURN jsonb_build_object(
    'id', v_onboarding_id,
    'candidate_id', p_candidate_id,
    'job_id', v_job_id,
    'start_date', v_start_date,
    'status', 'NOT_STARTED',
    'raw_token', v_raw_token,
    'token_expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_onboarding_atomic(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_onboarding_atomic(uuid, date) TO service_role;


-- 6. RESEND ONBOARDING INVITE RPC (STRICT ALLOW-LIST AUTHORIZATION, FOR UPDATE ROW LOCK, TOKEN REPLACEMENT)
CREATE OR REPLACE FUNCTION public.resend_onboarding_invite_atomic(
  p_onboarding_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_onb record;
  v_new_raw_token text;
  v_new_token_hash text;
  v_new_expires_at timestamptz;
BEGIN
  -- 1. Strict Allow-List Authorization:
  -- service_role -> ALLOW
  -- staff authenticated user -> ALLOW
  -- non-staff authenticated user -> DENY
  -- anon -> DENY
  -- any other role -> DENY
  IF auth.role() <> 'service_role' AND NOT private.is_staff(v_caller_uid) THEN
    RAISE EXCEPTION 'Unauthorized: only staff can perform this action.';
  END IF;

  -- 2. Acquire explicit row-level lock (FOR UPDATE) to serialize concurrent resends
  SELECT * INTO v_onb
  FROM public.onboarding
  WHERE id = p_onboarding_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding record not found.';
  END IF;

  IF v_onb.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot resend invite for % onboarding.', v_onb.status;
  END IF;

  -- 3. Generate new 256-bit token & hash
  v_new_raw_token := encode(gen_random_bytes(32), 'hex');
  v_new_token_hash := encode(digest(v_new_raw_token, 'sha256'), 'hex');
  v_new_expires_at := now() + interval '14 days';

  -- 4. Replace token hash and reset expiry; old token hash is overwritten and immediately invalid
  UPDATE public.onboarding
  SET
    candidate_token_hash = v_new_token_hash,
    token_expires_at = v_new_expires_at,
    token_revoked_at = NULL,
    updated_at = now()
  WHERE id = p_onboarding_id;

  RETURN jsonb_build_object(
    'onboarding_id', v_onb.id,
    'candidate_id', v_onb.candidate_id,
    'raw_token', v_new_raw_token,
    'token_expires_at', v_new_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resend_onboarding_invite_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_onboarding_invite_atomic(uuid) TO service_role;


-- 7. CANDIDATE PORTAL TOKEN RESOLUTION RPC (RACE-SAFE START TRANSITION, STRICT DATA MINIMIZATION)
CREATE OR REPLACE FUNCTION public.resolve_onboarding_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_token_hash text;
  v_onboarding record;
  v_candidate record;
  v_job record;
  v_docs jsonb;
  v_started_id uuid;
BEGIN
  -- Hash incoming token with SHA-256
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- 1. Validate token existence and active status
  SELECT * INTO v_onboarding
  FROM public.onboarding
  WHERE candidate_token_hash = v_token_hash
    AND token_revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or revoked onboarding invitation link.';
  END IF;

  IF v_onboarding.token_expires_at IS NOT NULL AND v_onboarding.token_expires_at < now() THEN
    RAISE EXCEPTION 'Onboarding invitation link has expired.';
  END IF;

  IF v_onboarding.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'This onboarding process has been cancelled.';
  END IF;

  -- 2. Race-Safe Conditional Transition: NOT_STARTED -> IN_PROGRESS
  -- Uses conditional UPDATE ... WHERE status = 'NOT_STARTED' RETURNING id.
  -- Only the single transaction that successfully updates the row emits the ONBOARDING_STARTED event.
  IF v_onboarding.status = 'NOT_STARTED' THEN
    UPDATE public.onboarding
    SET status = 'IN_PROGRESS', updated_at = now()
    WHERE id = v_onboarding.id
      AND status = 'NOT_STARTED'
    RETURNING id INTO v_started_id;

    IF v_started_id IS NOT NULL THEN
      v_onboarding.status := 'IN_PROGRESS';

      INSERT INTO public.onboarding_events (
        onboarding_id,
        candidate_id,
        event_type,
        notes,
        created_by
      ) VALUES (
        v_onboarding.id,
        v_onboarding.candidate_id,
        'ONBOARDING_STARTED',
        'Candidate opened onboarding portal and began submission process.',
        NULL
      );
    ELSE
      -- Concurrent request already transitioned the status to IN_PROGRESS
      v_onboarding.status := 'IN_PROGRESS';
    END IF;
  END IF;

  -- 3. Fetch candidate minimized details (full_name only; no email/phone/salary/internal ID)
  SELECT full_name INTO v_candidate
  FROM public.candidates
  WHERE id = v_onboarding.candidate_id;

  -- 4. Fetch job minimized details (title and department)
  SELECT title, department INTO v_job
  FROM public.jobs
  WHERE id = v_onboarding.job_id;

  -- 5. Fetch documents requirements list (includes document id for uploads, excludes internal storage_path!)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'requirement_key', requirement_key,
      'title', title,
      'description', description,
      'is_required', is_required,
      'document_status', document_status,
      'document_name', document_name,
      'file_size_bytes', file_size_bytes,
      'uploaded_at', uploaded_at,
      'review_notes', review_notes
    ) ORDER BY created_at ASC
  ) INTO v_docs
  FROM public.onboarding_documents
  WHERE onboarding_id = v_onboarding.id;

  -- 6. Minimized public payload strictly designed for candidate portal display
  -- Note: onboarding_id is completely excluded for data minimization
  RETURN jsonb_build_object(
    'status', v_onboarding.status,
    'start_date', v_onboarding.start_date,
    'candidate', jsonb_build_object(
      'full_name', v_candidate.full_name
    ),
    'job', jsonb_build_object(
      'title', COALESCE(v_job.title, 'Role'),
      'department', v_job.department
    ),
    'documents', COALESCE(v_docs, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_onboarding_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_onboarding_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_onboarding_token(text) TO service_role;


-- 8. STORAGE BUCKET AND STORAGE.OBJECTS RLS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-documents',
  'onboarding-documents',
  false,
  8388608,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

-- Staff-only direct read on storage.objects for onboarding-documents
DROP POLICY IF EXISTS "Staff read onboarding documents" ON storage.objects;
CREATE POLICY "Staff read onboarding documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'onboarding-documents' AND private.is_staff(auth.uid()));

-- Staff-only direct write/delete on storage.objects for onboarding-documents
DROP POLICY IF EXISTS "Staff manage onboarding documents" ON storage.objects;
CREATE POLICY "Staff manage onboarding documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'onboarding-documents' AND private.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'onboarding-documents' AND private.is_staff(auth.uid()));
