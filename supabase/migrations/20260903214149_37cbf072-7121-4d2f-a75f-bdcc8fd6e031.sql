REVOKE EXECUTE ON FUNCTION public.get_profile_owner_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_profile_owner_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_profile_owner_id(uuid) TO authenticated;