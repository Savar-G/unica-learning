-- A 15-minute cleanup retry keeps rejected files below 24 hours even after one failed removal.
-- The existing reminders secrets are read at runtime; no secret value enters this migration.
select cron.schedule('scan-photo-cleanup','*/15 * * * *', $job$
  select net.http_post(
    url := regexp_replace((select decrypted_secret from vault.decrypted_secrets where name='reminders_url'), '/api/reminders.*$', '/api/scan-cleanup'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='reminders_cron_secret')),
    body := '{}'::jsonb
  );
$job$);
