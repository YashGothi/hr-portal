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