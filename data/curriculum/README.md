# BC step progression import

Issue: https://github.com/Savar-G/unica-learning/issues/486

The staged import includes all 1,622 steps for 541 BC skills, 9,732 practice questions, 7,321 templates, and the shared contexts. `curriculumFor("bc")` keeps the generator on main's 155 drafted steps. `bcStepProgressions()` exposes the complete import for the next integration. All 88 new misconception descriptions are imported. U4-U6 are child-led. Only U1-U3 remain parent-led. The book writer does not call the new template filler.

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

Workbook counts remain 8 for Kindergarten and 120 overall. Other level and grade budgets are unchanged. `approved-adjustments.json` records the decision. The importer checks each old value before applying the adjustment. It stops on source drift. The XLSX remains unchanged. The imported `bc.ts` is generated from the skeleton, the corrected JSON, and these explicit adjustments. The generator reads the preserved steps in `bc-generator-steps.ts`; importing again does not activate the new steps. `--check` validates the same candidate without a file write. No partial import or error bypass exists.

## Admission and resource limits

Input caps apply before retaining syntax trees: 4,096 canonical UTF-8 JSON bytes per template, 30 derived assignments, 16 slots, and 500 characters, 256 tokens, and depth 32 per expression. Both import and production preparation use these checks. Preparation shares a work budget. The source shape walk uses bounded iteration rather than allocating entries for an unchecked object.

All integers, numerators, and denominators are limited to 256 bits before normalization and after arithmetic. Floating values must be finite and below 2 to the power 256 in magnitude. Strings have at most 1,024 characters. Collections have at most 256 direct items and 4,096 expanded units, counting nested and repeated references. Output strings have at most 2,048 characters. A fill shares 50,000 work steps and 32,768 total value units across all expressions and attempts. GCD, isqrt, powers, sorting, recursive equality, membership, formatting, and numeric conversions charge the same budget. Limit breaches raise clean errors.

[Current source maxima](template-limits-profile.json): 1,070 bytes per template, 332 expression characters, 97 tokens, AST depth 17, 16 derived assignments, 9 slots, 184 text characters, 150 domain-list items, and domain magnitude 99,999,999,999. All 23,129 corrected expressions compile. The original profile is retained in `template-limits-profile.original.json`.

Tests run both resource reviews' nested-list, 10,000-assignment preparation, and large-coprime Fraction cases under a 64 MB heap and a one-second timeout. A smaller admitted coprime retry case proves shared GCD charging. Each hostile case must return a clean error with no signal or timeout. Boundary and positive controls test the caps.

## Consumer API for PR #482

```ts
import { bcStepProgressions, curriculumFor } from "@/lib/workbook-curriculum";
import { fillTemplate, prepareTemplate, seededRandom } from "@/lib/workbook-curriculum/template";

const current = curriculumFor("bc")!; // Existing generator input, 155 drafted steps.
const imported = bcStepProgressions(); // Explicit opt-in, 1,622 imported steps.
const step = imported.skillSteps("3.3-add-within-1000")![0];
const template = step.templates![0];
const contexts = imported.contexts;
const random = seededRandom(42);
const item = fillTemplate(step, template, contexts, random);
// item.text, item.answer, item.values, item.attempts

const prepared = prepareTemplate(step, template, contexts);
const another = prepared.fill(random, 100);
```

`bcStepProgressions()` has the same level, skill and ordered `skillSteps` reads as `curriculumFor`, plus `contexts`. It does not switch the default accessor. `BC_CURRICULUM` is the raw imported data used by the all-level validation. The default curriculum fingerprint includes the preserved generator steps and approved metadata; the staged steps and contexts do not enter that fingerprint. The integration must switch both the curriculum input and its saved fingerprint when it activates imported books. No generator writer, selection or fit code changes in this PR.

Production preparation requires named slot domains, applies import admission checks, and snapshots the admitted expressions, domains, and step values. The returned fill capability is frozen. `prepareTemplateForAudit` is explicitly diagnostic and retains legacy inline-range fills only for the original-source control. It is not the production admission API.

The caller supplies a finite random value in `[0, 1)`. `seededRandom` uses Mulberry32. Slots use inclusive integer ranges, declared or inferred decimal grids, or explicit lists. Without `decimal_places`, use the greater decimal-place count of min and max, including scientific notation. Decimal grids use exact base-10 ticks. Explicit values take priority. Derived assignments run in insertion order. The check runs after them. Only a false check retries. The default limit is 100 attempts; the accepted limit is 1-1,000. A selected name and its pronouns always come from the same person.

Answer and text are strings. Values retain `bigint`, `DecimalValue`, and `FractionValue`. Use `formatValue` for display rather than JSON serialization. One-argument `Fraction(0.5)` is a true exact Fraction: display `1/2`, divided by 3 gives `1/6`. Decimal and float rounding retain negative zero: `-0.0`, or `-0.00` with fixed formatting.

The hand-written interpreter accepts arithmetic, comparisons, membership, lazy booleans and conditionals, string concatenation, sets/lists/tuples, integer indices, and the listed functions. Dictionary literals, slices, generators, comprehensions, attributes, unknown names, and all other tokens remain unsupported. There is no host runtime execution. Decimal arithmetic is exact: `0.1 + 0.2 == 0.3`. Division produces a float unless a Fraction is involved. Rounding uses ties to even. Exact `round(2.675, 2)` is 2.68; computed-float `round(2675 / 1000, 2)` is 2.67.

## Fixed fake-generation comparison

[The machine report](fake-generation-comparison.json) compares main at `8b05542b1afb4fbe5723ecfecb422bbbd8196ae8` with this branch for U4, U10 and U14. Each run uses the real sample CLI with `--fake --levels <one level> --no-store`, default concurrency 6, the real fit engine, strict renderer and PDF output. Each process starts a fresh fake client. There is no passing fit stub.

The comparison fixes only the CLI's IDs, QR tokens and generator clock. The full draft must match byte for byte. The PDF comparison fixes only CreationDate and ModDate, with same-length replacements; all other PDF bytes must match. PNG hashes are diagnostic because Chromium can produce different raster pixels with identical PDF content. Raw PDFs and the PDFs with fixed dates remain in `.workbook-sample/pr487-comparison/`. The report includes their hashes. The approved child-led value is retained in the curriculum. It does not change the generated draft or printed pages in these fake runs.

| Level | Pages, main / head | Questions, main / head | Failed questions, main / head | Omissions, main / head |
|---|---:|---:|---:|---:|
| U4 | 84 / 84 | 430 / 430 | 0 / 0 | 0 / 0 |
| U10 | 84 / 84 | 766 / 766 | 57 / 57 | 11 / 11 |
| U14 | 84 / 84 | 780 / 780 | 63 / 63 | 0 / 0 |

Full drafts and PDF content match for all three pairs. PDF timestamps are fixed as described above. PNG raster bytes differ on 37 U4 pages, 4 U10 pages and 30 U14 pages; the report retains both hash lists.

The report records all page, question, failure, omission and solve counts. Every run must have zero strict render problems, failed fit pages, solve disagreements and solve failures. Existing fake-question failures and omissions must equal main. No database rows are stored and model cost is USD 0.00. This establishes unchanged fake-book output, not real-model or book-quality acceptance.

The approved K11 budget remains. Its legacy three-step fallback gives each step at least one page, so a skill budget of 2 or 3 produces the same three one-page steps. A public planner test brings coins into teaching as the only remaining skill and compares both budgets. The three required book comparisons separately check the full generator and renderer.

Original source SHA-256:

- `step-progressions-k9.original.json`: `f22f6614a0f7013abde0b9228e1cf5ecdab4436fb99a6fbfabab73453a0726ea`
- `new-mistake-codes.json`: `ce4d6686a069b734fd17f405bb7483af9222b09605a368e48ab0d2d1653e4c5b`
