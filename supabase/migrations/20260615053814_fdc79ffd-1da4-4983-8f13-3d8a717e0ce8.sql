ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;