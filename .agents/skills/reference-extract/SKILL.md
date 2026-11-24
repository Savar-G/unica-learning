---
name: reference-extract
description: Read the reference worksheet photos of one level from the team's Figma board into checked reference records. Use when someone gives a Figma board link and says "extract this level", "extract Level C", "run the reference extraction", or "read the reference photos".
---

# Reference extract

Turn the photos of one level section of the Figma board into reference records. You download the photos, run one command, and show the person the report. Full detail of the commands: `docs/reference-kit.md`.

## Rules

- Photos, records and reports are private. Keep them in the work folder below, outside every git repository. Never copy a photo, a record or page text into this repository, a commit or a pull request.
- Do not open or describe the photos yourself. The kit gives each photo to two readers.
- Do not run the import (step 8) unless the person asks for it.

## Before you start

Run each check. If one fails, tell the person exactly what is missing and stop.

1. You are in the repository root and `node_modules` exists (`npm ci` if not).
2. `codex --version` and `claude --version` both work, and both tools are signed in. The kit needs two model families; with one, every page stays a single reading.
3. The Figma connector tools are available (`create_session`, `get_figjam`, `download_assets`).

You need two inputs: the board link and the level (one letter or number, for example `C`). Ask once for a missing input.

## Steps

Use one work folder for the level: `~/unica-reference/level-<LEVEL>` (for example `~/unica-reference/level-C`).

1. **Open the board.** Take the file key and the node id from the link (`node-id=639-1978` is node `639:1978`). Call `create_session` with the file key. Call `get_figjam` with that node id and `includeImagesOfNodes: false`. The answer is a long text listing. When the tool saves it to a file, use that file path. If it comes back inline, write it to `<work>/board-listing.txt`.

2. **Plan the download.**
   `npm run reference:board -- --plan --listing <listing file> --level <LEVEL> --out <work>`
   It finds the section whose name holds "Level <LEVEL>", writes `<work>/board-plan.json` and prints the number of photos and the source key. If it finds no section, it prints the sections that have a level: the link then points to another page of the board, so ask the person for the link of the page that holds the photos. If it prints no source key, ask the person for one (letters and digits only, for example the short name of the publisher) and use it in step 5.

3. **Download the photos.** Read `<work>/board-plan.json`. For each entry of `photos`, call `download_assets` with the file key and the entry's `nodeId`. One photo can hold two images: a full-size original and a small preview. Save every entry of `rawImages`, in order, at once (the links stop working after a short time):
   `curl -sf -L -o "<work>/downloads/<stem>__<n>" "<url>"` with `<n>` = 1, 2, ...
   Do not save `export`. Skip a node with no `rawImages`. Skip a photo whose files are already in `downloads` (a second run continues where the first stopped). If a download fails, call `download_assets` for that node again.

4. **Keep the largest image of each photo.**
   `npm run reference:board -- --pick --out <work>`
   It copies one image for each photo to `<work>/photos-in` and lists each photo that is too small to read and each photo with no image.

5. **Run the extraction.** It takes about half a minute for each photo, so start it in the background or with a long timeout. If it stops, run the same command again: it continues and reads only the photos that have no reading yet. After an update of the kit that changes the reader instructions, rename the old `<work>/run` folder first (for example to `run-old`), so that every photo is read again.
   `npm run reference:extract -- --photos <work>/photos-in --out <work>/run --source <source key from step 2>`

6. **Tell the person the result.** Give the summary line, the path of `<work>/run/final/report.md`, and:
   - the photos that were too small, by name: the person must put the full-size photo on the board. Then delete the files of that photo in `<work>/downloads` (its `stem` is in `board-plan.json`) and run steps 3 to 5 again. The run reads only what is new and keeps the other pages;
   - the number of pages that are `double_read` (100% agreement), `agreement_accepted` (accepted by the 90% rule: readers agree on at least 90% of compared fields with no answer conflict, no empty answer, and no reader disagreement on any answer; pages with worked examples or prose are accepted at 90% or above too, with differing fields marked in `single_read` and reader A's values kept), and `machine_read` (sent to a person);
   - the short **Pages sent to a person** list from the end of the run (or state plainly that no pages were sent to a person).

7. **Help the person check pages, when asked.** A page that is `machine_read` needs a person (and a person can also review an `agreement_accepted` page if they want; marking it `human_checked` clears its `single_read` list). The report lists each difference with both values (also on accepted pages), each entry that only one reader has (with the JSON to copy), and each empty answer. For each page to check:
   - Open the photo for the person: `open "<work>/run/photos/<file>"` (the report gives the file of each page). The person compares each listed item with the photo and tells you the correct value. Do not decide a value yourself, and do not decide from the two readings alone.
   - Correct the record in `<work>/run/final/`. When an answer is wrong, correct the expression of the question, because code computes the answer from it. Pencil or pen writing on the photo is not part of the record.
   - Ask the person: "Did you compare this page with the photo?" Only after a yes, mark the page:
   `npm run reference:check -- --work <work>/run --page <source_ref> --photo-compared`
   One page for each command. Never pass `--photo-compared` for a page that the person did not compare with the photo. When the command stops with a list of items, show the list to the person and correct the record with them.

8. **Load into the database, only when the person asks.** It needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. When both are in the repository's `.env.local`, load that file for the command. Never print the key. Run a dry run first and show its summary:
   `node --env-file=.env.local scripts/reference-import.mjs --records <work>/run/final --photos <work>/run/photos --dry-run`
   Then run the same command without `--dry-run`. A second run changes nothing for a page that is already loaded.
   When the level was loaded before and was read again, the rows are already in the table and a plain run leaves them as they are (it reports `skipped`, or `skipped_different` when the record text differs). Then add `--replace` to both commands: run `--dry-run --replace` first, show the person the rows it would replace and each status that would go down, and run without `--dry-run` only after the person agrees. `--replace` never deletes a row or a photo.
