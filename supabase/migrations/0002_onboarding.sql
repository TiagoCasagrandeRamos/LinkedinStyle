-- Onboarding obrigatório, validação de currículos, idioma das vagas, storage privado.

alter table public.ls_profiles
  add column onboarding_step int not null default 1,
  add column onboarding_completed_at timestamptz;

alter table public.ls_resumes
  add column original_name text,
  add column parsed jsonb,               -- estrutura extraída, só vale depois da validação
  add column confirmed_at timestamptz;   -- null = ainda não validado pelo usuário

alter table public.ls_job_preferences
  add column currency text not null default 'BRL',
  add column salary_period text not null default 'month' check (salary_period in ('month','year','hour')),
  add column salary_target numeric,
  add column daily_job_limit int not null default 5 check (daily_job_limit between 1 and 50),
  add column min_score_outreach int not null default 80 check (min_score_outreach between 0 and 100);

alter table public.ls_content_settings
  add column posts_per_week int not null default 3 check (posts_per_week between 0 and 14),
  add column post_days int[] not null default '{1,3,5}',
  add column post_time time not null default '09:00',
  add column timezone text not null default 'America/Sao_Paulo';

alter table public.ls_jobs
  add column language text check (language in ('pt','en')),
  add column language_confidence numeric;

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "resumes: dono lê" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "resumes: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "resumes: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
