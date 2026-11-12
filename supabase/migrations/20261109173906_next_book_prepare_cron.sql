-- Read the existing reminders secrets at run time. The route has a 60 second limit.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'next-book-prepare',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := regexp_replace(s.url, '/api/reminders.*$', '/api/next-book-prepare'),
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || s.secret,
      'x-vercel-protection-bypass', s.bypass
    )),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_url') as url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret') as secret,
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_vercel_bypass') as bypass
  ) s
  where s.url is not null and s.secret is not null;
  $job$
);
