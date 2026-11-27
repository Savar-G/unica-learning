# Workbook v2 bank: the working copy

The working copy holds the draft content of each level in Supabase (architecture spec 9.2, UNI-241). The bank import writes a draft file into it, and reads the rows back as the same draft. The freeze (`freezeBank`, see `docs/workbook-v2-engine.md`) turns a draft into a snapshot; snapshots and reviews are UNI-242.

Code: `src/lib/workbook-v2-bank/`. Migrations: `20261127191913_bank_working_copy`, `20261127192640_bank_write_level_refusal`, `20261127195924_bank_working_copy_hardening`, `20261127202034_bank_child_version_trigger`, `20261127203021_bank_write_level_restore_flag`.

## Import a draft

```sh
SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run workbook:v2:bank:import -- --draft /private/folder/level-3.json
```

- The command refuses a file inside a git repository or worktree, before it reads the file. It checks the path and the path that its links lead to. Draft files hold private content, and the code repository is public.
- It checks the whole draft before it writes. A draft with a problem writes nothing, and the command lists each problem.
- It writes the level in one database call, then reads the level back and compares it with the file, field for field.

## Tables

All six tables are service-role only: RLS is on, `PUBLIC`, `anon`, and `authenticated` have no grants, and no table has a policy.

| Table | Key | Holds |
| -- | -- | -- |
| `bank_levels` | `id` | display name (the level name), position, status, `config`, `basis` of the level, `default_region` |
| `bank_topics` | `level_id`, `id` | code, position, title, `child_title`, `standards_tags`, `basis`, status |
| `bank_sheets` | `sheet_id` (in all levels) | `level_id`, `topic_id`, position in the topic, `first_page`, kind, `content` (both sides), `basis`, revision, status |
| `bank_questions` | `level_id`, `id` | position, scenario kind, regions, slots, unit, solver, difficulty, phrasings, `basis`, revision, status |
| `bank_scenarios` | `level_id`, `id` | position, interest, `level_band`, kind, `content` (place, container, thing, verb, unit, quantity limits), `basis`, revision, status |
| `bank_region_packs` | `level_id`, `id` | position, units, coins, spelling, clock and date format, grade names, `basis`, revision, status |

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

## Stores

`BankStore` has `readLevel`, `writeLevel` and `exportLevelDraft`. `memoryBankStore()` keeps the rules of `bank_write_level` in memory. `supabaseBankStore(db)` needs a client with the secret key, and reads each table in pages of 1,000 rows (the PostgREST cap).

## Tests

`bank-store.test.ts` runs one contract on the memory store, on the Supabase store over a fake PostgREST (with the 1,000-row cap), and, when asked, on the live project:

```sh
BANK_STORE_LIVE=1 SUPABASE_URL=... SUPABASE_SECRET_KEY=... npx vitest run src/lib/workbook-v2-bank/bank-store.test.ts
```

The live run writes only levels named `synth-test-*`, with sheet ids marked by the run, and deletes them after the run. `import-draft.test.ts` tests the git rule and the statuses of the plan.
