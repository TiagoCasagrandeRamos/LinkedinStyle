-- LinkedinStyle: schema inicial. Tudo por usuário, com RLS. Tabelas com prefixo ls_ para conviver com outros apps no mesmo projeto.
create extension if not exists pgcrypto;

create table public.ls_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text, phone text, city text,
  answers jsonb not null default '{}'::jsonb,       -- respostas salvas para candidaturas
  weights jsonb not null default '{"requirements":30,"modeLocation":20,"salary":20,"company":15,"seniorityArea":15}',
  llm_key_encrypted text,                            -- chave do LLM, criptografada pelo app
  created_at timestamptz not null default now()
);

create table public.ls_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (language in ('pt','en','es')),
  file_path text not null, text_content text,
  created_at timestamptz not null default now()
);

create table public.ls_job_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  titles text[] not null default '{}', seniority text[] not null default '{}',
  work_modes text[] not null default '{}', cities text[] not null default '{}',
  salary_floor numeric, contract_types text[] not null default '{}',
  freelance_ok boolean not null default false,
  preferred_sectors text[] not null default '{}',
  blocked_companies text[] not null,                 -- lista obrigatória (pode ser vazia, mas declarada)
  updated_at timestamptz not null default now()
);

create table public.ls_content_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pillars jsonb not null default '[]', cadence jsonb not null default '{}',
  languages text[] not null default '{pt}', tone text, avoid text[] not null default '{}'
);

create table public.ls_job_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('greenhouse','lever','ashby','workable','gupy','feed')),
  slug_or_url text not null, company text, active boolean not null default true,
  unique (user_id, kind, slug_or_url)
);

create table public.ls_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null, external_id text not null, dedupe_key text not null,
  company text not null, title text not null, url text not null, location text,
  work_mode text, description text, salary_min numeric, salary_max numeric,
  posted_at timestamptz, collected_at timestamptz not null default now(),
  score int, score_parts jsonb, score_justification jsonb, blocked boolean not null default false,
  unique (user_id, dedupe_key)
);

create table public.ls_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.ls_jobs(id) on delete cascade,
  resume_id uuid references public.ls_resumes(id),
  fields jsonb not null default '[]',                -- campos resolvidos e pendentes
  status text not null default 'draft' check (status in ('draft','needs_input','ready','sent_by_user')),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ls_profiles','ls_resumes','ls_job_preferences','ls_content_settings','ls_job_sources','ls_jobs','ls_applications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

create index on public.ls_jobs (user_id, score desc);
create index on public.ls_resumes (user_id);
create index on public.ls_job_sources (user_id);
create index on public.ls_applications (user_id);
create index on public.ls_applications (job_id);
