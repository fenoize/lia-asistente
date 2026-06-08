
-- Add start_date column
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date timestamp with time zone;

-- Migrate status values: pending/in_progress → borrador, done → listo
UPDATE public.tasks SET status = 'listo' WHERE status = 'done';
UPDATE public.tasks SET status = 'borrador' WHERE status NOT IN ('listo', 'en_curso', 'borrador');

-- Update default
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'borrador';

-- Constraint to allow only the 3 valid values
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('borrador', 'en_curso', 'listo'));
