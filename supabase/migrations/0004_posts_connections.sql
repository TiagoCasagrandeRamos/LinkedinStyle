create table public.ls_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pillar text, language text not null default 'pt' check (language in ('pt','en')),
  title text, body text not null default '',
  status text not null default 'rascunho' check (status in ('rascunho','agendado','publicado')),
  scheduled_for timestamptz, published_at timestamptz, created_at timestamptz not null default now()
);
create table public.ls_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, company text, role text, profile_url text, note text,
  status text not null default 'para_abordar' check (status in ('para_abordar','abordado','respondeu','conectado')),
  follow_up_at date, created_at timestamptz not null default now()
);
alter table public.ls_posts enable row level security;
alter table public.ls_connections enable row level security;
create policy "own rows" on public.ls_posts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.ls_connections for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index on public.ls_posts (user_id, scheduled_for);
create index on public.ls_connections (user_id, status);
