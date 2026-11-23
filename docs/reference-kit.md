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
- `--allow-small`: read photos whose long side is under 1600 px anyway.
- `--force`: run both readers again, also when valid readings exist. A new valid reading replaces the old one; a failed read keeps the old valid reading. A page checked by a person is read again, but its checked record stays.
- `--limit <n>`: read only the first `n` sorted photos in the folder. The other photos and their readings stay as they are.

Each photo is prepared, read by both readers in parallel (5-minute timeout per call, one validation retry, computed answers applied where exact, `not_stated` refused from readers), and compared once all photos finish. Exit code is `0` when the run completes (even if some photos fail) and `1` for a usage error or when no photo could be prepared. A reader folder that holds readings of another model family is refused; use a new `--out` folder.

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
- `npm run reference:board -- --pick --out <work-folder>` keeps the image with the most pixels of each photo in `<work-folder>/photos-in`, and lists each photo that is too small to read or that has no image.

## Too-Small Rule

After applying EXIF rotation, converting to JPEG (quality 90, 4:4:4), and stripping all metadata (EXIF, GPS, ICC, XMP, embedded thumbnail) with no crop and no resize, any photo whose long side is under `1600` pixels is marked `too_small`. It is not sent to a reader and is listed by its original file name and pixel size in `final/report.md` so a person can supply the full-size photo. Pass `--allow-small` to read it anyway.

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

- **`machine_read`**: Only one valid reading exists, both readers used the same model family, the two readings came from different photo digests, or there is at least one open difference, `one_unclear` field, or once-read teaching field.
- **`double_read`**: Two valid readings from two different model families read the exact same prepared photo digest (`photo_sha256`) and agree with no open differences, no `one_unclear` fields, and no once-read teaching fields. Pages with `both_unclear` fields can still be `double_read`; those fields are listed in the report.
- **`human_checked`**: Set only by `reference:check` after a person reviews and validates a specific page. Preserved across future `reference:compare` runs.

## Same Page Id for Two Photos

The compare step uses every valid reading in `reader-a/` and `reader-b/`, not only the photos of the last run, and never stops for content. The page id of a photo is reader A's id (reader B's when reader A has none). When several photos claim one page id, the photo where both readers give that id wins the final record; when several such photos exist (or none), the first by original name wins. Each other photo is listed under "Same page id for two photos" with its original name and both readers' ids. It gets no final record and no `source_ref` in the manifest, and it keeps its readings. The manifest holds at most one entry for each `source_ref`.

## What the Report Shows and Next Steps

`final/report.md` starts with a summary table showing every page, its original photo name, status, difference count, once-read count, both-unclear count, and whether a person must read prose. It then lists:

- **Too small to read**: original file names and pixel sizes below 1600 px on the long side.
- **Could not be read**: unreadable images and photos where neither reader produced a valid record, with reasons.
- **Duplicate photos**, **Removed photos**, and **Same page id for two photos**: see "Running Again" and "Same Page Id for Two Photos".
- **Unnamed teaching marks**: every `other` example step, example mark, and practice scaffold with its description, so a person sees what the fixed lists did not name.
- **Kept: checked by a person** and **Removed stale pages**: existing `human_checked` records kept on re-compare and stale non-checked pages cleaned up.
- **Per-page details**: differences, once-read teaching fields (including steps, marks, and scaffolds), both-unclear fields, reader answer notes, and `A person must read the prose on this page` whenever a page has an example, example step, word problem, scaffold caption, or figure.

What a person does next:

1. Re-run comparison without reading if needed:
   ```bash
   npm run reference:compare -- --work /private/work
   ```
2. Edit any page in `/private/work/final/<slug>.json` that has open differences, unclear fields, or prose to verify, then validate and mark it individually (`--page all` is refused):
   ```bash
   npm run reference:check -- --work /private/work --page <source_ref>
   ```
3. Import the finished records and prepared photos into Supabase:
   ```bash
   SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run reference:import -- \
     --records /private/work/final \
     --photos /private/work/photos
   ```
