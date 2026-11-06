# PR637 dependency integration

Machine: Savars-MacBook-Pro-5.local. Worktree: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-3fc2643b. Branch: site/pd-marking.

The fixed S4 source at 957a8b38d072bf00e6718515977ef4c03edf8f7d passed independent Spec and Standards review. That review ran 175 TypeScript tests, 115 local SQL cases and two predicate controls. Its proof remains local and synthetic. The source stayed fixed until the reviewer stopped.

PR637 then merged into this branch from main dependency b22a7ad640506c62327b744fcf4a809983959ada, through merge commit 56c2e8a0d3a4f3b7aab27d2fd8c5161383b48843. Git reported no conflicts. This also includes the earlier PR656 lock-order changes.

## Integration correction

PR637 adds reopen_scan_calibration for legacy ready results. That path must share S4's family admission. The original path could start while another processing stage owned the one active slot. It also took the photo lock before the common scan lock when it delegated to begin_scan_calibration.

The additive scan_recheck_admission migration makes every reopen use parent share lock, scan-family lock, photo and calibration in that order. It checks the shared active count before reopening an older result. It preserves the replaced lease token, current ready results, and the existing service-only signature. It does not replace Send.

The integrated local harness now installs the dependency's crop, prior-lease, sheet-check and Send-check definitions in their deployed order before the S4 definitions. Its first run passed 43 cases and failed five binding admission/order cases. After correction all 48 cases passed. Nine cases cover recheck versus normalization, calibration and marking in both orders and concurrently. A lock-wait control proves that a waiting recheck has not locked its photo before it obtains the family lock. These are database rules and reduced synthetic-schema evidence, not physical image or provider proof.

## Hosted check

Applied scan_recheck_admission as 20261106005438. The normal type generator ran after application; the unchanged signature produced no generated diff. The actual-role hosted rollback probe reached SCAN_MARKING_HOSTED_PROBE_OK. It checked successful reopen with its previous token, refusal while marking owns the slot, the earlier S4 role/version/publication/deletion rules, and rollback of all synthetic rows. Zero probe parents and zero enabled marking prices remain. No Storage object, real family or provider request was used.

send_scan_photos keeps definition hash ed3be6821e4bec1d105dd5b68da78321. The new reopen function remains service-only. Security advisor results are unchanged from the previous S4 check: private-table informational notices, the authorized image predicate notice, and the existing password-setting notice. No grant was widened to suppress a notice.

## Remaining checks

The integrated full test run passed: 428 files, 16,448 tests passed and one optional skip, exit 0. Full source lint and production build passed. Counts come from /tmp/pd661-integrated-full-test.log. The changed integration RPC requires a new scoped independent check. The original S4 fixes already passed their fixed-source recheck. The result component and its 21-state browser evidence did not change during this source integration.

Family marking and dashboard release remain off. Sample approval, real private image HTTP controls, provider privacy/pricing and labelled recognition evidence remain release requirements. PR624/642 holds remain. No paid calls are authorized or made. Public wording and main merge approval remain with Savar. The dependent corrections/history/final dashboard work still follows the required merge order.
