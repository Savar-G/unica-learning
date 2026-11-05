# BC step progressions v2

Issue #505. This import builds on PR #482.

- `step-progressions-k9.v2.original.json`: Cedric's v2, unchanged.
- `step-progressions-k9.original.json`: Cedric's v1, unchanged.
- `step-progressions-k9.v1.json`: the patched v1 used for the comparison.
- `step-progressions-k9.json`: the active v2 with recorded data corrections.
- `author-changes.json` and `.md`: each v2 field correction, with before, after and reason.
- `author-changes.v1.json`, `.md` and `README.v1.md`: the v1 import history.
- `page-recipes.v2.json` and `new-mistake-codes.v2.json`: unchanged v2 references.

All 1,623 steps and all 7,999 v2 template positions remain. Matched comparisons retain v1 content in three U4 steps, two U10 steps, ten U16 steps and two U26 steps. They also retain a v1 sampling domain in one U14 step. The change record identifies each affected template. Every step has an easy and a hard template. The active audit fills every template 30 times. It reports 239,970 passed fills, zero failed fills and zero import problems. The evaluator input limits are unchanged.

The corrected expressions use explicit derived values for numeric sorting, option labels, money formatting and repeated multiplication. Lowest-terms fractions use separate numerator, denominator and expansion ranges. The unused sales-tax cents lists are removed; its templates already derive the prices and taxes from separate named inputs.

```sh
npm run audit:curriculum-templates -- data/curriculum/step-progressions-k9.json /tmp/v2-audit.json
npm run import:curriculum
npm run import:curriculum -- --check
```

The generator and curriculum fingerprint use the active data. A local sample can use `--steps data/curriculum/step-progressions-k9.v1.json --no-store` for a matched v1 control. This option validates the data and refuses stored output. Set the same `WORKBOOK_SAMPLE_ID` for both runs. Real samples must also use `--subscription-only` with API keys removed.

The comparison report records the source commits, commands, sample paths, failures and limits of the evidence. A passing template audit does not establish book quality.

## Mistake lines (C2)

An active `mistakes[]` entry can have `watchOut: { wrong, fix, verified, verifierModel, verificationHash }`. The pair describes this step's own wrong move and its correction. A separate model must verify the exact text against the step's name, rules, example, mistake answer and reason. The id alone never selects a correction. Both fields pass the teaching panel's printable rules. Their combined length, including one joining space, is at most 150 characters. Numbers of 1,000 and up use commas. Examples, answer keys and default `spotTheError` stay unchanged. Corrections to source reasons use the author logs.

The verification run accounts for all 1,503 coded mistakes on 1,417 steps. It writes per-step candidates with Claude Sonnet 5.5 and verifies them with Claude Opus 5.5, in batches of 20. A rejected pair gets at most two revisions. Final rejections have no pair. `mistake-verification.json` records every attempt, verdict and reason, with coverage counts. The C2-R2 section in `author-changes.md` records each final line or removal. The JSON author log records complete before and after arrays.

The initial completed run wrote candidates for 1,477 cases, with 1,674 candidate versions. It retained 1,400 verified pairs on 1,319 steps. It rejected 174 cases at least once and dropped 103. A dropped case may have no candidate at all if the source was inconsistent. `pair: null` records a writer decline, not a verifier approval.

Only `verified: true` pairs from the verifier model with a matching context and text fingerprint reach the public curriculum reads. Missing, false, edited or copied verification is removed. This applies to `BC_CURRICULUM`, `curriculumFor`, `bcStepProgressions` and `curriculumFromData`. `bc.ts` is raw generated authoring data. G1 must use the public reads and keep the verified-only print check.

Run the subscription-only authoring script from the repository root:

```sh
env -u OPENROUTER_API_KEY -u OPENROUTER_API_KEY_FILE -u ANTHROPIC_API_KEY -u ANTHROPIC_API_KEY_FILE WORKBOOK_CLAUDE_CONFIG_DIR=/Users/savargupta/.claude_second node data/curriculum/verify-mistake-lines.mjs --out /tmp/c2-r2-verification --concurrency 3
```

The script resumes matching checkpoints and refuses changed inputs or prompts. It saves each writer result before verification. It waits for all calls to stop before it writes the active source and report. A failed call changes no active data. There is no API fallback. `--max-batches 1` checks the first batch without applying data. Run `npm run import:curriculum` after a completed run to regenerate `bc.ts`.

Use `--recheck --ids 'skill#step:mistake-index,...'` to verify selected current pairs without a writer call first. Use `--recheck --levels U4,U16 --out /tmp/c2-r3-u4-u16` to check every retained pair at those levels. Keep the subscription environment from the command above and choose a fresh output folder for a new pass. The stricter prompt asks whether every factual claim is true, including spoken order and arrangement. A rejected pair gets at most two writer repairs with fresh verification, then no pair. The report's `records` hold the latest review. Its `rechecks` preserve each pass, its prompt, results and earlier records.

C2-R3 corrected the teen-digit pair and its false source reason, plus both cube-net pairs. All three passed a fresh check. The next pass checked all 33 U4 and 32 U16 pairs. It rejected one U4 subitizing pair because its claimed cause did not explain the wrong numbers. One repair passed. All 65 pairs remain verified. Current totals are 1,678 written candidate versions, 1,400 retained pairs, 175 cases rejected at least once, and 103 dropped cases. C2-R3 entries in both author logs record the four changed pairs and the source reason.

`samMistakeFor(id, operation)` maps 12 misconception ids to supported Sam mistakes. `difference-as-sum` and `fee-sign` require a valid whole-number subtraction. Unknown or unsupported ids return `null`. Other mapped forms still need Sam's existing operation check. G1 connects the table and verified lines to book selection.
