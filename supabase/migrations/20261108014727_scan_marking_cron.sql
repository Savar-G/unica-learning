-- #720: pg_cron calls the site's /api/scan-marking route every 15 minutes through pg_net, as the retry for scan
-- marking. Send starts marking for sent pages (#721); this job picks up any start that failed or never ran. Vercel cron
-- on the Hobby plan runs only once a day, so it cannot; the Vercel cron in vercel.json stays as a daily backup.
-- The target and the secret live in Supabase Vault, read when the job runs, so neither is in this file or in git:
--   scan_marking_url         the route's full URL, for example https://unicalearning.com/api/scan-marking
--   reminders_cron_secret    the existing secret of the reminders job: the same value as CRON_SECRET in Vercel,
--                            which the route checks; sent as "Authorization: Bearer <secret>"
--   reminders_vercel_bypass  optional: a Vercel protection bypass, only to point the job at a protected preview
-- Until scan_marking_url and reminders_cron_secret exist, the job sends nothing. To change the URL:
--   select vault.update_secret((select id from vault.secrets where name = 'scan_marking_url'), '<new url>');
-- The route answers {"status":"off"} while SCAN_MARKING_ENABLED is off on the deployment it calls, and keeps its own
-- limits (recoverScanMarking): at most 1 photo is marked per run in either mode (families' up to 10 steps only move
-- past photos whose plan is closed). Two runs at once are safe: the claim in scan_marking_command gives one lease,
-- and the other run gets busy.
-- The route may run up to 180 s (maxDuration); the request waits up to 175 s.
-- pg_net keeps each response for 6 hours in net._http_response; cron.job_run_details keeps each run.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'scan-marking-recovery',
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
    timeout_milliseconds := 175000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'scan_marking_url') as url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret') as secret,
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_vercel_bypass') as bypass
  ) s
  where s.url is not null and s.secret is not null;
  $job$
);
