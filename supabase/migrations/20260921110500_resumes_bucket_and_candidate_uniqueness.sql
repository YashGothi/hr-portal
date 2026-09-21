-- 1. Create the private 'resumes' storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,
  8388608,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[];

-- 2. Staff read policy for HR users to read resume objects
-- Public/anonymous uploads and retrievals are managed exclusively through server-side functions (service_role).
-- Anonymous users are granted NO direct select, insert, update, or delete access on storage.objects.
DROP POLICY IF EXISTS "resumes_staff_read" ON storage.objects;
CREATE POLICY "resumes_staff_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resumes' AND private.is_staff(auth.uid()));

-- 3. Prevent duplicate candidate applications per job and normalized email
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_job_email
  ON public.candidates(job_id, lower(email));
