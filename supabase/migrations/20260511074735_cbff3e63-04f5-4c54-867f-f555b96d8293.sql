
ALTER TABLE public.profiles ALTER COLUMN assistant_name SET DEFAULT 'Lia';
ALTER TABLE public.profiles ALTER COLUMN assistant_gender SET DEFAULT 'feminine';
UPDATE public.profiles SET assistant_name = 'Lia' WHERE assistant_name = 'Alfred' OR assistant_name IS NULL;
UPDATE public.profiles SET assistant_gender = 'feminine' WHERE assistant_gender = 'masculine' OR assistant_gender IS NULL;
