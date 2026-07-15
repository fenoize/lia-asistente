
CREATE TABLE IF NOT EXISTS public.token_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.token_usage TO authenticated;
GRANT ALL ON public.token_usage TO service_role;

ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage" ON public.token_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON public.token_usage
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can read all usage" ON public.token_usage
  FOR SELECT TO authenticated USING (auth.email() = 'diegoulloag@gmail.com');

CREATE INDEX IF NOT EXISTS token_usage_user_created_idx ON public.token_usage(user_id, created_at DESC);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bonus_tokens integer NOT NULL DEFAULT 0;
