ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS assistant_name text DEFAULT 'Alfred',
ADD COLUMN IF NOT EXISTS assistant_gender text DEFAULT 'masculine';