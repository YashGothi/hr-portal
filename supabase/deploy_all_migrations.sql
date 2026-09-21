-- ==========================================================================
-- CONSOLIDATED DATABASE MIGRATION SCRIPT FOR PROJECT smdmlamfwriltisxghab
-- Run directly in Supabase SQL Editor
-- ==========================================================================

CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);

--------------------------------------------------------------------------
-- Migration 20260915092550: 20260915092550_ac201f66-d6fb-470b-8048-dd087f316b69.sql
--------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT,
  location TEXT,
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  description TEXT,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_all_auth" ON public.jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.jobs ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  applied_role TEXT,
  resume_text TEXT,
  ats_score INTEGER,
  ats_summary TEXT,
  ats_strengths TEXT[] NOT NULL DEFAULT '{}',
  ats_gaps TEXT[] NOT NULL DEFAULT '{}',
  ats_scored_at TIMESTAMPTZ,
  stage TEXT NOT NULL DEFAULT 'application',
  notes TEXT,
  shortlist_email_status TEXT NOT NULL DEFAULT 'not_sent',
  shortlist_email_sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidates_all_auth" ON public.candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.candidate_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  verified_by UUID REFERENCES auth.users ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_documents TO authenticated;
GRANT ALL ON public.candidate_documents TO service_role;
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidate_documents_all_auth" ON public.candidate_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.stage_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_history TO authenticated;
GRANT ALL ON public.stage_history TO service_role;
ALTER TABLE public.stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage_history_all_auth" ON public.stage_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_candidates_stage ON public.candidates(stage);
CREATE INDEX idx_candidates_job ON public.candidates(job_id);
CREATE INDEX idx_documents_candidate ON public.candidate_documents(candidate_id);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915092550', '20260915092550_ac201f66-d6fb-470b-8048-dd087f316b69')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260915092618: 20260915092618_17f9d3e8-ba97-425f-8215-17c461e43bcd.sql
--------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915092618', '20260915092618_17f9d3e8-ba97-425f-8215-17c461e43bcd')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260915103810: 20260915103810_d34ee302-81ec-4ae2-9bc2-3cdfd9de7f0b.sql
--------------------------------------------------------------------------
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS interviewer text,
  ADD COLUMN IF NOT EXISTS interview_location text,
  ADD COLUMN IF NOT EXISTS interview_email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS interview_email_sent_at timestamp with time zone;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915103810', '20260915103810_d34ee302-81ec-4ae2-9bc2-3cdfd9de7f0b')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260915104200: 20260915104200_854b27f3-ca55-4560-9bc8-da718e6400fd.sql
--------------------------------------------------------------------------
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS outcome_email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS outcome_email_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ats_breakdown jsonb;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915104200', '20260915104200_854b27f3-ca55-4560-9bc8-da718e6400fd')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260915105200: 20260915105200_28d620e7-62ea-47b8-a552-5398c68b5963.sql
--------------------------------------------------------------------------
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS resume_parsed jsonb;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915105200', '20260915105200_28d620e7-62ea-47b8-a552-5398c68b5963')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260915122728: 20260915122728_3b557d5d-cd57-4a7d-9bee-783c62a545f2.sql
--------------------------------------------------------------------------
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS auto_shortlisted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage alerts" ON public.alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915122728', '20260915122728_3b557d5d-cd57-4a7d-9bee-783c62a545f2')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260915123453: 20260915123453_fead3bea-4708-4218-97a0-4cf410fa21d0.sql
--------------------------------------------------------------------------
-- Roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'recruiter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'recruiter')
  )
$$;

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;
CREATE POLICY "user_roles_admin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Candidates
DROP POLICY IF EXISTS "candidates_all_auth" ON public.candidates;
CREATE POLICY "candidates_staff_read" ON public.candidates
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "candidates_staff_insert" ON public.candidates
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "candidates_staff_update" ON public.candidates
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "candidates_staff_delete" ON public.candidates
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- Candidate documents
DROP POLICY IF EXISTS "candidate_documents_all_auth" ON public.candidate_documents;
CREATE POLICY "candidate_documents_staff_read" ON public.candidate_documents
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "candidate_documents_staff_insert" ON public.candidate_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "candidate_documents_staff_update" ON public.candidate_documents
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "candidate_documents_admin_delete" ON public.candidate_documents
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Jobs
DROP POLICY IF EXISTS "jobs_all_auth" ON public.jobs;
CREATE POLICY "jobs_staff_read" ON public.jobs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "jobs_staff_insert" ON public.jobs
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "jobs_owner_or_admin_update" ON public.jobs
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND (created_by = auth.uid() OR created_by IS NULL OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "jobs_owner_or_admin_delete" ON public.jobs
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Stage history (append-only for staff)
DROP POLICY IF EXISTS "stage_history_all_auth" ON public.stage_history;
CREATE POLICY "stage_history_staff_read" ON public.stage_history
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "stage_history_staff_insert" ON public.stage_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND (changed_by = auth.uid() OR changed_by IS NULL));
CREATE POLICY "stage_history_admin_delete" ON public.stage_history
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Alerts
DROP POLICY IF EXISTS "Authenticated can manage alerts" ON public.alerts;
CREATE POLICY "alerts_staff_read" ON public.alerts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "alerts_staff_insert" ON public.alerts
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "alerts_staff_update" ON public.alerts
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "alerts_admin_delete" ON public.alerts
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profiles
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915123453', '20260915123453_fead3bea-4708-4218-97a0-4cf410fa21d0')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260915123525: 20260915123525_1bb8af01-130f-4aae-b6df-3057e5653e27.sql
--------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915123525', '20260915123525_1bb8af01-130f-4aae-b6df-3057e5653e27')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260915123606: 20260915123606_42412132-2b9a-4dbd-8572-d83aa58ac1cd.sql
--------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'recruiter')
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;

-- Point every policy at the private helpers
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;
CREATE POLICY "user_roles_admin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "candidates_staff_read" ON public.candidates;
CREATE POLICY "candidates_staff_read" ON public.candidates
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "candidates_staff_insert" ON public.candidates;
CREATE POLICY "candidates_staff_insert" ON public.candidates
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "candidates_staff_update" ON public.candidates;
CREATE POLICY "candidates_staff_update" ON public.candidates
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "candidates_staff_delete" ON public.candidates;
CREATE POLICY "candidates_staff_delete" ON public.candidates
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "candidate_documents_staff_read" ON public.candidate_documents;
CREATE POLICY "candidate_documents_staff_read" ON public.candidate_documents
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "candidate_documents_staff_insert" ON public.candidate_documents;
CREATE POLICY "candidate_documents_staff_insert" ON public.candidate_documents
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "candidate_documents_staff_update" ON public.candidate_documents;
CREATE POLICY "candidate_documents_staff_update" ON public.candidate_documents
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "candidate_documents_admin_delete" ON public.candidate_documents;
CREATE POLICY "candidate_documents_admin_delete" ON public.candidate_documents
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "jobs_staff_read" ON public.jobs;
CREATE POLICY "jobs_staff_read" ON public.jobs
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "jobs_staff_insert" ON public.jobs;
CREATE POLICY "jobs_staff_insert" ON public.jobs
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "jobs_owner_or_admin_update" ON public.jobs;
CREATE POLICY "jobs_owner_or_admin_update" ON public.jobs
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()) AND (created_by = auth.uid() OR created_by IS NULL OR private.has_role(auth.uid(), 'admin')))
  WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "jobs_owner_or_admin_delete" ON public.jobs;
CREATE POLICY "jobs_owner_or_admin_delete" ON public.jobs
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "stage_history_staff_read" ON public.stage_history;
CREATE POLICY "stage_history_staff_read" ON public.stage_history
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "stage_history_staff_insert" ON public.stage_history;
CREATE POLICY "stage_history_staff_insert" ON public.stage_history
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND (changed_by = auth.uid() OR changed_by IS NULL));
DROP POLICY IF EXISTS "stage_history_admin_delete" ON public.stage_history;
CREATE POLICY "stage_history_admin_delete" ON public.stage_history
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "alerts_staff_read" ON public.alerts;
CREATE POLICY "alerts_staff_read" ON public.alerts
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "alerts_staff_insert" ON public.alerts;
CREATE POLICY "alerts_staff_insert" ON public.alerts
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "alerts_staff_update" ON public.alerts;
CREATE POLICY "alerts_staff_update" ON public.alerts
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "alerts_admin_delete" ON public.alerts;
CREATE POLICY "alerts_admin_delete" ON public.alerts
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(uuid);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260915123606', '20260915123606_42412132-2b9a-4dbd-8572-d83aa58ac1cd')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260916060542: 20260916060542_4ab57063-c8ef-4e15-8393-5d55e45d2c89.sql
--------------------------------------------------------------------------
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

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260916060542', '20260916060542_4ab57063-c8ef-4e15-8393-5d55e45d2c89')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260916072022: 20260916072022_c6756241-e12f-429c-a98e-b2db87d7abf4.sql
--------------------------------------------------------------------------
-- handle_new_user only runs as a trigger (executes as the function owner), so no role needs EXECUTE
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- confirm_interview is replaced by the token-gated /api/public/confirm-interview server route;
-- drop the publicly executable SECURITY DEFINER function entirely
DROP FUNCTION IF EXISTS public.confirm_interview(uuid);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260916072022', '20260916072022_c6756241-e12f-429c-a98e-b2db87d7abf4')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260916131604: 20260916131604_cace01bb-6dd6-4dac-94c0-99d1097b00f0.sql
--------------------------------------------------------------------------
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

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260916131604', '20260916131604_cace01bb-6dd6-4dac-94c0-99d1097b00f0')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260916131636: 20260916131636_b25e2342-5776-4677-9d5d-f386242438b6.sql
--------------------------------------------------------------------------
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

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260916131636', '20260916131636_b25e2342-5776-4677-9d5d-f386242438b6')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260916174811: 20260916174811_256dd88f-d87a-4417-924f-cedb419f0c68.sql
--------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Team scheduling settings (single row)
CREATE TABLE public.scheduling_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  working_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  work_start time NOT NULL DEFAULT '11:00',
  work_end time NOT NULL DEFAULT '18:00',
  break_start time NOT NULL DEFAULT '13:00',
  break_end time NOT NULL DEFAULT '14:00',
  allow_candidate_reschedule boolean NOT NULL DEFAULT true,
  min_notice_minutes integer NOT NULL DEFAULT 60,
  booking_horizon_days integer NOT NULL DEFAULT 30,
  default_meeting_url text,
  interviewer_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.scheduling_settings TO authenticated;
GRANT ALL ON public.scheduling_settings TO service_role;
ALTER TABLE public.scheduling_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduling_settings_staff_read ON public.scheduling_settings
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY scheduling_settings_staff_insert ON public.scheduling_settings
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY scheduling_settings_staff_update ON public.scheduling_settings
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER update_scheduling_settings_updated_at
  BEFORE UPDATE ON public.scheduling_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.scheduling_settings (id) VALUES (true);

-- 2. Appointment types
CREATE TABLE public.appointment_types (
  code text PRIMARY KEY CHECK (code IN ('SCREENING','INTERVIEW')),
  title text NOT NULL,
  description text,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 240),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.appointment_types TO authenticated;
GRANT ALL ON public.appointment_types TO service_role;
ALTER TABLE public.appointment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointment_types_staff_read ON public.appointment_types
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY appointment_types_staff_update ON public.appointment_types
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER update_appointment_types_updated_at
  BEFORE UPDATE ON public.appointment_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.appointment_types (code, title, description, duration_minutes, sort_order) VALUES
  ('SCREENING', 'Screening Call', 'A short introductory call with the talent acquisition team.', 20, 1),
  ('INTERVIEW', 'Interview Call', 'A detailed interview with the hiring team.', 30, 2);

-- 3. Blocked time
CREATE TABLE public.hr_blocked_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_date date NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_blocked_times_window CHECK (
    (all_day AND start_time IS NULL AND end_time IS NULL)
    OR (NOT all_day AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX hr_blocked_times_date_idx ON public.hr_blocked_times (block_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_blocked_times TO authenticated;
GRANT ALL ON public.hr_blocked_times TO service_role;
ALTER TABLE public.hr_blocked_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_blocked_times_staff_read ON public.hr_blocked_times
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY hr_blocked_times_staff_insert ON public.hr_blocked_times
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY hr_blocked_times_staff_update ON public.hr_blocked_times
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY hr_blocked_times_staff_delete ON public.hr_blocked_times
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

-- 4. Appointments
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  application_code text,
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  candidate_phone text,
  appointment_type text NOT NULL REFERENCES public.appointment_types(code),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  status text NOT NULL DEFAULT 'BOOKED'
    CHECK (status IN ('BOOKED','CANCELLED','COMPLETED','NO_SHOW','RESCHEDULED')),
  meeting_url text,
  interviewer text,
  notes text,
  booked_by text NOT NULL DEFAULT 'candidate' CHECK (booked_by IN ('candidate','hr')),
  candidate_notified boolean NOT NULL DEFAULT false,
  hr_notified boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancellation_reason text,
  rescheduled_from uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  rescheduled_to uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_window CHECK (end_at > start_at),
  -- Atomic double-booking guard: no two live appointments may overlap.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'BOOKED')
);

CREATE INDEX appointments_candidate_idx ON public.appointments (candidate_id);
CREATE INDEX appointments_start_idx ON public.appointments (start_at);

GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_staff_read ON public.appointments
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY appointments_staff_insert ON public.appointments
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY appointments_staff_update ON public.appointments
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Secure candidate scheduling invites (token -> candidate + appointment type)
CREATE TABLE public.scheduling_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  appointment_type text NOT NULL REFERENCES public.appointment_types(code),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, appointment_type)
);

CREATE INDEX scheduling_invites_token_idx ON public.scheduling_invites (token);

GRANT SELECT, INSERT, UPDATE ON public.scheduling_invites TO authenticated;
GRANT ALL ON public.scheduling_invites TO service_role;
ALTER TABLE public.scheduling_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduling_invites_staff_read ON public.scheduling_invites
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY scheduling_invites_staff_insert ON public.scheduling_invites
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY scheduling_invites_staff_update ON public.scheduling_invites
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260916174811', '20260916174811_256dd88f-d87a-4417-924f-cedb419f0c68')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260916174836: 20260916174836_c6e853b5-c6b5-4a10-a7fe-7eb9c8f3eca9.sql
--------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260916174836', '20260916174836_c6e853b5-c6b5-4a10-a7fe-7eb9c8f3eca9')
ON CONFLICT (version) DO NOTHING;

--------------------------------------------------------------------------
-- Migration 20260917061131: 20260917061131_66863905-5de0-43ba-a1d9-54ac746278ac.sql
--------------------------------------------------------------------------
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS shortlisted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS filtered_out_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS interview_invited_at timestamp with time zone;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260917061131', '20260917061131_66863905-5de0-43ba-a1d9-54ac746278ac')
ON CONFLICT (version) DO NOTHING;

