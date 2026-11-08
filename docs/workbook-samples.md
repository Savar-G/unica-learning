# Sample workbooks for every level (#363)

`npm run workbooks:samples` drafts sample workbooks through the real generator and the real templates, for review.
Nothing is sent to print or shipped.

## The test family

- Parent "Workbook samples", `workbook-samples@unicalearning.com` (parent id `65aaf981-4b43-43d4-84d8-716f7fd7f2c7`), marked as a test family in `public.test_accounts` (D-099). Its `parents.source` is `{"test":"workbook-samples-363"}`.
- One child per level U1 to U30. Each child's `learning_note` names its level; the script finds the children by it.
- Each child's profile is made up in code (`src/lib/workbook-sample-profiles.ts`): a level, unit A (the level's first taught unit), a Unit B gap (the next unit), and three weak skills that come back in Fix it on workbook 2.
- The script is idempotent: a second run finds the family and adds only missing children. It refuses a family with that email that it did not make.
- `npm run workbooks:samples -- --family-only` makes or finds the family and prints the children. It needs no AI.

## A run

```sh
OPENROUTER_API_KEY_FILE=<file> AI_MODEL=<model> npm run workbooks:samples -- --levels U12
npm run workbooks:samples -- --levels all --second U5,U12,U22 --test U12
```

- Each book: the planner, then the generator with `book` set (pages laid out for the templates, `src/lib/workbook-book.ts`), the strict fit check of the real templates (`renderFitCheck` with `workbookTemplate`), and the draft stored in `public.workbook_drafts`.
- Then the whole book is printed. When every page passes the strict render, that is the PDF. Otherwise the review print (`reviewPrint`) draws each failing page's reasons on it.
- Files: the PDF and page images go to the bucket `workbook-pages` at `<parent>/<draft id>/review-<key>...` (inside the family folder, so the family deletion and the retention worker remove them) and to the review folder (default `/tmp/ui-review/samples`): `<book>.pdf`, `<book>-contact.png`, `pages/<book>/`, and `index.md` with pages, questions, failed questions, failed pages, "not checked by code" and the AI cost (OpenRouter's `usage.cost` on each answer).
- `--fake` runs a fake AI for a layout dry run. It stores nothing, and `index.md` says FAKE AI.
- `--concurrency` (default 6) is how many day pages are written at once.

## Skill titles (D-201)

`src/lib/workbook-skill-titles.ts` holds a short title for every skill in the BC skill map. A page with one skill uses
its skill title. Several skills from one unit use the unit title. Story and review pages keep their rules.

```sh
node scripts/generate-workbook-skill-titles.mjs
node scripts/generate-workbook-skill-titles.mjs --check
node scripts/check-workbook-skill-title-fit.mjs
npm run workbooks:samples -- --fake --levels U3 --out /tmp/ui-review/wording-r2
```

The writer calls `claude -p` on the subscription, with `ANTHROPIC_API_KEY` removed and
`CLAUDE_CONFIG_DIR=/Users/savargupta/.claude_second`. It uses Sonnet at high effort, in batches of up to 40 skills.
It saves each batch in `/tmp/ui-review/skill-title-generation.json` so a stopped run can resume. `--fresh` writes
the titles again. Code checks each batch and asks for corrections to invalid titles before it writes the data file.
`--check` makes no model calls. It validates the committed data and writes `/tmp/ui-review/skill-titles.md`, grouped
by unit, with any wording flags. The fit check prints every skill and unit title with the workbook's font, weight,
size and column width. It fails if a title is absent, hidden, blank or too wide. Its measurements are in
`/tmp/ui-review/wording-r2/skill-title-fit.json`.

## Review selected days (#479)

`--days 1,3,5,8,10` selects five days from the normal ten-day plan. It gives 40 practice pages for U4, plus the cover, plan and binding blanks, for a 44-page PDF. The original plan remains unchanged. This option is only for review samples and cannot be combined with second or test books.

The #479 layout-only check uses:

```sh
env -u OPENROUTER_API_KEY -u OPENROUTER_API_KEY_FILE -u ANTHROPIC_API_KEY WORKBOOK_CLAUDE_CONFIG_DIR=/Users/savargupta/.claude_second npm run workbooks:samples -- --fake --levels U4 --days 1,3,5,8,10 --concurrency 4 --out /tmp/ui-review/samples-479-fake-final
```

See `docs/workbook-feedback-479.md` for the shared `dayDifficulty` API, the checks that the #480 writer must use, and the U26 checker limits. The fake run makes no subscription or API calls and stores nothing. It does not approve question quality.
