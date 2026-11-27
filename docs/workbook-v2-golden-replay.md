# Workbook v2: golden books, replay diagnosis and bug fixtures

UNI-261 (architecture 10.3, 10.7 and 11.1; product spec 18). The engine itself is described in `docs/workbook-v2-engine.md`.

## Golden books

Each synthetic level has two golden books (`src/lib/workbook-v2/testing/golden-books.ts`):

- **Strong child** (`golden-strong`): Book 1 has the first two sheets of the level. The child masters both, every page is scanned, and the golden book is Book 2 of the next new sheets.
- **Weak child** (`golden-weak`): the same Book 1. The child gets one question in two wrong on the second sheet, and the golden book is Book 2: that sheet again (attempt 2, with the history of Book 1, so the repeat prefers unseen questions and swapped forms), then the next new sheet.

The marks, the position and the next-book plan go through the real engine (`sheetResult`, `position`, `planNextBook`, `historyFromBooks`). The synthetic levels are `snapshot-facts.json` and `snapshot-division.json`. Every snapshot id starts with `invented-`.

### The comparison

`compareGoldenBook(expected, actual, accepted)` (`testing/golden.ts`) compares each page by:

- **The page model.** The hash is the SHA-256 of its canonical JSON. A full baseline gives the exact changed paths (`regions[3].ink[0].text`). A committed baseline gives the changed parts of the outline: each field and each group of regions of one item.
- **The pixels of the 150 dpi page image.** The images are read with `readPngPixels` (`checks/page-image.ts`) and compared as colours on white paper. The image hash comes from the pixels, not from the PNG bytes, so the same picture packed in another way has the same hash. A full baseline gives the count of changed pixels, the largest change of one colour part, and the box around them.
- **The PDF SHA-256**, as information only. It never fails a check.

An added or removed page is a change. A change that the child sees (its pixels, or an added or removed page) is "child visible".

### Accepted changes

`src/lib/workbook-v2/fixtures/golden/accepted.json` is a list of `{ book, page, approver, reason, modelSha256, imageSha256 }`. `page` is the page in the book, counted from 1. A removed page has the hashes `"none"`. A changed page passes only when an entry matches its book, its page and both new hashes, and has a reason. Cedric accepts a change that the child sees. Savar or Cedric accepts the other changes. If the page changes again, the entry is stale and the check fails. The report prints the exact entry to add for each page that is not accepted.

### Public CI and the committed baselines

`src/lib/workbook-v2/fixtures/golden/<snapshot id>.json` holds, for each golden book of a synthetic level, the input hash, the PDF hash, and for each page the model hash, the image hash and the model outline (about 16 KB for each level). These baselines are built with the pinned Typst renderer (`typst@<version>`) so real printed pixels, `page.typ`, and font changes are verified in CI (`engine` job). `golden.test.ts` compares pinned Typst output against the committed baselines, and `scripts/golden-baseline-base.mjs` (run in CI `scope`) compares committed baselines against the branch base so a branch cannot replace or remove a committed baseline without a matching `accepted.json` entry (Cedric for any visible/pixel/page-count change; Savar or Cedric for model-only changes).

To change the engine on purpose:

1. Run `npm run workbook:v2:golden`. It uses pinned Typst by default and lists each changed page and the entry that accepts it.
2. To see the pixels, write a full baseline from `main` (`--out DIR`). Then compare the branch with it (`--baseline DIR --diff-dir DIR2`). Both folders must be separate and outside every git repository.
3. Add the accepted entries (Cedric for pages that the child sees), then run `npm run workbook:v2:golden -- --update`. It rewrites the committed baselines only when every changed page is accepted. The accepted list stays as the record of who accepted what.

A new synthetic level has no baseline: the check fails until `--update` writes its first baseline.

### Real levels

Real bank content never enters the repository. `--snapshot FILE` reads a private snapshot. The command refuses the snapshot file, `--out`, `--baseline` and `--diff-dir` when one of them (or any file/folder inside them) is inside a git repository, and refuses overlapping `--out`, `--baseline`, and `--diff-dir` paths. It refuses `--update` for a real level. The guard (`testing/git-repo.ts`) resolves symbolic links in POSIX order before collapsing `..` and checks both the path as written and the resolved path, finding a `.git` folder or the `.git` file of a worktree. A refusal writes nothing.

```sh
npm run workbook:v2:golden -- --snapshot ~/private/level-3.json --out ~/private/golden/level-3-main
npm run workbook:v2:golden -- --snapshot ~/private/level-3.json --baseline ~/private/golden/level-3-main --diff-dir ~/private/golden/diff --accepted ~/private/golden/accepted.json
```

Both synthetic and real levels use pinned Typst by default (`--renderer typst`). `--mastery N` gives the level's mastery percent (default 90); the weak child always scores just below `masteryPercent` so Book 2 repeats sheet 2 (`attempt === 2`) at every setting from 1 to 100.

### Two fresh processes

`golden.test.ts` runs the command with `--hashes` in two fresh Node processes. Each process prints the SHA-256 of the PDF and of each page PNG of each golden book, and the two outputs must be equal byte for byte. With Typst installed (always in CI) the test uses the real Typst. Without Typst, it uses the fake renderer.

## Replay: the first difference

`replayBook` (`src/lib/workbook-v2-publish/replay.ts`) validates `expected` via `readReplayExpected` (requiring `pageModelSha256s` to match `pageSha256s.length` when present) and returns `firstDifference: { kind, message, details? }` beside `differences`. The kinds come in causal order:

`input-format` → `plan` → `snapshot` → `input-hash` → `engine` → `renderer` → `font` → `build` → `page-count` → `page-model` → `page-pixels` → `pdf`

When more than one part differs, the first kind in this order is the cause. Example: when a changed snapshot also changes the input hash, the replay names the snapshot. Of two pages, the replay names the lower page. Every page model difference comes before every pixel difference. `differences` keeps its old order and wording.

`ReplayExpected` has two optional fields: `expectedSnapshotHash` (the book's `plan.snapshot.hash`) and `pageModelSha256s`. Without them, the replay does not check the snapshot or the page models. A published book has neither field yet: `StoredV2Book` does not record them. A replay bundle (`expected.json`) or `--expected-snapshot-hash` can give them.

`npm run workbook:v2:replay` prints the first difference with a next step. For `renderer`, the next step is to fetch that Typst program from the private archive (using the matching commit's `src/lib/workbook-v2/render/pins.ts` for its pinned SHA-256), install it, and replay again.

## Bug fixtures

```sh
npm run workbook:v2:fixture -- --name footer-misses-level --failure "The footer does not print the level." \
  --expect 'page-text=1:Level 2' --input book-input.json
```

`--expect` is `builds`, `replays`, `refused=TEXT`, `page-text=N:TEXT` or `no-page-text=N:TEXT` (always quote values containing spaces; both single-line `text` ink and word-problem `flow` ink are searched). The input is `--input FILE` (a `{ snapshot, book }` or a saved input, with an optional `--expected FILE`), `--bundle FOLDER` (`input.json` and `expected.json`), or `--workbook UUID`.

`createBugFixture` (`src/lib/workbook-v2-publish/bug-fixture.ts`) writes one JSON file atomically via a staged hard link (`src/lib/workbook-v2-publish/bug-fixtures/<name>.json`), holding the input, what is wrong, and what must be true. It writes the file only when the fixture fails today, so the file reproduces the bug. `bug-fixture.test.ts` runs every committed fixture (including in the CI `engine` job with pinned Typst installed), and supports `WORKBOOK_V2_FIXTURE=<path>` for private fixtures written outside the default folder. Each bug does not get its own test file, because of the no-test-sprawl rule in `AGENTS.md`.

**Privacy.** A fixture goes into a git repository only when the complete fixture payload (including `failure`, `expect`, `input`, and `expected`) proves that it is invented: the snapshot id is one of the known synthetic snapshots in `src/lib/workbook-v2/fixtures/`, the book id, child id, history book ids, and every sheet QR page link use an invented prefix (`example-`, `golden-`, `invented-`, `synthetic-` or `fixture-`), and no UUID, email address, or non-synthetic page link token appears anywhere in the fixture. Otherwise the command refuses with nothing written. A published book (`--workbook`) has UUID ids, also for a test family, so it can go only to a folder outside every git repository (`--out`). The same git guard as the golden command applies, with symbolic links and worktrees.
