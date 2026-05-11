
ALTER TABLE public.finance_expenses
  ADD COLUMN expense_type text NOT NULL DEFAULT 'one_time',
  ADD COLUMN task_id uuid;
