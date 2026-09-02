ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) NULL;

UPDATE public.profiles
  SET owner_id = 'e3a48b61-c509-45d5-a569-b3d8e078de7a'
  WHERE id = '4c579ca5-969b-435f-bd4a-6d7eeee1af06';

-- Permitir que un usuario invitado lea el perfil de su owner (para resolución de plan/cuota)
CREATE POLICY "Invited users can read owner profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid() AND p.owner_id = profiles.id
    )
  );

-- Permitir que un usuario invitado lea el consumo de tokens registrado a nombre de su owner
CREATE POLICY "Users can read owner usage"
  ON public.token_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND owner_id = token_usage.user_id
    )
  );

-- Permitir que un usuario invitado inserte consumo de tokens a nombre de su owner
CREATE POLICY "Users can insert owner usage"
  ON public.token_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND owner_id = user_id
    )
  );