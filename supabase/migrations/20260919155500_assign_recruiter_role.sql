-- Assign verified recruiter role to the current HR user
INSERT INTO public.user_roles (user_id, role)
VALUES ('5e8f0db2-abf4-4146-905c-d985e4935389', 'recruiter'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
