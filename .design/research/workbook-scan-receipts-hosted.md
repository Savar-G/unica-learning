# Workbook scan receipts: hosted schema record

HOSTED_CATALOG_VERIFIED

This record does not complete #475 or authorize family release.

- Computer: Savars-MacBook-Pro-5.local.
- Reviewed source: d8ab955d41cc5df27fc8f6acf9cb9a6f8b582e0c.
- Project: cdjobwsyzndtltzfpyqa.
- Hosted PostgreSQL: 17.11, aarch64 Linux.
- Applied migration: 20261106213840_workbook_scan_receipts.
- Source file: supabase/migrations/20261106224500_workbook_scan_receipts.sql.
- Source SHA-256: d3156ac70bd3e301ef58ebfc92baf49697b3c270f28fbf45a769f03d3257b7ba.
- Migration application returned success. The migration list contains this version and name.
- `npm run db:types` completed. The generated file adds 573 lines for this schema. It was not edited by hand.

Before application, the required workbook, page, child and delivery identity keys existed. None of the eight new tables existed. The source file equalled the independently approved migration.

After application, all eight new tables have RLS. All deny direct INSERT, UPDATE, DELETE and TRUNCATE to anon, authenticated and service_role. Service SELECT is granted. Seven family-owned tables have the checked admin SELECT policy. The installation epoch has no browser policy.

All twelve new function grants were inspected. Every function has an empty search path. Anon can execute none. Authenticated can execute only the checked admin reconciliation wrapper. Service can execute only the reconciliation, missing-clock read and calendar-record wrappers. Internal admission and clock helpers are not externally executable.

All five new hooks are enabled: receipt capture on photos and calibrations, pending-resolution capture on marking items, and re-evaluation on delivery receipts and corrections. The catalog hashes of assert_family_writable, both family/child fence functions, is_admin, confirm_workbook_delivery and correct_workbook_delivery match the pre-application hashes.

The empty reconciliation and bounded missing-clock read each returned an empty array. No backfill, customer scan, trigger claim, calendar, email, queue or family-switch action ran in these probes.

The security advisor changed only as expected for this schema: one informational RLS-without-policy item for the service-only epoch and one authenticated SECURITY DEFINER item for the checked admin wrapper. Their privileges and authorization checks are intentional. Existing unrelated advisor items remain unchanged. References: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy and https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.

Proof limits: these are hosted migration, catalog, grant, hook and empty-RPC checks. They do not prove positive/negative row visibility with populated QA data, actual PostgREST credentials, Storage bytes, concurrent hosted admission, the complete deletion worker, the typed adapter, a deployed recovery loop, email episodes, unsubscribe, UI, the full gate or release. Those checks remain open. The prior independent review supplies separate local public-interface and PostgreSQL concurrency evidence.

The first customer draft remains at revision 1. No customer page, print source, QR code, print approval or physical print action changed.
