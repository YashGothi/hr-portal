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