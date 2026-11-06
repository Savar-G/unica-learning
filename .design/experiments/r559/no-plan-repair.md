# No-plan cancellation correction

Machine: `Savars-MacBook-Pro-5.local`.
Branch: `site/pd-plan-controls`.
Before source: `581afa22d822092fa4a27546302e8adeadf14364`.

Spec review found a P2 at the exported `cancelFamilyPlan`: a complete provider list with no cancellable subscription returns `no_plan`, but the server still closed its admitted operation as applied. This set a permanent cancellation flag and blocked the family's first plan and preparation. Standards review independently passed its assigned scope. That result did not remove the Spec failure.

The correction resolves a returned success as applied and a definite `no_plan` result as refused. A thrown or uncertain result still leaves its operation open. The installed SQL refusal path already preserves the prior confirmed state and releases the closed operation's hold. No SQL or migration change is required.

Before the source correction, the new public-interface regression matrix failed six cases: empty, canceled-only and incomplete-expired-only subscription lists, each with prior local cancellation false and true. The failure reproduced a changed prior state or an incorrect applied resolution. The existing nine interface cases and the new incomplete-list control passed. [Before log](no-plan-before.log): six failed, ten passed.

After the source correction, [all 16 interface cases passed](no-plan-after.log). These call the actual exported server function and production SQL behind a synthetic provider transport. The six complete-list cases prove zero provider writes, the prior cancellation flag, a refused operation, no open operation and no family hold. An initially eligible family can use public preparation and initial-start admission. A previously cancelled family stays cancelled. The incomplete-list control throws, keeps one open operation and one hold, and keeps deletion busy. The original six fixes remain covered by the unchanged cases.

The local SQL fixture used root-owned data directory `/tmp/pd662-root-noplan-pgdata`, socket `/tmp/pd-controls-bf76-pg`, port 55629 and database `pd559_root_noplan`. The prior reviewers had stopped. The socket had no server before root startup. TCP listening stayed off. The baseline 12 SQL groups and production repair 14 groups passed. The server stopped after the checks. This did not reuse a reviewer-owned database.

[Focused server/provider/route checks](no-plan-focused.log): 50 tests in six files passed. The full test, lint and production build gate is running for this corrected round. A new independent scoped recheck is pending. No UI or schema changed, so prior hosted grants/rollback and synthetic browser evidence remain scoped evidence for those unchanged parts.

Proof limits: local SQL uses reduced supporting tables. Provider transport is synthetic. This does not prove real provider acceptance, invoice timing, hosted concurrency, real card returns or scheduler execution. Dashboard release and family marking remain off. No live provider, hosted write, email or paid call ran in this correction round.
