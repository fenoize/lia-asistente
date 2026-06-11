
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS notification_log_user_unread_idx
  ON public.notification_log (user_id, sent_at DESC)
  WHERE read_at IS NULL;

GRANT SELECT, UPDATE ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;

DROP POLICY IF EXISTS "notification_log_own_update" ON public.notification_log;
CREATE POLICY "notification_log_own_update" ON public.notification_log
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
