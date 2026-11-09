# Next-book planning across curriculum changes: the structure archive

A Book 1 baseline keeps the fingerprint of the curriculum it was planned on (`curriculumVersion`, a digest of the whole BC data, templates included). Before this change, `book2Planning` refused `curriculum-version-changed` whenever today's fingerprint differed. Any template change on `main` after a Book 1 was planned stopped that child's Book 2 for good.

## The rule

New-book planning (`book2Planning` and `planNextBookFromSnapshot`) calls `nextBookCurriculumCompat` (`src/lib/workbook-curriculum/compat.ts`):

- Same fingerprint as today: planned as before, with identical output.
- Different fingerprint: allowed only when the frozen version's structure, from the archive, equals today's structure in full. Templates, practice, number ranges and question wording may differ.
- Frozen fingerprint not in the archive: refused with `curriculum-history-missing`.
- Structure differs: refused with `curriculum-incompatible`, naming the first difference. `planNextBookFromSnapshot` says "The curriculum changed since Book 1 was planned: <difference>."

The structure (`src/lib/workbook-curriculum/structure.ts`) contains:

- the levels in order (id, number);
- each level's units in order;
- each unit's skills in order (id, order, position code, level);
- each skill's steps (number, position code, name). The name is the step's identity, which `house-templates.ts` checks the same way.

The check compares the whole structure, not only the parts a book references. This is the simplest rule that covers every frozen fact: placement standards outside the printed level (for example unit 5.2 in U18), issued steps, bound levels, and every level the planner reads next. It also refuses whenever there is doubt. The cost: after any structural change to BC, every baseline frozen before it is refused until someone writes a narrower rule.

The fields that decide pages are not part of the structure: a skill's delivery and pages, and a step's pages. On the snapshot path, `preparePreview` (`src/lib/workbook-progress-plan.ts`) already compares them with today's plan level and refuses `planning-scope-mismatch`.

`curriculum-version-changed` stays in three places:

- the baseline creator;
- the baseline recovery verifier;
- the saved admin preview records. `evaluateBook1Preview` passes `exactCurriculum: true`, because `replayWorkbookPreviewAny` replays a record by running it again.

No Book 1 record, baseline row or migration changed.

## The archive

`src/lib/workbook-curriculum/history/<key>-<digest>.json` holds one curriculum version's structure. The file names the commit and the Git blob of `bc.ts` it came from. `history/index.ts` registers each file. `archivedCurriculumStructure(key, digest)` reads a file through `readCurriculumStructureRecord`, which refuses a malformed file, a file for another key or digest, and two files for one digest.

| File | Commit | Note |
|---|---|---|
| `bc-0c03a54a51742c070ffff230599f.json` | `de9404ee545517387a241d79f19f1d70ab1e3201` | The first customer's Book 1 (baseline `d018b981-dea5-49f8-9fd8-792ad0ae80e5`; this commit is its run frame's `versions.build`). The walk also matches `6ef0eea1`, the last commit to change `bc.ts`. |

## Adding an entry

Add an entry when a Book 1 baseline is frozen on a curriculum fingerprint that is not in the archive. That baseline's next book is refused with `curriculum-history-missing` until the entry exists. If the baseline is on today's version, it plans now; it needs the entry only after the next curriculum change.

1. Read the baseline's frozen fingerprint: `planning.placement.curriculum.version` in its payload, or `versions.curriculum` and `versions.build` in its run frame.
2. Run `node scripts/curriculum-history.mjs --digest <fingerprint> --commit <versions.build>`. The script builds each candidate commit's `src/lib/workbook-curriculum/index.ts` from Git objects only. It fingerprints that commit's curriculum data with today's `digestOf` and writes the file only for a commit whose fingerprint matches exactly. With no match, it writes nothing and exits 1.
3. Import the file in `src/lib/workbook-curriculum/history/index.ts`, add it to `ARCHIVE`, and add a row to the table above.
4. Run `src/lib/workbook-curriculum/structure.test.ts` and commit the file and the registration together.

The archive file cannot prove its own fingerprint without Git. Review a new entry by running the script again on its commit.

## Read-only customer check, 2026-11-09

The check read baseline `d018b981-dea5-49f8-9fd8-792ad0ae80e5` and its run frame with SELECT queries only:

- The baseline reader accepted the record.
- The frame hash matched the binding.
- The frozen fingerprint is `0c03a54a51742c070ffff230599f`; today's is `1678b48028b416061d0bccb39c22`. Only `house-templates.ts` changed in between.
- `nextBookCurriculumCompat` gives `{ ok: true, same: false }`.
- `book2Planning` gives `ok`: workbook 2, the second in level U16. The full and prepare-only inputs have the same input hash.
- With `exactCurriculum` (the preview-record rule), it still gives `curriculum-version-changed`.

`src/lib/workbook-next-book-snapshot.test.ts` keeps the earlier proof that the stored structural fields alone cannot detect a reorder of unit 5.16 before 5.2. The new tests on the same U16 fixture show:

- a template-only change plans the same next book;
- that reorder, a removed issued skill and a renumbered issued step are each `curriculum-incompatible`;
- an unknown frozen version is `curriculum-history-missing`.
