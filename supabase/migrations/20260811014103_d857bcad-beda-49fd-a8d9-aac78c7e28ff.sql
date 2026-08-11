CREATE TABLE IF NOT EXISTS public.task_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  notification_count integer NOT NULL DEFAULT 0,
  last_notification_at timestamptz,
  last_state text,
  last_intent text,
  last_message text,
  user_response text,
  responded_at timestamptz,
  snoozed_until timestamptz,
  dismissed boolean NOT NULL DEFAULT false,
  blocked boolean NOT NULL DEFAULT false,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_followups TO authenticated;
GRANT ALL ON public.task_followups TO service_role;

ALTER TABLE public.task_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own task followups"
ON public.task_followups FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS task_followups_user_idx ON public.task_followups (user_id);

CREATE TRIGGER task_followups_set_updated_at
BEFORE UPDATE ON public.task_followups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followup_prefs jsonb NOT NULL
  DEFAULT '{"enabled":true,"frequency":"normal","preferred_hour":9,"undated":true,"stale_cleanup":true,"daily_budget":3}'::jsonb;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS discarded_at timestamptz;