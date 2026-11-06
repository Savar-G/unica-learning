# Main integration after the URL repair

Integrated main bd99961874a88700ca7de2ac72609a0aaed69f75 into the S8 candidate after malformed-URL fix 2034c13011a3335bf9585aa4a6de5b7716a5737e. This main includes PR674 and the deployed Admin dashboard explorer from PR673.

The only source conflict was src/components/scan-pages.tsx. Keep main's exported ScanListing and optional initial data for the static Admin preview. Keep S8's sessionCurrent and epoch guards, including a failed late load after an account change. No Send, scoring, profile or release behavior was changed to resolve the conflict.

Falsifiers: a broken Admin synthetic preview, lost session guard, failed public URL redaction, or a failure in the complete tests, source lint or build blocks this integration.

The first run failed because this checkout's node_modules lacked parse5 from the incoming lockfile. It was not a passing run. npm ci restored the locked dependency set without changing package files. The repeated complete gate passed: 456 test files, 16,854 tests passed, one optional skip, exit 0; source ESLint exit 0; normal build exit 0. The build includes TypeScript. No source changed during these checks.

Durable logs: /Users/savargupta/unica-workbook-samples/parent-dashboard-remaining-20261106/pd470-main-restored-full.log, pd470-main-restored-lint.log and pd470-main-restored-build.log. These are local checks. Hosted and browser evidence remains recorded separately. A new independent fixed-head F1 and integration recheck is required. No new provider call, migration, price, switch or CI workflow change was made for this integration.
