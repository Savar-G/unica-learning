-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_reminder_cron, 2026-10-11.
-- The reminder job (#73, D-085): pg_cron calls the site's /api/reminders route every 15 minutes through pg_net.
-- Vercel cron on this plan runs only once a day, so it cannot.
-- The target and the secret live in Supabase Vault, read when the job runs, so neither is in this file or in git:
--   reminders_url          the route's full URL, for example https://unicalearning.com/api/reminders
--   reminders_cron_secret  the same value as CRON_SECRET in Vercel; sent as "Authorization: Bearer <secret>"
--   reminders_vercel_bypass  optional: a Vercel protection bypass, only to point the job at a protected preview
-- Until reminders_url and reminders_cron_secret exist, the job sends nothing. To change one:
--   select vault.update_secret((select id from vault.secrets where name = 'reminders_url'), '<new url>');
-- The route answers 404 while the pilot setting is off on the deployment it calls, and sends nothing.
-- pg_net keeps each response for 6 hours in net._http_response; cron.job_run_details keeps each run.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'assessment-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := s.url,
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
