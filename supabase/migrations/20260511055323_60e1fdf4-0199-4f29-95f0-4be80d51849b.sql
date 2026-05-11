-- contacts table
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'client', -- 'client' | 'collaborator'
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  role TEXT,
  status TEXT DEFAULT 'active', -- 'lead' | 'active' | 'inactive' (clients only)
  notes TEXT,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_own" ON public.contacts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_contacts_user_type ON public.contacts(user_id, type);

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'completed'
  due_date TIMESTAMPTZ,
  budget NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_own" ON public.projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_projects_user ON public.projects(user_id);
CREATE INDEX idx_projects_client ON public.projects(client_id);

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- tasks: add project + collaborator
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to);