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
   It finds the section whose name holds "Level <LEVEL>", writes `<work>/board-plan.json` and prints the number of photos and the source key. If it finds no section, it prints the sections that have a level: the link then points to another page of the board, so ask the person for the link of the page that holds the photos.

3. **Download the photos.** Read `<work>/board-plan.json`. For each entry of `photos`, call `download_assets` with the file key and the entry's `nodeId`. One photo can hold two images: a full-size original and a small preview. Save every entry of `rawImages`, in order, at once (the links stop working after a short time):
   `curl -sf -L -o "<work>/downloads/<stem>__<n>" "<url>"` with `<n>` = 1, 2, ...
   Do not save `export`. Skip a node with no `rawImages`. Skip a photo whose files are already in `downloads` (a second run continues where the first stopped). If a download fails, call `download_assets` for that node again.

4. **Keep the largest image of each photo.**
   `npm run reference:board -- --pick --out <work>`
   It copies one image for each photo to `<work>/photos-in` and lists each photo that is too small to read and each photo with no image.

5. **Run the extraction.** It takes about half a minute for each photo, so start it in the background or with a long timeout. If it stops, run the same command again: it continues.
   `npm run reference:extract -- --photos <work>/photos-in --out <work>/run --source <source key from step 2>`

6. **Tell the person the result.** Give the summary line, the path of `<work>/run/final/report.md`, and:
   - the photos that were too small, by name: the person must put the full-size photo on the board, then you run steps 3 to 5 again;
   - the number of pages that are `double_read` (both readers agree) and `machine_read` (a difference to resolve, or one reading only).

7. **Help the person check pages, when asked.** The report lists each difference with both values. The person looks at the photo (`<work>/run/photos/`, the report gives the file of each page), corrects the record in `<work>/run/final/`, and then marks the page:
   `npm run reference:check -- --work <work>/run --page <source_ref>`
   One page for each command. Never mark a page that the person did not check.

8. **Load into the database, only when the person asks.** It needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the environment. Run a dry run first and show its summary:
   `npm run reference:import -- --records <work>/run/final --photos <work>/run/photos --dry-run`
   Then run the same command without `--dry-run`. A second run changes nothing for a page that is already loaded.
