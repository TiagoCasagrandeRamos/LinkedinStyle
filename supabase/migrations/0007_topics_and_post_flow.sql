create table public.ls_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pillar text not null, pillar_color text,
  title text not null, angle text,
  source_title text, source_name text, source_url text not null, source_date timestamptz,
  keyword text, rank_score numeric not null default 0,
  status text not null default 'sugerida' check (status in ('sugerida','aprovada','descartada')),
  discard_reason text check (discard_reason in ('fora_do_tema','ja_falei','fonte_fraca','nao_concordo')),
  post_id uuid, created_at timestamptz not null default now(),
  unique (user_id, source_url)
);
alter table public.ls_topics enable row level security;
create policy "own rows" on public.ls_topics for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index on public.ls_topics (user_id, status, rank_score desc);

alter table public.ls_posts drop constraint ls_posts_status_check;
alter table public.ls_posts add constraint ls_posts_status_check check (status in ('rascunho','roteiro','texto','arte','agendado','publicado'));
alter table public.ls_posts
  add column angle text, add column pillar_color text, add column topic_id uuid references public.ls_topics(id) on delete set null,
  add column source_title text, add column source_name text, add column source_url text, add column source_date timestamptz,
  add column script jsonb, add column script_approved boolean not null default false,
  add column body_secondary text, add column secondary_language text check (secondary_language in ('pt','en')),
  add column art_phrase text,
  add column failed boolean not null default false, add column error text,
  add column approval text not null default 'manual' check (approval in ('manual'));

-- Fonte e data ficam travadas no registro depois que existem.
create or replace function public.ls_lock_post_source() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.source_url is not null and (
    new.source_url is distinct from old.source_url or new.source_name is distinct from old.source_name
    or new.source_title is distinct from old.source_title or new.source_date is distinct from old.source_date) then
    raise exception 'A fonte e a data deste post são travadas e não podem ser alteradas';
  end if;
  return new;
end $$;
create trigger ls_posts_lock_source before update on public.ls_posts for each row execute function public.ls_lock_post_source();
