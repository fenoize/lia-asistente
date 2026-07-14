
CREATE POLICY "Admin puede actualizar cualquier perfil"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.email() = 'diego@kbum.cl')
  WITH CHECK (auth.email() = 'diego@kbum.cl');
