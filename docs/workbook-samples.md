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
