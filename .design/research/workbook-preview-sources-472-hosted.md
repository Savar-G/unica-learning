# Saved-source preview hosted checks

HANDOFF_READY

Machine: Savars-MacBook-Pro-5.local. Base implementation: e1c0880d3b363d97d496a990fb86856cc7902367.

The independent Sol source/SQL review passed: 83 focused tests and 19 local SQL cases, no confirmed findings. Root applied the additive migration through Supabase MCP. Hosted migration history records 20261107144016, workbook_preview_sources. The local SQL file now uses that exact version. SQL bytes are unchanged from the reviewed candidate.

Root ran npm run db:types successfully. The official generated file has 90 added lines and zero removed lines. Existing peer declarations remain. database.ts has only the nullable payload/hash argument correction. The typed client adapter uses the generated workbook_preview_command RPC without query type overrides.

Root's five focused suites passed 86 tests, exit 0. Three new tests pass through the real Supabase HTTP client with a fake transport. They check scoped arguments and explicit null payload/hash on read, exact save bytes/hash, and denied RPC refusal. Scoped lint/types pass. A broken adapter that drops the explicit null hash fails the new read-argument assertion (one failure, two tests outside the filter). Restoring the exact source passes all three adapter tests.

Hosted catalog checks: RLS enabled; zero preview rows before the proof; anon SELECT and RPC execution denied; authenticated INSERT and RPC execution denied; service-role RPC execution granted.

The hosted synthetic proof used a new owned family, Admin actor and two book headers in one nested rollback. It called the actual save/read RPC under service_role. It proved saved, duplicate, exact payload/hash readback and corrupt-hash refusal. Under authenticated, the intended Admin read one row and the parent read zero rows. Browser RPC execution and anon SELECT were refused. All test rows rolled back. No family deletion, external transport, provider, email, charge, plan start, customer book or queue action occurred.

This proves hosted SQL grants/RLS and bounded storage behavior. It does not prove a signed-in HTTP route, a complete successful progress plan, provider behavior, or a UI. Raw synthetic source/query/result files remain private in overnight-20261107/472-preview-hosted-*. No real parent data was used.

The persisted outcome remains unavailable. Frozen prior mastery, original planning inputs, complete issued decisions and canonical second tries are not recoverable from existing legacy rows. No source completeness or empty-history claim is invented. #472 is incomplete and #473 remains unstarted. The Admin HTML design is separate and unmerged. All customer/print/email/provider holds remain.
