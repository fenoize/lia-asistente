CREATE OR REPLACE FUNCTION public.get_profile_owner_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT owner_id FROM profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "Invited users can read owner profile" ON public.profiles;

CREATE POLICY "Invited users can read owner profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.get_profile_owner_id() = id);

REVOKE EXECUTE ON FUNCTION public.get_profile_owner_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_profile_owner_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_profile_owner_id() TO authenticated;