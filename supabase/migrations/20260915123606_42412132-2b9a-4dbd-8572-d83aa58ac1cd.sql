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