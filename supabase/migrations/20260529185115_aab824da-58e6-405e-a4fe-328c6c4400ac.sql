CREATE TABLE public.finance_debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  creditor TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CLP',
  due_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_debts TO authenticated;
GRANT ALL ON public.finance_debts TO service_role;

ALTER TABLE public.finance_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_debts_own" ON public.finance_debts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER finance_debts_set_updated_at
  BEFORE UPDATE ON public.finance_debts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();