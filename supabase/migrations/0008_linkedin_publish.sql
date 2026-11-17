create table public.ls_linkedin_auth (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token_encrypted text not null,
  expires_at timestamptz not null,
  member_urn text not null,
  member_name text,
  connected_at timestamptz not null default now()
);
alter table public.ls_linkedin_auth enable row level security;
create policy "own rows" on public.ls_linkedin_auth for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.ls_profiles add column auto_publish_enabled boolean not null default false;
alter table public.ls_posts
  add column auto_publish boolean not null default false,
  add column publishing_started_at timestamptz,
  add column published_urn text,
  add column published_url text,
  add column art_path text;
create index on public.ls_posts (status, auto_publish, scheduled_for) where auto_publish;

insert into storage.buckets (id, name, public) values ('art', 'art', false) on conflict do nothing;
create policy "art: dono lê" on storage.objects for select to authenticated
  using (bucket_id = 'art' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "art: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'art' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "art: dono atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'art' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "art: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'art' and (storage.foldername(name))[1] = (select auth.uid())::text);
