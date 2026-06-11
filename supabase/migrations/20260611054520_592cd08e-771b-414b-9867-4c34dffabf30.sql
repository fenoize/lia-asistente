ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lia_tone text,
  ADD COLUMN IF NOT EXISTS work_days text[] DEFAULT ARRAY['mon','tue','wed','thu','fri']::text[],
  ADD COLUMN IF NOT EXISTS work_start time,
  ADD COLUMN IF NOT EXISTS work_end time;