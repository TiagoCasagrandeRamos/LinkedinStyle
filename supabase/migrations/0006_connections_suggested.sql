alter table public.ls_connections
  add column job_id uuid references public.ls_jobs(id) on delete set null,
  add column kind text not null default 'rede' check (kind in ('vaga','rede')),
  add column invite_note text,
  add column followup_message text,
  add column reason text;
create unique index ls_connections_user_url on public.ls_connections (user_id, profile_url) where profile_url is not null;
