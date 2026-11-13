# Robin physical evaluation verification

Computer: Savar's MacBook. Branch: `site/scan-marking-phone-proof`.

The implementation at `0303b7440edcdf00af4ababa2b385239e70a0137` passed independent Sol review of the source and SQL. The review found one document count error. Both documents now require 158 region rows for two complete phone series: 78 automatic regions and one parent row per phone. The set has 148 item labels, including 146 automatic items and two parent-method items. The retained generated template reproduces these counts. No truth labels, source, scorer or D-267 rule changed for this correction.

The independent review passed 136 baseline tests, 35 additional controls and six supplied local SQL cases. Its actual-current-main SQL checks used separate PostgreSQL sessions. A mutation that removed aggregate admission allowed USD 16; the candidate refused the same second reservation and retained USD 14. These are local synthetic checks.

Actual PR #697 merge `89963c956d5eee2b87d18c58e9c35181b9aeef7f` is integrated. All incoming non-type paths and all six reviewed physical runtime, test and SQL paths retain exact bytes. Official generated types add only the new function declaration, with no removed declaration.

Hosted migration `scan_marking_physical_evaluation` is recorded at `20261107100327`. The new function has an empty search path and service-only execution. Anonymous and authenticated roles have no execute grant. Four predecessor function body hashes match the pre-application values. Production marking admission is unchanged.

The hosted rollback probe checked invalid bounds, the aggregate USD 15 stop with prior charges and holds, service-role reservation and refusal of the next request while that reservation has unknown cost. No HTTP dispatch, settlement, tokens or generation ID was created. The transaction rolled back. Afterward, zero probe runs remained. The original 644 spend rows and USD 2.078815 total liability were unchanged. The security advisor returned no notice for the new function. Local concurrency proof is separate from this hosted probe.

Production is still restricted to the two owned synthetic test parents. No physical photo, new provider request, final model selection or real-family release follows from these checks. Real Robin photos and independent human labels remain missing. Root still requires the final integration review, full test/lint/build gate and exact-head remote checks before this tool merges.
