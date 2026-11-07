# #475 reminder episode schema

HOSTED_SCHEMA_APPLIED_ADAPTER_PENDING

- Machine: Savars-MacBook-Pro-5.local.
- Applied migration: 20261107073840_workbook_scan_reminder_episodes.
- Reviewed SQL SHA256: 87d7a889400388993403c47f3e2272523c6ccf7b945c9b6c82a010bbebca0b2a. The source body is unchanged from reviewed84767a3e.
- Preflight at2026-11-07T07:38:25.040857Z found no prior episode table, zero active workbook runs and zero active edits.
- apply_migration returned success. list_migrations confirmed the recorded version.
- All four new tables have RLS. Anonymous SELECT and authenticated write privileges are false.
- All eight public functions use SECURITY DEFINER with an empty search path. Anonymous and authenticated execution are false; service execution is true. The two sampled private helpers deny all three caller roles.
- email_log retains its existing constraints. Only the kind list and parent-level kind list add scan_inactivity.
- Post-apply counts are zero episodes and zero reminder messages. These counts do not prove positive admission or RLS filtering.
- npm run db:types exited0. Official types add475lines and remove0lines from the previous file. No generated declaration was edited by hand.
- The local receipt migration filename now matches its existing hosted version20261106213840. SQL content is unchanged. Test harness paths use the recorded versions.

No scheduler, email transport, family switch or next-book queue was enabled. No customer book was written. Hosted positive admission, role probes, adapter checks, independent integration review and the full gate remain open.
