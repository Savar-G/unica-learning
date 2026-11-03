# BC step progression import

Issue: https://github.com/Savar-G/unica-learning/issues/486

The three author files in this directory are preserved byte for byte. They are data, not programs. The calibration entries record the author's source claims. This import does not verify those claims.

The source has 1,622 steps for 541 skills, 9,732 practice questions, 7,321 templates, and 88 new misconception codes. The codes and the U4-U6 child-led decision are applied. The step replacement is **blocked**. The active `bc.ts` retains its 155 existing Grade 3 steps until the author resolves the import errors. No book writing code calls the new filler.

## Reproduce the checks

```sh
npm run audit:curriculum-templates -- data/curriculum/step-progressions-k9.json /tmp/curriculum-template-audit.json
npm run import:curriculum
npx vitest run src/lib/workbook-curriculum
```

The audit and import commands both return exit code 1 for the supplied data. This is the expected rejection, not a successful data acceptance. The test compares the full audit with `template-audit.json`, including every known failure. The other tests check the interpreter and filler independently of those failures. Do not remove failures from the expected report without checking the source or the implementation change that resolves them.

`import:curriculum` accepts optional positional paths for the skeleton XLSX and the progression JSON. It reads the skeleton for levels, units, skills, and budgets. It uses the JSON for every step and the contexts. It checks the complete candidate before it writes `bc.ts`. There is no partial import or error bypass. The test runs the actual importer and compares the active file's SHA-256 before and after rejection.

## Audit result

All 7,321 templates have 30 fixed-seed trials, for 219,630 trials. There are 215,591 successful fills and 4,039 failed fills across 136 templates. The highest attempt count among successful fills is 15. No template exhausts the 100-attempt limit. The report records the skill, step, template number, error phase, message, failed trial count, and first failing seed.

The 488 import diagnostics comprise:

- One page mismatch: **K11-coin-attributes step pages total 3; the skill has 2**. Savar must decide which source value changes.
- 332 inline slot ranges. The import rule requires each slot to name a key in `numbers` or the step's `values` list. These ranges are retained as data and can be sampled by the standalone filler, but the importer rejects them.
- 81 range diagnostics across domain definitions and their template uses. There are 21 affected domain definitions. Seventeen omit a decimal grid while their interval contains no integer. Four price domains include values below their minimum. For example, `7.13-sale-price` step 3 has `price.min = 20` but includes 10 in `price.values`.
- 74 templates use syntax outside the language specified in section 10: sets, dictionaries, slices, membership tests, generator expressions, or attribute access. These need author changes or a separate language decision. The interpreter rejects them.

Of the fill failures, 134 templates fail before sampling. Two further templates fail range checks on 19 trials in total. `8.6-graph-relation` step 2 templates 1 and 4 sample `c` from `x = [-3, 4]`, calculate `y = g * c`, then replace `c` with `c % 6 + 1`. The replacement can leave the slot range. It also leaves `y` based on the previous `c`. The source is unchanged.

The complete per-template and per-domain diagnostics are in `template-audit.json`. A failed trial records its first seed so the author can reproduce the fill. These checks prove computability, bounded check retries, final slot bounds or list membership, and placeholder completion. They do not prove that every question teaches the intended skill or that its answer matches its wording.

## Consumer API for PR #482

Use the standalone module `@/lib/workbook-curriculum/template` after the data is accepted. The current generator does not import it.

```ts
import { fillTemplate, prepareTemplate, seededRandom } from "@/lib/workbook-curriculum/template";

const random = seededRandom(42);
const item = fillTemplate(step, template, contexts, random);
// item.text and item.answer are strings. item.attempts records check retries.

const prepared = prepareTemplate(step, template, contexts);
const another = prepared.fill(random, 100);
```

The caller supplies the random function. It must return a finite number in `[0, 1)`. `seededRandom` uses Mulberry32. Each fill samples inclusive integer ranges, declared decimal grids, or explicit lists. A range's `values` takes priority over its grid. A step-level `values` list is also available to expressions as `values`. Derived assignments run in JSON insertion order and can replace a sampled value. The check runs after all derived assignments. Only a false check causes a retry. Invalid arithmetic or unsupported syntax raises an error immediately. A name and its pronouns always come from the same selected person.

The default retry limit is 100. The accepted limit is 1 to 1,000. `prepareTemplate` compiles once for repeated fills. `fillTemplate` compiles for one fill. The returned `values` preserves integers as `bigint` and exact fractions as `FractionValue`. Use `formatValue` from `expression.ts` to display them. These values cannot be passed directly to `JSON.stringify`.

`parseStepProgressions(unknown)` from `step-source.ts` validates JSON structure before it returns typed data. `curriculumProblems(candidate, BC_SKILL_MAP)` checks every level, including warm-up and activity skills. It reports ranges, slot references, placeholders, expressions, pages, and the existing curriculum rules. The old curriculum mutation tests use an explicit synthetic fixture for missing step groups because the active import remains blocked. The source acceptance tests use the unchanged author data.

## Expression boundary

The interpreter tokenizes, parses, and evaluates its own syntax tree. It has no host runtime, module, property, filesystem, or network access. It accepts arithmetic `+ - * / // % **`, chained comparisons, lazy `and`, `or`, `not`, and lazy `x if c else y`. String literals support string `+`. `True`, `False`, and `pi` are constants. The function names are `gcd`, `lcm`, `floor`, `ceil`, `round`, `abs`, `min`, `max`, `sqrt`, `isqrt`, `int`, `str`, `Fraction`, `sum`, `len`, and `sorted`. Lists, tuples, integer indices, and `sorted(..., reverse=True)` support the listed collection functions and step value lists. Set and dictionary literals, slices, membership, comprehensions, and attributes are rejected.

Integer and Fraction operations use exact arithmetic. Integer `/` produces a float. `//` floors toward negative infinity. `%` follows the divisor's sign. Float rounding and `{x:.2f}` use ties to even from the exact stored binary value. Unknown names and all other tokens fail with an error. Prototype-related names are forbidden. Expressions have size, token, nesting, operation, exponent, and integer bit limits. Numeric results must be finite. Decimal sampling supports zero to six places. Fixed output supports zero to 99 places.

Source SHA-256:

- `step-progressions-k9.json`: `f22f6614a0f7013abde0b9228e1cf5ecdab4436fb99a6fbfabab73453a0726ea`
- `new-mistake-codes.json`: `ce4d6686a069b734fd17f405bb7483af9222b09605a368e48ab0d2d1653e4c5b`
