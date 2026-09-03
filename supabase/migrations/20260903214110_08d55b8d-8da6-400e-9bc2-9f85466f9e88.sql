CREATE OR REPLACE FUNCTION public.get_profile_owner_id(user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT owner_id FROM profiles WHERE id = user_id;
$$;

DROP POLICY IF EXISTS "Invited users can read owner profile" ON public.profiles;

CREATE POLICY "Invited users can read owner profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.get_profile_owner_id(auth.uid()) = id);