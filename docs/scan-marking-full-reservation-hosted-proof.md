# Hosted evaluation full-reservation proof

The evaluation-only resolution is applied and verified. The original transport evidence still has no provider cost, token count or generation ID. The full reservation is a permanent conservative accounting charge.

- Reviewed migration source: `6b45dc1b2039dda6be9b37f344fc33c129df3eb9`.
- Applied hosted migration: `20261107040916_scan_marking_evaluation_full_reservation`.
- Independent Sol review: 143 local SQL cases passed, no findings.
- Hosted effective grants: only service_role can execute the RPC and read the audit. No application role has direct audit write privileges. RLS and the explicit service-read policy are present. The definer function has an empty search path.
- All 12 existing marking and evaluation function definitions retain their pre-migration hashes. The production marking admission and unknown-cost rule are unchanged. Security advisor groups and counts are unchanged.

The hosted service-role rollback probe resolved the actual saved timeout evidence inside a transaction. It checked audit equality and the database settlement time, refusal of a duplicate resolution and a later lower settlement, both retained clean429 holds, unchanged aggregate liability, admission of a new bounded evaluation, direct-write refusal and owner rewrite refusal. Rollback restored the original charge to null, with zero audit rows, 484 spend rows and 1,308,144 microdollars of total liability. No probe row remained.

Service HTTP probes returned 200 with five bytes and false for invalid resolution arguments. The audit read returned 200 with two bytes and zero rows before the real resolution. Browser denial is proved by hosted effective SQL grants; no authenticated browser request was made.

## Authorized actual resolution

- Attempt: `62aeafd4-706c-43ec-b4b4-cd6f3bbc3814`.
- Run: `8f98a4fcb8619e8ad3ab4b00c15d68db8d2c42eef220d5bce585b15526046094`.
- Outcome: `unknown, charged at its full reservation`.
- Amount: 147948 microdollars (USD 0.147948).
- Actor: T3 root 3bca1308-250a-40c1-ace1-367fd1f5fa4f; authorized by Savar in this thread.
- Database time: 2026-11-07T04:12:07.410689+00:00.
- Original journal byte SHA-256: `aa87412fe7e2bdc268b9a5b9ec25e04f57da4447e2a8a35cea96d9f289213da9`.

After this resolution the ledger has 1,010,728 microdollars charged and 297,416 microdollars held. Total liability remains 1,308,144 microdollars. The two validated clean429 holds remain. No unclassified evaluation hold remains. Every usage field in the saved timeout evidence remains null. The old run remains stopped and cannot be resumed through this operation.

Official types were generated with `npm run db:types`. The generated file adds declarations only and retains the already applied Parent Explanations schema. No manual type edit was made. Source evidence, the hosted rollback receipt, service HTTP receipt and actual audit receipt are saved under the controller's `comparison/full-reservation-resolution/` evidence folder.

No model call, real-child photo, family switch, print change or production model selection occurred in these hosted checks. The separate two-model v7 comparison remains required. These checks establish accounting and access behavior, not recognition accuracy or family-release readiness.

