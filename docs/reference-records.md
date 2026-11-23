# Reference Records

Structured evidence records for curriculum reference pages (`src/lib/reference-record/`). These records capture what a reference page teaches and asks-items, presentation form, response positions, scaffolds, examples, and score bands-without copying page layout, free-text type labels, or personal marks.

## Record Kinds

Validated by `validateReferenceRecord(value)` (`src/lib/reference-record/validate.ts`), which rejects unknown keys at every level and returns field-path errors:

- **`page`**: One record per photographed reference page (`source_ref` matches `<source>:<level>:<sheet><side>`, e.g. `demo:Z:12a`). Contains `topic` (as stated on the page), `sections` (`instruction`, `scaffolds`, `items`), `examples`, and `score_bands` (five entries: closed range `[min, max]`, open range `[min, "open"]`, or `null`).
  - **Item `expr`**: `arith` (operator + operand list), `chain` (sequence with `null` blanks), `missing` (equation with `null` blank), `linked` (two expressions printed as a pair), `word` (text + reader-supplied expression), `notation` (LaTeX + optional figure description), or `null` (non-question action item such as a read-aloud checkbox).
  - **Item `form`**: `horizontal`, `vertical`, or `bracket` (may be `null` only when `expr` is `null`).
  - **Responses**: Ordered list of writing places (`after_equals`, `under_line`, `box`, `above_bracket`, `line_with_unit`, `work_area`, `checkbox`), printed `cue`, `answer`, and `answer_source` (`computed`, `reader`, `unchecked`).
  - **Scaffolds**: Fixed kinds `answer_boxes`, `number_strip`, `table_read_aloud`, `equation_frame`, `arrow`, and `caption` with typed settings and `applies_to`.
  - **Examples**: `position` (`top`, `foot`, `inline`), `relation` (`compare`, `sequence`, `table`), and ordered `parts` each with its own `form`.
- **`contents`**: One record per level contents chart (`source_ref` matches `<source>:<level>:contents`). Lists ordered `topics` with `n`, `title`, `sheets` range, and `std_time_min` range. The converter reads these three columns from the first table of the legacy file that has a topic, a sheets and a standard-time column. That table is the only place where a legacy file holds the chart. The converter ignores every other column of that table, and it takes no page fact from it.

Reader-filled fields may hold `"unclear"`. Converters write `"not_stated"` where their source is silent. Structural fields (`kind`, `source_ref`, `n`, `expr.kind`, `answer_source`) never accept sentinels.

## Computed Properties

Pure helpers in `src/lib/reference-record/compute.ts` derive values on demand (never stored in records):

- `computeExprAnswer(expr)`: Exact answers for arithmetic (including division with remainder and multi-operand sums), constant-step chains, missing-value equations, linked pairs, and word problems with a supplied expression.
- `computeItemFeatures(item)`: Operand digit counts, place-specific carries and borrows (including borrow across zero), remainder presence, and repeated-operand flags.
- `computePageOrderingPattern(page)`: Section and page ordering patterns (fixed operand with stepping partner, grouped operand blocks, repeated-addend stepping counts, or mixed).

## Commands

1. **Convert a legacy Markdown transcription to validated JSON records + `report.md`**:
   ```bash
   npm run reference:convert -- --file /path/to/legacy.md --out /path/to/private/records
   ```
   Optional flags: `--source <slug>` and `--level <level>`. Every fact is read from the page entry itself (ignoring top-level summary tables), `form` is taken from the layout note rather than `=` signs in the question text (a layout note that puts the answer after the equals sign states a horizontal equation; a layout note that is silent gives `not_stated`), `linked` pairs are created only when the entry prints a pair, and every computable answer is verified against the file.

2. **Render readable Markdown views from validated JSON records**:
   ```bash
   npm run reference:view -- --records /path/to/private/records --out /path/to/private/view
   ```
   Writes one Markdown file per record showing items, forms, responses, scaffolds, examples, computed features, and ordering patterns.

## Import into the database

Import validated records (and optional masked photos) into `public.bank_reference_images` and the private Storage bucket `curriculum-reference`:

```bash
SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run reference:import -- --records /path/to/private/records [--photos /path/to/private/photos] [--dry-run]
```

- **Records folder (`--records`)**: holds one `*.json` file per record (`page` or `contents`). Reserved files `status.json` and `report.json` are not treated as records. An optional `status.json` maps each `source_ref` to `machine_read`, `double_read`, or `human_checked`; records omitted from `status.json` default to `machine_read`.
- **Photos folder (`--photos`, optional)**: must contain `masked-manifest.json` (`{ "version": 1, "photos": [{ "file", "sha256", "confirmed", "confirmed_at", "source_ref" }] }`). Entries without `source_ref` are ignored until identified, and photo files not listed in the manifest are never uploaded. Matched photos are uploaded to `<source>/<level>/<sheet><side>.<ext>` (only `jpg`/`jpeg`, `png`, `webp`) before the row insert, without overwriting an existing object; records without a photo store `path` as `null`.
- **Refusal rules**: the command checks all inputs before writing anything and exits non-zero with zero writes if `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing, any record fails `validateReferenceRecord`, two files share a `source_ref`, `status.json` has an unknown status or orphan `source_ref`, `masked-manifest.json` is missing or malformed, or any matched photo has `confirmed !== true`, a missing file, an unsupported extension, an invalid path segment, or a SHA-256 mismatch.
- **Idempotency and dry run**: existing `source_ref` rows are left unchanged (no update and no photo upload) and counted as `skipped`, or `skipped_different` (named in the output) if the stored transcript differs. `--dry-run` validates and reports the plan without calling any write method.
- **Access rule**: `public.bank_reference_images` has row level security enabled with no policies, all privileges revoked from `anon` and `authenticated`, and access granted only to `service_role`. The private `curriculum-reference` bucket has no `storage.objects` policies, so browser roles cannot read or write either the table or the bucket; admin code reads and writes through the server service role.

## Private Output Rule

This repository is public. **Never write or commit real reference records, rendered reference views, or excerpts from private reference pages inside this repository.** Both CLI commands enforce `assertOutsideRepo` and refuse to run if `--out` resolves inside the repo root. Tests and fixtures in the repo must use invented pages only.
