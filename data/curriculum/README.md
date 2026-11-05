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

Each active `mistakes[]` entry with a misconception id has `watchOut: { wrong, fix }`. The pair describes the wrong move and its correction. Both fields pass the teaching panel's printable rules. Their combined length, including one joining space, is at most 150 characters. Numbers of 1,000 and up use commas. Entries with no misconception have no guessed pair. The original mistake fields and default `spotTheError` stay unchanged.

The active data has 1,503 pairs on 1,417 steps, covering 327 misconception ids. The C2 section in `author-changes.md` lists each line. The JSON log records each complete before and after mistake array. Run `npm run import:curriculum` after a data change to regenerate `bc.ts`. Legacy imports can omit `watchOut`.

`samMistakeFor(id)` in `src/lib/workbook-mistake-map.ts` maps 10 misconception ids to supported Sam mistakes. Unknown ids and known ids without an exact match return `null`. A caller must also check that the planned operation allows the returned mistake. The table and lines become part of book selection in G1.
