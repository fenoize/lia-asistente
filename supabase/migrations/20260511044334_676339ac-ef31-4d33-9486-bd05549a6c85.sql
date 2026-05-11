
-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  timezone text default 'America/Santiago',
  role text,
  goals text,
  onboarding_completed boolean default false,
  plan text default 'free',
  preferred_model text default 'google/gemini-3-flash-preview',
  created_at timestamptz default now()
);

-- TASKS
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending',
  priority text not null default 'medium',
  due_date timestamptz,
  project text,
  ai_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- MEETINGS
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  datetime timestamptz not null,
  duration_minutes int default 60,
  location text,
  notes text,
  preparation_needed boolean default false,
  created_at timestamptz default now()
);

-- REMINDERS
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  datetime timestamptz not null,
  recurrence text default 'none',
  done boolean default false,
  created_at timestamptz default now()
);

-- NOTES
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  type text default 'note',
  linked_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz default now()
);

-- CHAT MESSAGES
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- DAILY BRIEFS
create table public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  generated_at timestamptz default now(),
  date date default current_date
);

-- RLS
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.meetings enable row level security;
alter table public.reminders enable row level security;
alter table public.notes enable row level security;
alter table public.chat_messages enable row level security;
alter table public.daily_briefs enable row level security;

create policy "profiles_own" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "tasks_own" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meetings_own" on public.meetings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reminders_own" on public.reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes_own" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chat_messages_own" on public.chat_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_briefs_own" on public.daily_briefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at trigger for tasks
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();
