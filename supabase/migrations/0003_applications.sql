-- Uma candidatura preparada por vaga e por usuário; nota livre do app (idioma, currículo).
alter table public.ls_applications add column note text;
create unique index ls_applications_user_job_key on public.ls_applications (user_id, job_id);
