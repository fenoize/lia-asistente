-- Add OneSignal player id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onesignal_player_id text;

-- Notification log to dedupe sends
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  scheduled_for timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  onesignal_notification_id text,
  UNIQUE (user_id, entity_type, entity_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS notification_log_user_idx
  ON public.notification_log (user_id, entity_type, entity_id);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_log_own_select"
  ON public.notification_log FOR SELECT
  USING (auth.uid() = user_id);
