
CREATE TABLE public.plan_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_email text NOT NULL,
  old_plan text,
  new_plan text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.plan_events TO authenticated;
GRANT ALL ON public.plan_events TO service_role;

ALTER TABLE public.plan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read plan_events"
  ON public.plan_events FOR SELECT
  TO authenticated
  USING (auth.email() = 'diego@kbum.cl');

CREATE POLICY "Admin can insert plan_events"
  ON public.plan_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.email() = 'diego@kbum.cl');

CREATE INDEX plan_events_user_id_idx ON public.plan_events(user_id);
CREATE INDEX plan_events_created_at_idx ON public.plan_events(created_at DESC);

CREATE POLICY "Admin puede leer todos los perfiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.email() = 'diego@kbum.cl');
