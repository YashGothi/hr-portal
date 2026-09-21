-- handle_new_user only runs as a trigger (executes as the function owner), so no role needs EXECUTE
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- confirm_interview is replaced by the token-gated /api/public/confirm-interview server route;
-- drop the publicly executable SECURITY DEFINER function entirely
DROP FUNCTION IF EXISTS public.confirm_interview(uuid);