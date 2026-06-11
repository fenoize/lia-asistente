
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_type text DEFAULT 'in_person',
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meetings_meeting_type_check'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_meeting_type_check
      CHECK (meeting_type IN ('in_person','video','phone'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meetings_status_check'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_status_check
      CHECK (status IN ('scheduled','in_progress','done','cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS meetings_user_datetime_idx ON public.meetings (user_id, datetime);
CREATE INDEX IF NOT EXISTS meetings_status_idx ON public.meetings (user_id, status);

DROP TRIGGER IF EXISTS meetings_set_updated_at ON public.meetings;
CREATE TRIGGER meetings_set_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS policies for meeting-media storage bucket (bucket itself created via storage tool)
CREATE POLICY "meeting_media_own_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'meeting-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "meeting_media_own_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'meeting-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "meeting_media_own_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'meeting-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "meeting_media_own_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'meeting-media' AND (storage.foldername(name))[1] = auth.uid()::text);
