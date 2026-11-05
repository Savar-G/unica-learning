# Independent review ledger

Provider: Unify Codex. Model: gpt-6.1-sol. Reasoning effort: high. Usage was not returned.

Round 1 reviewed candidate `8365f43afa1af1ec8c83d167949c23de9d83b85d` against `97c96c22d52dc94b3c05e01968a79eb8f922abd7`. Verdict: CHANGES.

| Id | Severity | Outcome | Evidence |
| --- | --- | --- | --- |
| S1 | blocker | Fixed. Count only scored answers for missing area coverage and final sufficient evidence. | Both public-core reproductions failed before the fix and passed after it. An attempt-store case also proves that an area with only excluded rushed answers cannot finish or create a placement. |
| S2 | should | Fixed. Export the adaptive pool and assign selected block positions. | The export returned zero rows before the fix. The regression now checks all pool rows, all selected positions and both block numbers. All 29 export tests pass. |
| S3 | should | Fixed. Preserve the exact unknown response in deletion copies. | The response was null before the fix. Both answer formats and their change histories now preserve it. Other free text remains null. All 19 deletion-copy tests pass. |

No finding was declined. Round 2 will check these fixes and changed code only. The reviewed source diff was 30 files, 970 insertions and 90 deletions before the fixes.
