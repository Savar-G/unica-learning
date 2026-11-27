# Workbook v2 bank: the working copy

The working copy holds the draft content of each level in Supabase (architecture spec 9.2, UNI-241). The bank import writes a draft file into it, and reads the rows back as the same draft. Reviews approve one revision of each item, and the freeze (`freezeLevel`, UNI-242) copies an approved level into an insert-only snapshot that books are built from.

Code: `src/lib/workbook-v2-bank/`. Migrations: `20261127191913_bank_working_copy`, `20261127192640_bank_write_level_refusal`, `20261127195924_bank_working_copy_hardening`, `20261127202034_bank_child_version_trigger`, `20261127203021_bank_write_level_restore_flag`, `20261127205833_bank_freeze_snapshots`.

## Import a draft

```sh
SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run workbook:v2:bank:import -- --draft /private/folder/level-3.json
```

- The command refuses a file inside a git repository or worktree, before it reads the file. It checks the path and the path that its links lead to. Draft files hold private content, and the code repository is public.
- It checks the whole draft before it writes. A draft with a problem writes nothing, and the command lists each problem.
- It writes the level in one database call, then reads the level back and compares it with the file, field for field.

## Tables

All nine tables are service-role only: RLS is on, `PUBLIC`, `anon`, and `authenticated` have no grants, and no table has a policy. The three tables of reviews and snapshots are insert only: a trigger refuses every update, delete and truncate (SQLSTATE `55000`), for the service role too.

| Table | Key | Holds |
| -- | -- | -- |
| `bank_levels` | `id` | display name (the level name), position, status, `config`, `basis` of the level, `default_region` |
| `bank_topics` | `level_id`, `id` | code, position, title, `child_title`, `standards_tags`, `basis`, status |
| `bank_sheets` | `sheet_id` (in all levels) | `level_id`, `topic_id`, position in the topic, `first_page`, kind, `content` (both sides), `basis`, revision, status |
| `bank_questions` | `level_id`, `id` | position, scenario kind, regions, slots, unit, solver, difficulty, phrasings, `basis`, revision, status |
| `bank_scenarios` | `level_id`, `id` | position, interest, `level_band`, kind, `content` (place, container, thing, verb, unit, quantity limits), `basis`, revision, status |
| `bank_region_packs` | `level_id`, `id` | position, units, coins, spelling, clock and date format, grade names, `basis`, revision, status |
| `bank_reviews` | `id` (rises with each review) | `level_id`, `item_kind` (`sheet`, `question`, `scenario`, `region_pack`), `item_key`, `revision`, reviewer, decision (`approved`, `rejected`), comment, time |
| `bank_snapshots` | `id` (uuid); `level_id`, `version` | `name` (the snapshot id inside the content, such as `level-3-v1`), content hash, manifest hash, minimum engine version, item count, frozen by, frozen at |
| `bank_snapshot_items` | `snapshot_id`, `kind`, `key` | kind (`level` header, `topic`, `sheet`, `question`, `scenario`, `region_pack`), position, `content`, `hash` (SHA-256 of the canonical JSON of `content`). A check constraint refuses `basis` at any depth of `content`. |

## How a draft maps to rows

- **Notes.** Every `basis` goes to a `basis` column, never into `content`. A sheet's `basis` column holds the notes of the sheet, of each side and of each row (by row id): `{ sheet, front, back, rows }`. A check constraint refuses `basis` at any depth of a sheet's `content`.
- **The draft file's own fields.** `config.draft` holds the draft `id` and `format`. The level name is `display_name`, and `position` is the level name as a number.
- **Sheet kind.** A sheet with a story row is `word`; any other sheet is `practice`. The draft format has no kind field yet.
- **Order.** `position` keeps the order of the topics, of the sheets in each topic, and of the questions, scenarios and region packs. The draft must list its sheets topic by topic, in the order of each topic, so the rows give the same list back.
- **Fields the draft does not hold.** `child_title`, `standards_tags`, `level_band`, `clock_format`, `date_format`, `grade_names` and the other keys of `config` belong to the admin tool. A new row starts empty; an import never changes them on a row that exists.

## Rules of an import

`importDraft(draft, store)`:

1. Makes a plain copy, removes the notes with `contentOf`, refuses a note in another place (`misplacedNotes`), and runs `validateSnapshot`. It also refuses a note that is not an object, and sheets out of topic order. The input is never changed.
2. Reads every row of the level (retired rows too) and plans the write (`planImport`, pure).
3. An item that did not change keeps its revision and status. An item that changed gets `revision + 1` and status `draft`: an approval is for one revision. A retired item that comes back is changed.
4. An item that the draft no longer has gets status `retired` and `revision + 1`. The import never deletes a row.
5. Writes the level row and the changed rows with `bank_write_level`, in one transaction.

`bank_write_level` refuses, and writes nothing:

- a write whose `expected` is not the level's `updated_at` as it was read (another import came first), with SQLSTATE `PT409` (HTTP 409). Do not use `40001`: PostgREST retries that code without end;
- a sheet id that another level owns (`23505`).

## Reviews

An approval belongs to one exact revision. An edit gives the item the next revision (see the rules of an import), so its old approval no longer counts. The latest review of a revision decides: a later `rejected` takes back an approval. `reviewItem(store, review)` refuses an unknown or retired item and a revision that is not the current one. Topics have no revision and need no review.

## Freeze a level

`freezeLevel(store, levelId, { renderer, frozenBy })` writes nothing on any problem, and lists every problem in plain words:

1. The level name must be a number from 1 to 99.
2. Every sheet, question, scenario and region pack that is not retired must have an approval of its current revision. Each item that does not is named, for example `Sheet "s-1" was approved at revision 1 and changed to revision 2 since: approve revision 2.` This check runs before anything is drawn.
3. The display codes come from the positions of the rows that are not retired: topic N is `<level name>-N` (`3-11`), and the sheets have the odd front pages 1, 3, ... 399 in topic order (topic 11, sheet 3 starts on page 205). The stored `code` and `first_page` do not count.
4. `freezeBank(..., { requireFullLevel: true })` runs every check of a full level (`docs/workbook-v2-engine.md`, "The freeze"): 20 topics of 10 sheets, every reference resolves, rows do not get easier down a side, answer kinds that marking reads, fit and own-slot ink. Its capacity report comes back with the snapshot; a row with fewer than 2 attempts without a repeat warns and does not refuse.
5. The snapshot is the content only. Its items are written with `bank_freeze_level` in one transaction, which checks the rules again: the level has not changed since it was read, the version is the next one, every item is approved at its current revision, and the items are exactly the items that are not retired. Each refusal is SQLSTATE `PT409` (never `40001`).

## Read a snapshot

`readSnapshot(store, snapshotId)` gives the whole snapshot. It checks each item against its hash, the items against the manifest hash, and the snapshot against its content hash, so `buildBook` gives the same record, PDF and page images as from the frozen file. `readBookSnapshot(store, snapshotId, sheetIds)` reads only the header, the topics, the word problems and the book's sheets; it gives the same PDF and page images, and `hash` is the hash of the whole snapshot.

**Timing check:** `POST /api/workbook-v2-snapshot-read` with `Authorization: Bearer <CRON_SECRET>` and `{"snapshotId": "<uuid>", "sheetIds": [...]}` (1 to 60 different ids) reads one book's rows from Supabase inside the Vercel function. It answers `{ httpStatus, snapshotId, sheetCount, rowCount, payloadBytes, totalMs, parts: { snapshotMetaMs, itemsReadMs, assembleMs, overheadMs } }`. Each part rounds down and the total up, so the parts add up to `totalMs`. It writes nothing; 404 for an unknown snapshot, and in production unless `WORKBOOK_V2_TEST_PUBLISH=on`.

## Stores

`BankStore` has `readLevel`, `writeLevel` and `exportLevelDraft`, and for reviews and snapshots `readReviews`, `addReview`, `readSnapshots`, `readSnapshotMeta`, `readSnapshotItems` and `writeSnapshot`. `memoryBankStore()` keeps the rules of `bank_write_level` and `bank_freeze_level` in memory, and its review and snapshot rows are frozen. `supabaseBankStore(db)` needs a client with the secret key, and reads each table in pages of 1,000 rows (the PostgREST cap).

## Tests

`bank-store.test.ts` runs one contract on the memory store, on the Supabase store over a fake PostgREST (with the 1,000-row cap), and, when asked, on the live project:

```sh
BANK_STORE_LIVE=1 SUPABASE_URL=... SUPABASE_SECRET_KEY=... npx vitest run src/lib/workbook-v2-bank/bank-store.test.ts
```

The live run writes only levels named `synth-test-*`, with sheet ids marked by the run, and deletes them after the run. `import-draft.test.ts` tests the git rule and the statuses of the plan.

`freeze-level.test.ts` runs the freeze contract on the memory store and on the fake PostgREST: a synthetic full level of 200 invented sheets with a made-up source in every note, an edit that needs a new approval, the freeze, no `basis` or source in any item, and books built from the frozen file, the whole stored snapshot and one book's rows, compared byte for byte (with the pinned Typst when it is installed). It never runs on the live project, because snapshot rows can never be deleted. Probe the live tables only inside one transaction that ends in an error or a rollback, and then count that no `synth-test-*` row is left.
