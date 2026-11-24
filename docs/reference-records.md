# Reference Records

Structured evidence records for curriculum reference pages (`src/lib/reference-record/`). These records capture what a reference page teaches and asks-items, presentation form, response positions, scaffolds, examples, and score bands-without copying page layout, free-text type labels, or personal marks.

To read photos of reference pages into these records, see `docs/reference-kit.md` (the photo kit and the `reference-extract` skill).

## Record Kinds

Validated by `validateReferenceRecord(value)` (`src/lib/reference-record/validate.ts`), which rejects unknown keys at every level and returns field-path errors:

- **`page`**: One record per photographed reference page (`source_ref` matches `<source>:<level>:<sheet><side>`, e.g. `demo:Z:12a`). Contains `topic` (`title` is the full printed title, exactly as printed, with any number at its end; only older records hold a separate `number`), `sections` (`instruction`, `scaffolds`, `items`), `examples`, and `score_bands` (five entries: closed range `[min, max]`, open range `[min, "open"]`, or `null`). An optional `single_read` list of JSON field paths is present only on `agreement_accepted` pages to mark fields where the two readers differed and reader A's value was kept without a second matching reading (when an entry is absent from reader A's record, `single_read` names the existing containing list or object; every path resolves in the record); `renderRecordToMarkdown` shows those fields as not checked, and `reference:check --photo-compared` removes the list.
  - **Item `printed` and `expr`**: `printed` is the whole printed line of the question in plain text as far as it is printed, with one `□` for each printed blank box and `___` for each printed blank line. `expr` is `arith` (operator + operand list), `chain` (sequence with `null` blanks), `missing` (equation with `null` blank), `linked` (two separate questions printed as a pair), `word` (text + reader-supplied expression), `notation` (LaTeX of only the expression or equation to work on, with no trailing `=` and no blank frames, using `\begin{cases} ... \end{cases}` for a system of equations, plus optional figure description), or `null` (non-question action item such as a read-aloud checkbox).
  - **Item `form`**: `horizontal` (expressions written along one line, fractions included), `vertical` (column layout only), or `bracket` (division bracket only); may be `null` only when `expr` is `null`.
  - **Responses**: Ordered list of writing places (`after_equals`, `under_line`, `box`, `above_bracket`, `line_with_unit`, `work_area`, `checkbox`), printed `cue` (exact words or expression directly before the answer place, never a description and never a lone operator or sign such as `"="` or `"+"`, `null` when nothing is printed), `answer`, and `answer_source` (`computed`, `reader`, `unchecked`, `printed`). An `"="` printed at the end of a question with open space after it uses position `after_equals`. Use a single `work_area` response only when no other answer place is printed and the question does not end with `"="`; it holds the final answer (with `answer_source: "reader"`, or `"computed"` when computed by code, or `"unclear"` when the answer cannot be worked out). When open working space appears alongside a printed answer place, the `work_area` response holds `answer: null` and `answer_source: "unchecked"`. `printed` means that the publisher prints the answer in the answer place (a traced digit, or a question printed already solved). Writing by a child or a marker is never recorded.
  - **Scaffolds**: Fixed kinds `answer_boxes`, `number_strip`, `table_read_aloud`, `equation_frame`, `arrow`, `caption`, `helper_digit`, `partial_working`, `worked_item`, and `other` with typed settings and `applies_to` (`description` is required and non-empty for `other`).
  - **Examples**: `position` (`top`, `foot`, `inline`), `relation` (`compare`, `sequence`, `table`), `label` (printed example tag such as `"Ex."` or `"Note"`), ordered `parts` each with its own `form`, optional ordered `steps` (one step per printed line of working; `n` starting at 1, `shows` from `EXAMPLE_STEP_KINDS` plus sentinels, `printed`, optional `note`, and `shows_other` required iff `shows` is `other`), and optional `marks` (marks on the working that teach, never example box borders, tabs, shadows, or background shading; `kind` from `EXAMPLE_MARK_KINDS` plus sentinels, optional `step` referencing a step `n`, and optional `description`, required when `kind` is `other`).
- **`contents`**: One record per level contents chart (`source_ref` matches `<source>:<level>:contents`). Lists ordered `topics` with `n`, `title`, `sheets` range, and `std_time_min` range. `sheets: null` means that the chart does not print sheet ranges. The converter reads these three columns from the first table of the legacy file that has a topic, a sheets and a standard-time column. That table is the only place where a legacy file holds the chart. The converter ignores every other column of that table, and it takes no page fact from it.

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

Import validated records (and optional prepared photos) into `public.bank_reference_images` and the private Storage bucket `curriculum-reference`:

```bash
SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run reference:import -- --records /path/to/private/final [--photos /path/to/private/photos] [--dry-run] [--replace]
```

- **Records folder (`--records`)**: holds one `*.json` file per record (`page` or `contents`). Reserved files `status.json` and `report.json` are not treated as records. An optional `status.json` maps each `source_ref` to `machine_read`, `agreement_accepted`, `double_read`, or `human_checked`; records omitted from `status.json` default to `machine_read`.
- **Photos folder (`--photos`, optional)**: must contain `photos-manifest.json` (`{ "version": 1, "photos": [{ "file", "sha256", "original_name", "width", "height", "source_ref" }] }`). Entries without `source_ref` are ignored until identified, and photo files not listed in the manifest are never uploaded. Matched photos are uploaded to `<source>/<level>/<sheet><side>.<ext>` (only `jpg`/`jpeg`, `png`, `webp`) before the row insert, without overwriting an existing object (only `--replace` overwrites, see below); records without a photo store `path` as `null`.
- **Refusal rules**: the command checks all inputs before writing anything and exits non-zero with zero writes if `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing, any record fails `validateReferenceRecord`, two files share a `source_ref`, `status.json` has an unknown status or orphan `source_ref`, an `agreement_accepted` record has no or empty `single_read`, a non-`agreement_accepted` record has `single_read`, any `single_read` path does not resolve in its record, `photos-manifest.json` is missing or malformed, or any matched photo has a missing file, a symlink, an unsupported extension, an invalid path segment, a size over the bucket limit, or a SHA-256 mismatch.
- **Idempotency and dry run**: without `--replace`, existing `source_ref` rows are left unchanged (no update and no photo upload) and counted as `skipped`, or `skipped_different` (named in the output) if the stored transcript differs. `--dry-run` validates and reports the plan without calling any write method.
- **Replace (`--replace`)**: always run `--dry-run --replace` first and read its output. Then run the same command without `--dry-run`. The dry run calls no write method and reports the same counts and lists as the real run.
  - An existing row is the same, and counted as `skipped`, only when its transcript, its `transcript_status`, and its `path` match the plan, and (when a photo is planned) the object at that path has the planned SHA-256. Every other existing row is replaced and counted in `replaced=`. Its `source_ref` is listed on a `replaced:` line.
  - A replace first writes the photo when the object at the planned path is absent or has other bytes (it overwrites). Then it updates the row in place by `source_ref`: `kind`, `path`, `transcript`, `transcript_status`, and `updated_at`. The `id`, `created_at`, and `note` stay. `photos_uploaded` counts every photo written, new or replaced.
  - A record with no planned photo (no `--photos`, or no manifest entry) keeps the stored `path`, and the command touches no object for it.
  - The command never deletes anything, and it never changes a row that is not in the records folder. When the photo path of a row changes (for example `.jpg` to `.png`), the old object stays in the bucket. It is listed on a `leftover_photo:` line only when no row uses that path after the run. A person can remove it by hand.
  - Before any write, the command reads which rows use each path that a replace overwrites and each old path. When a replace would overwrite a photo that another row also uses, the command refuses the whole run and names the path and the other `source_ref`. Two records that plan the same photo path also refuse the run.
  - Output lines show text from the database (a stored path or `source_ref`) in double quotes. A backslash, a double quote, a control character, and a direction or format mark are written as `\\`, `\"`, or `\u{...}`.
  - A replace that lowers `transcript_status` (order: `machine_read` < `agreement_accepted` < `double_read` < `human_checked`) is allowed, because a record that is read again loses its old checks. Each one is listed on a `status_lowered:` line with the old and new status. A record that is not in `status.json` gets `machine_read`.
  - The up-front refusal for an object with other bytes at the planned path applies only to a `source_ref` with no row. A person must still remove that object by hand.
  - When a write fails part of the way, the command stops and says what is already written. When the photo was replaced but the row update failed, the photo at that path is already the new one. Run the same command again to finish. If the photo was the only change, the second run finds the row the same and skips it, so the row data is correct but its `updated_at` keeps the old time. When the row to update was removed during the run, the command stops with a problem line.
- **Access rule**: `public.bank_reference_images` has row level security enabled with no policies, all privileges revoked from `anon` and `authenticated`, and access granted only to `service_role`. The private `curriculum-reference` bucket has no `storage.objects` policies, so browser roles cannot read or write either the table or the bucket; admin code reads and writes through the server service role.

## Private Output Rule

This repository is public. **Never write or commit real reference records, rendered reference views, or excerpts from private reference pages inside this repository.** Both CLI commands enforce `assertOutsideRepo` and refuse to run if `--out` resolves inside the repo root. Tests and fixtures in the repo must use invented pages only.
