-- Agenda a publicação automática dentro do Supabase (a cada 5 minutos).
-- Antes de aplicar, guarde no Vault o endereço do app e o segredo (o mesmo valor de PUBLISH_SECRET no Vercel):
--   select vault.create_secret('https://SEU-DOMINIO/api/cron/publish', 'publish_url');
--   select vault.create_secret('SEGREDO_LONGO_ALEATORIO', 'publish_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ls-publicar-posts',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'publish_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publish_secret')),
    timeout_milliseconds := 55000
  );
  $$
);
