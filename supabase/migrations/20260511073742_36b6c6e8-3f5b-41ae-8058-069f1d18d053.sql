
-- Finance tables for Alfred
CREATE TABLE public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'bank',
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CLP',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_accounts_own" ON public.finance_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_finance_accounts_updated BEFORE UPDATE ON public.finance_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.finance_incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CLP',
  client_id uuid,
  project_id uuid,
  due_date date,
  paid_at date,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_incomes_own" ON public.finance_incomes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_finance_incomes_updated BEFORE UPDATE ON public.finance_incomes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CLP',
  category text,
  project_id uuid,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_expenses_own" ON public.finance_expenses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_finance_expenses_updated BEFORE UPDATE ON public.finance_expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.finance_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CLP',
  frequency text NOT NULL DEFAULT 'monthly',
  next_charge_date date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_subscriptions_own" ON public.finance_subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_finance_subscriptions_updated BEFORE UPDATE ON public.finance_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
