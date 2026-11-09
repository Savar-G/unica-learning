-- #727: the scan-photo-cleanup job had no timeout_milliseconds, so pg_net's 5 s default applied and a slow
-- cleanup run was recorded as a timeout with no result (net._http_response, 2026-11-08 01:45 UTC).
-- /api/scan-cleanup has maxDuration 60 s, so the job now waits 65 s for its answer.
-- cron.schedule with an existing job name updates that job in place: same name, schedule, URL, headers and body.
-- Additive: no unschedule, no DROP. The existing reminders secrets are read at runtime; no secret value enters this migration.
-- The other jobs need no change: assessment-reminders and workbook-welcome-emails already set 60 s,
-- scan-marking-recovery sets 175 s, and scan-photo-expiry calls a SQL function, not a web request.
select cron.schedule('scan-photo-cleanup','*/15 * * * *', $job$
  select net.http_post(
    url := regexp_replace((select decrypted_secret from vault.decrypted_secrets where name='reminders_url'), '/api/reminders.*$', '/api/scan-cleanup'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='reminders_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 65000
  );
$job$);
