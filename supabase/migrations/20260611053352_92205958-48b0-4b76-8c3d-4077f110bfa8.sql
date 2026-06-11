ALTER TABLE public.finance_incomes ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.finance_expenses ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.finance_subscriptions ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_incomes_account_id ON public.finance_incomes(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_account_id ON public.finance_expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_subscriptions_account_id ON public.finance_subscriptions(account_id);