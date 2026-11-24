# Reference Photo Extraction Kit

Read photos of printed reference worksheet pages into validated reference records (`src/lib/reference-record/`), using two independent model families in parallel and a structured comparison report.

## Private Folders Only

All raw photos, prepared photos, reader outputs, final records, reports, and views must stay in private folders outside this public repository and outside any git repository. Every kit command enforces `assertOutsideRepo` and writes directories with mode `0700` and files with mode `0600`. Never copy real page text, publisher names, or people's names into this repository.

## One Command: `reference:extract`

```bash
npm run reference:extract -- \
  --photos /private/raw-photos \
  --out /private/work \
  --source <key> \
  [--reader-a codex] \
  [--reader-b claude] \
  [--model-a <id>] \
  [--model-b <id>] \
  [--allow-small] \
  [--force] \
  [--limit <n>]
```

- `--photos`: folder of raw photos (sorted by name, not recursive). Supports `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, and `.heif` when `sharp` can decode them. Each original file is read once without following symlinks (regular files only). Unreadable files get status `unreadable_image` and do not stop the run.
- `--out`: private work folder outside any git repository.
- `--source`: source slug matching `^[A-Za-z0-9]+$`.
- `--reader-a` (default `codex`) and `--reader-b` (default `claude`): must be two different model families. Passing a `--model-a` or `--model-b` id that belongs to the other family is refused.
- `--allow-small`: read photos whose long side is under 1600 px or whose short side is under 600 px anyway.
- `--force`: run both readers again, also when valid readings exist. A new valid reading replaces the old one; a failed read keeps the old valid reading. A page checked by a person is read again, but its checked record stays.
- `--limit <n>`: read only the first `n` sorted photos in the folder. The other photos and their readings stay as they are.

Each photo is prepared, read by both readers in parallel (5-minute timeout per call, one validation retry, computed answers applied where exact, `not_stated` refused from readers), and compared once all photos finish.

Exit code is `0` when the run completes (even if some photos fail) and `1` for a usage error or when no photo could be prepared. A reader folder that holds readings of another model family is refused; use a new `--out` folder.

Computed answers: code computes the answer of each item from its expression and writes it into the answer places (not `checkbox`, and not a `work_area` alongside another response) with `answer_source: "computed"`. When a question item's only response is a `work_area` (no answer place printed and the question does not end with "="), that `work_area` counts as answer-bearing: an exact computable item writes its computed value there, and leaving it null counts as an empty answer place. For a sole `work_area` response or a word problem, a division that is not exact (has a remainder) is not computed (it may want a decimal or a remainder); its stored answer stays and gives no `answer_differs` note (while leaving it null still counts as an empty answer place).

- One answer place gets the value. When that place names a decimal place (`ones`, `tens`, `hundreds`, `thousands`, `ten thousands`), it gets the digit of that place.
- Several answer places that each name a different decimal place get one digit each, when the value is a whole number that fits. A higher place that the value does not reach stays as it is; a "0" there is correct.
- Several answer places with no `place` (or only some with a `place`): when an `answer_boxes` scaffold that applies to the item lists as many `places`, those places are used in order for the places that have no name, provided every name that is present agrees with the scaffold (the names are not written into the record). Otherwise every place gets the value only when no `answer_boxes` scaffold of the item prints more than one box and every stored answer in those places already is the value (empty places are allowed).
- In all other cases the stored answers are kept and the report has a note.
- An answer with `answer_source: "printed"` keeps its value and source; a printed answer that is not the computed value gets a note.
- A division never gets one value in several answer places with no `place`: the places can be a quotient and a remainder, so the stored answers are kept.
- Remainder answers such as "4r1", "4 r 1", and "4 R1" are equal. A whole number with thousands separators ("1,000") equals the same number without them. The kit reads numbers in the English format: a comma groups thousands and a point is the decimal mark. It is not for sheets that use a decimal comma.

## Running Again

A person runs the command again after a failure, after adding photos, after replacing a photo, or with `--limit`. A second run never loses earlier work:

- A reader that has a valid reading for the photo digest is not run again (unless `--force`). Only the missing reader runs.
- A page with status `human_checked` is not read again without `--force`. The run output and the report say "kept: checked by a person".
- While a reader of a photo runs, that page's readings, final record, and view wait in a new private folder (mode `0700`) in the OS temp folder, and the photo is taken out of both `run.json` files. When the readers finish, every old file that a new reading did not replace goes back, also after an error. If the process is killed, the files stay in that folder (`unica-ref-shelter-*`); its `paths.json` lists where each file belongs.
- `run.json` of each reader is merged by photo digest, so a run changes only the photos it selected.
- Two photos with the same bytes: the later one gets status `duplicate_photo`, is not read, and is listed in the report with both original names.
- The photos folder is the truth. At the start, every photo of the folder (not only the `--limit` selection) is prepared to learn its digest. A photo that has readings or a manifest entry but is no longer in the folder (removed, or replaced by a new photo) loses its prepared file, manifest entry, readings, final record, and view, and is listed under "Removed photos". A photo of a page checked by a person is kept. A photos folder with no readable photo deletes nothing.

## Photos From a Design Board

The team keeps the reference photos on a design board with one section for each level. The skill `reference-extract` (`.agents/skills/reference-extract/SKILL.md`) lets an AI coding session do the whole run from a board link and a level: it lists the board, downloads the photos and runs `reference:extract`.

- `npm run reference:board -- --plan --listing <file> --level <level> --out <work-folder>` reads the text listing of the board page, finds the section whose name holds "Level <level>", and writes `board-plan.json` (one entry for each photo, with a file-name stem). The source key is the word before "Level" in the section name.
- The session saves every image of each photo as `<work-folder>/downloads/<stem>__<n>`. One photo on the board can hold a full-size original and a small preview.
- `npm run reference:board -- --pick --out <work-folder>` prefers downloads that pass the size rule (at least 1600 px on the long side and 600 px on the short side) and keeps the one with the most pixels in `<work-folder>/photos-in`; only when none passes does it keep the one with the most pixels and list it as too small to read (along with photos that have no image).

## Too-Small Rule

After applying EXIF rotation, converting to JPEG (quality 90, 4:4:4), and stripping all metadata (EXIF, GPS, ICC, XMP, embedded thumbnail) with no crop and no resize, any photo whose long side is under `1600` pixels or whose short side is under `600` pixels is marked `too_small` (the same helper is used by `reference:board --pick`). It is not sent to a reader and is listed by its original file name and pixel size in `final/report.md` so a person can supply the full-size photo. Pass `--allow-small` to read it anyway.

## Reader Isolation Rule

For each photo, reader A and reader B run at the same time (`Promise.all`), each in its own fresh temporary directory containing only `page.jpg`. Original file names never enter a reader prompt or CLI argument. Both results stay in memory and are written to `<out>/reader-a/` and `<out>/reader-b/` only after both calls finish, so neither reader can see the other reader's record of the same photo while running.

- `claude` runs with `-p --output-format text --restricted --safe-mode --strict-mcp-config --no-session-persistence --disable-slash-commands --tools Read --allowedTools Read --permission-mode dontAsk` and `cwd` set to the temp folder.
- `codex` runs with `exec -i <temp>/page.jpg -s read-only -C <temp> --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --color never` (plus `-o <temp-last-message>` and `-` for stdin prompt).

## Folder Layout (all outside any git repo)

```text
/private/work/
  prepare.json                  # too_small and unreadable photo lists
  photos/
    <12hex>.jpg                 # EXIF-rotated, metadata-stripped JPEG
    photos-manifest.json        # { version: 1, photos: [{ file, sha256, original_name, width, height, source_ref? }] }
  reader-a/
    reader.json                 # { family, model }
    run.json                    # per-photo status, photo_sha256, original_name, notes
    <source>-<level>-<sheet>.json
    <source>-<level>-<sheet>-<12hex>.json  # when another photo already has the first name
    <12hex>.invalid.json        # written only when invalid twice
  reader-b/
    reader.json
    run.json
    <source>-<level>-<sheet>.json
  final/
    <source>-<level>-<sheet>.json
    status.json                 # { "<source_ref>": "machine_read" | "double_read" | "human_checked" }
    report.json                 # full structured diff report
    report.md                   # human-readable review checklist
  final-view/
    <source>-<level>-<sheet>.md # rendered Markdown view per page
```

Nothing else named `*.json` is written in `final/` besides the page records, `status.json`, and `report.json`.

## Page Statuses

- **`machine_read`**: Only one valid reading exists, both readers used the same model family, the two readings came from different photo digests, or there is at least one open difference, `one_unclear` field, `both_unclear` field, once-read teaching field, or empty answer place.
- **`double_read`**: Two valid readings from two different model families read the exact same prepared photo digest (`photo_sha256`) and agree with no open differences, no `one_unclear` or `both_unclear` fields, no once-read teaching fields, and no empty answer places. Differences in the reader's own wording (`wording`) do not block `double_read`: reader A's words are kept and both values are listed in the report.
- **Step alignment and wording differences**: Worked-example steps are aligned by longest common subsequence of equal normalized printed text (breaking ties in favour of equal `shows`) before field comparison, with remaining steps between anchors paired in order and leftovers reported as `once_read`. Reader B leftovers carry their insertion index (`insert_before`, with `final_path` pointing to the element to insert before, or `[]` at the end of the list). Reader B's mark `step` numbers are mapped through the alignment to reader A's numbering before marks are compared; a reader B mark on an unmatched step stays unmatched (`once_read`). Fields that hold words chosen by the reader (mark `description` when `kind` is not `label` or `arrow`, scaffold `description` for `helper_digit`/`partial_working`/`worked_item`/`other`, step `shows_other`, caption `target`, `table_read_aloud.caption_style`, `notation.figure`, and `answer_boxes.places` entries when neither side is a known decimal place, including whole-number and fractional places such as `tenths`/`hundredths`/`thousandths`) produce `wording` differences only when both sides have concrete values that differ and hold the same numeric tokens in order and the same math symbols in order (`+`, `-`, `−`, `×`, `÷`, `/`, `=`, `<`, `>`, `≤`, `≥`, `≠`, `%`, `^`, `√`, treating `-` and `−` as one symbol and `≤`/`<=` and `≥`/`>=` as one; differing numbers or math symbols are `value`). Direction fields (`arrow` scaffold `from`/`to` and `arrow` example mark `description`) and printed-text fields stay blocking (`value`); one-sided fields stay `once_read`; a value against `"unclear"` stays `one_unclear`.
- An **empty answer place** (`empty_answer`) is an answer-bearing response of a question item (`expr` not null) in the final record that holds no answer and no `"unclear"` marker after computed answers are applied (the same rule as `reference:check`). A `checkbox`, or a `work_area` alongside another response, is not answer-bearing; a sole `work_area` response on a question item is answer-bearing. For a record that a person edited or checked, the kept record on disk is used. A higher decimal place that the computed value does not reach is not an empty answer place.
- **`human_checked`**: Set only by `reference:check` after a person reviews and validates a specific page. Preserved across future `reference:compare` runs.

The final record holds reader A's content (reader B's when reader A has none), with computed answers applied by the same rule as `reference:check` so the written file, empty-answer list, and page status agree. When both readers read the same photo, its `readers` list names both readers, reader A first. Entries that only reader B has stay in the report; they are never merged into the final record.

A final record that a person changed by hand is never written over. Until the person runs `reference:check` for that page, the page stays `machine_read` and the report says that the file was changed and kept. A checked record that is no longer a valid record is also kept, and the report names it.

One work folder belongs to one `--source` key. A run with another key is refused; use the same key or a new `--out` folder.

## Same Page Id for Two Photos

The compare step uses every valid reading in `reader-a/` and `reader-b/`, not only the photos of the last run, and never stops for content. The page id of a photo is reader A's id (reader B's when reader A has none). When several photos claim one page id, the photo where both readers give that id wins the final record; when several such photos exist (or none), the first by original name wins. Each other photo is listed under "Same page id for two photos" with its original name and both readers' ids. It gets no final record and no `source_ref` in the manifest, and it keeps its readings. The manifest holds at most one entry for each `source_ref`.

## What the Report Shows and Next Steps

`final/report.md` starts with a summary table showing every page, its original photo name, status, difference count, wording count, once-read count, both-unclear count, empty-answer count, and whether a person must read prose. It then lists:

- **Too small to read**: original file names and pixel sizes below 1600 px on the long side or 600 px on the short side.
- **Could not be read**: unreadable images and photos where neither reader produced a valid record, with reasons.
- **Duplicate photos**, **Removed photos**, and **Same page id for two photos**: see "Running Again" and "Same Page Id for Two Photos".
- **Unnamed teaching marks**: every `other` example step, example mark, and practice scaffold with its description, so a person sees what the fixed lists did not name.
- **Kept: checked by a person** and **Removed stale pages**: existing `human_checked` records kept on re-compare and stale non-checked pages cleaned up.
- **Per-page details**: differences, wording differences (where both readers describe the same thing in other words; reader A's words are kept, or the edited record when a person edited or checked the page; no action needed), once-read teaching fields (including steps, marks, and scaffolds), both-unclear fields, empty answer places (with both readers' answers), reader answer notes, and `A person must read the prose on this page` whenever a page has an example, example step, word problem, scaffold caption, or figure.
- **Once-read entries**: each one gives the reader that has it, the JSON path where it belongs in the final record (`final_path` in `report.json`; a path that ends in `[]` means the end of that list, and a reader-B step with `insert_before` gives the element path to insert ahead of, shown as `insert before` in `report.md`), and the full JSON of the entry. After a look at the photo, a person copies an entry that is on the page into the final record. When the final record is one that a person edited or checked, `final_path` is given only when the entry is in that record with equal content, inside the same section or example; otherwise the person finds the place.
- **Both-unclear fields**: a person looks at the photo and writes the value, or keeps `"unclear"` and marks the page checked.

What a person does next:

1. Re-run comparison without reading if needed:
   ```bash
   npm run reference:compare -- --work /private/work
   ```
2. Compare each page in `/private/work/final/<slug>.json` with its photo, and edit any page that has open differences, unclear fields, empty answer places, or prose to verify. Then validate and mark it individually (`--page all` is refused):
   ```bash
   npm run reference:check -- --work /private/work --page <source_ref> --photo-compared
   ```
   `--photo-compared` states that a person compared the record with the photo. Without it the command changes nothing, names the photo of the page, and exits with an error. The command also changes nothing and lists the items when a stored concrete answer is not what code would write in that place (correct the expression so that it gives the right answer, or correct the answer), or when an answer place is empty (write the answer from the photo, or `"unclear"`). Stored answers that do not fit the computed answer are kept and do not stop the check. It never writes a computed answer over a stored one.
3. Import the finished records and prepared photos into Supabase:
   ```bash
   SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run reference:import -- \
     --records /private/work/final \
     --photos /private/work/photos
   ```
   A page that is already in the table is not changed. To load a corrected page again, add `--replace`. Run it with `--dry-run --replace` first and read the `replaced:`, `status_lowered:`, and `leftover_photo:` lines. `--replace` never deletes a row or a photo (see `docs/reference-records.md`).
