# BC step progression import

Issue: https://github.com/Savar-G/unica-learning/issues/486

The active curriculum now includes all 1,622 steps for 541 BC skills, 9,732 practice questions, 7,321 templates, and the shared contexts. All 88 new misconception descriptions are imported. U4-U6 are child-led. Only U1-U3 remain parent-led. The book writer does not call the new template filler.

The author's original JSON is preserved byte for byte in `step-progressions-k9.original.json`. The working copy is `step-progressions-k9.json`. The brief and misconception source files are unchanged. Calibration entries record the author's claims; this task does not verify those external sources.

## Reproduce

```sh
npm run import:curriculum
npm run import:curriculum -- --check
npm run audit:curriculum-templates -- data/curriculum/step-progressions-k9.json /tmp/curriculum-template-audit.json
npx vitest run src/lib/workbook-curriculum
node scripts/compare-curriculum-import.mjs --fake
```

Import and audit return exit code 0. The audit fills every template 30 times with fixed seeds: **219,630 passed fills, 0 failed fills, 0 failed templates, and 0 import problems**. The highest successful attempt count is 15. `template-audit.json` records the result.

The uncorrected original report remains in `template-audit.original.json`. Its 218,441 passed fills, 1,189 failed fills, and 41 failed templates are reproduced against the preserved original as a regression control. Its import diagnostics record the earlier budget decision and are historical.

## Approved data and budget corrections

[The field-by-field author changelog](author-changes.md) and [structured patches](author-changes.json) record 603 progression field changes across 356 templates. They include all 332 inline slot entries. The relocation adds 236 named domains and reuses 96 identical existing domains. Text, formats, difficulty labels, step counts, template counts, and practice examples are unchanged.

The corrections remove the four out-of-range price values, retain each graph gap count before deriving y, require positive graph gaps within the y range, replace the four digit generators with an explicit digit sum for 100-9,999, replace polygon dictionaries with the same conditional pairs, use `str(fr)`, and replace the multiples slice with explicit lists for 4-6 terms.

Savar approved three changes over the preserved curriculum skeleton:

| Record | Field | Before | After |
|---|---|---:|---:|
| K11-coin-attributes | skill pages | 2 | 3 |
| U3 | skill pages | 125 | 126 |
| Kindergarten | skill-page budget | 360 | 361 |

Workbook counts remain 8 for Kindergarten and 120 overall. Other level and grade budgets are unchanged. `approved-adjustments.json` records the decision. The importer checks each old value before applying the adjustment. It stops on source drift. The XLSX remains unchanged. The active `bc.ts` is generated from the skeleton, the corrected JSON, and these explicit adjustments. `--check` validates the same candidate without a file write. No partial import or error bypass exists.

## Admission and resource limits

Input caps apply before retaining syntax trees: 4,096 canonical UTF-8 JSON bytes per template, 30 derived assignments, 16 slots, and 500 characters, 256 tokens, and depth 32 per expression. Both import and production preparation use these checks. Preparation shares a work budget. The source shape walk uses bounded iteration rather than allocating entries for an unchecked object.

All integers, numerators, and denominators are limited to 256 bits before normalization and after arithmetic. Floating values must be finite and below 2 to the power 256 in magnitude. Strings have at most 1,024 characters. Collections have at most 256 direct items and 4,096 expanded units, counting nested and repeated references. Output strings have at most 2,048 characters. A fill shares 50,000 work steps and 32,768 total value units across all expressions and attempts. GCD, isqrt, powers, sorting, recursive equality, membership, formatting, and numeric conversions charge the same budget. Limit breaches raise clean errors.

[Current source maxima](template-limits-profile.json): 1,070 bytes per template, 332 expression characters, 97 tokens, AST depth 17, 16 derived assignments, 9 slots, 184 text characters, 150 domain-list items, and domain magnitude 99,999,999,999. All 23,129 corrected expressions compile. The original profile is retained in `template-limits-profile.original.json`.

Tests run both resource reviews' nested-list, 10,000-assignment preparation, and large-coprime Fraction cases under a 64 MB heap and a one-second timeout. A smaller admitted coprime retry case proves shared GCD charging. Each hostile case must return a clean error with no signal or timeout. Boundary and positive controls test the caps.

## Consumer API for PR #482

```ts
import { fillTemplate, prepareTemplate, seededRandom } from "@/lib/workbook-curriculum/template";

const random = seededRandom(42);
const item = fillTemplate(step, template, contexts, random);
// item.text, item.answer, item.values, item.attempts

const prepared = prepareTemplate(step, template, contexts);
const another = prepared.fill(random, 100);
```

Production preparation requires named slot domains, applies import admission checks, and snapshots the admitted expressions, domains, and step values. The returned fill capability is frozen. `prepareTemplateForAudit` is explicitly diagnostic and retains legacy inline-range fills only for the original-source control. It is not the production admission API.

The caller supplies a finite random value in `[0, 1)`. `seededRandom` uses Mulberry32. Slots use inclusive integer ranges, declared or inferred decimal grids, or explicit lists. Without `decimal_places`, use the greater decimal-place count of min and max, including scientific notation. Decimal grids use exact base-10 ticks. Explicit values take priority. Derived assignments run in insertion order. The check runs after them. Only a false check retries. The default limit is 100 attempts; the accepted limit is 1-1,000. A selected name and its pronouns always come from the same person.

Answer and text are strings. Values retain `bigint`, `DecimalValue`, and `FractionValue`. Use `formatValue` for display rather than JSON serialization. One-argument `Fraction(0.5)` is a true exact Fraction: display `1/2`, divided by 3 gives `1/6`. Decimal and float rounding retain negative zero: `-0.0`, or `-0.00` with fixed formatting.

The hand-written interpreter accepts arithmetic, comparisons, membership, lazy booleans and conditionals, string concatenation, sets/lists/tuples, integer indices, and the listed functions. Dictionary literals, slices, generators, comprehensions, attributes, unknown names, and all other tokens remain unsupported. There is no host runtime execution. Decimal arithmetic is exact: `0.1 + 0.2 == 0.3`. Division produces a float unless a Fraction is involved. Rounding uses ties to even. Exact `round(2.675, 2)` is 2.68; computed-float `round(2675 / 1000, 2)` is 2.67.

## Fixed fake-generation comparison

[The machine report](fake-generation-comparison.json) records U10 before activation, after activation, and a counterfactual with old steps and new budget metadata. Every run uses the repository fake AI, fixed IDs, fixed QR tokens and clock, an in-memory store, a key solver, and a passing fit stub.

Both drafts have 84 pages and 777 questions. New step data changes 50 pages; 34 pages are identical. Draft identity, child, workbook number, levels, profile build, and model are unchanged. Fake questions failing the checker change from 73 to 67. Restoring only the old steps reproduces the baseline bytes exactly, proving that the draft changes come from the imported steps. This is draft-output proof, not PDF, layout, real-model, or book-quality acceptance. The actual `workbooks:samples --fake --levels U10 --no-store` CLI also completed: 84 rendered pages, 765 questions, 0 pages that fail fit, and 0 strict render problems. It left out 12 questions for room and retained 59 fake-question check failures. All 945 fake solve checks agreed, with no failures or timeouts. The CLI result tests the renderer separately; it is not the same as the fixed draft comparison with a passing fit stub. No database rows were stored and no model calls were made.

Original source SHA-256:

- `step-progressions-k9.original.json`: `f22f6614a0f7013abde0b9228e1cf5ecdab4436fb99a6fbfabab73453a0726ea`
- `new-mistake-codes.json`: `ce4d6686a069b734fd17f405bb7483af9222b09605a368e48ab0d2d1653e4c5b`
