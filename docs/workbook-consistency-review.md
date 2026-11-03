# U4 consistency review

The single subscription sample is in `/tmp/ui-review/samples-480`.

- Content candidate: `f5088397de5e23be1e735cf1098834cd04b467c2`.
- Merged #481 candidate: `643e49dc9f338b5f5edee9faf97fbda7c650a96a`.
- Review days: 1, 3, 5, 8, 10. Each has 8 practice pages.
- PDF pages: 44, including the cover, plan and binding blanks.
- Questions: 179. Failed: 1, or 0.56%.
- Parent-checked items: 60.
- Overflow and strict render errors: 0.
- Vertical page use: minimum 80.4%, mean 93.8%.
- Estimated day minutes: 19.9, 21.3, 19.8, 19.3, 21.3.
- Calls: 30 on the subscription, 0 on the API. API cost: USD 0.00.
- Independent solve checks: 16. Each agreed with the key.
- Room omissions: 112 during layout selection and 35 after fitting, 147 total.

The index records one repeated ten-frame task at p41 q8. It remains marked failed
in the PDF. Review every omission before approval. A low failure rate does not
prove that every planned part is present. The sample and the example bank need
Savar's approval. Issue #480 stays open.

The command used the Claude configuration directory
`/Users/savargupta/.claude_second`. It removed `OPENROUTER_API_KEY`,
`OPENROUTER_API_KEY_FILE` and `ANTHROPIC_API_KEY`. The options were
`--levels U4 --days 1,3,5,8,10 --subscription-only --no-store --concurrency 4`.
No other level was generated. There were no family, database, shipment or print
order writes. The report labels were then clarified to separate layout omissions
from fit omissions. No question or model answer changed during that report edit.

## Checks and their limits

- Item tests prove that code drills make no writer, solver or attempt-ledger
  request. They reject changed formats, operations and story numbers. They also
  prove that a checkpoint failure does not repeat a writer request.
- The book tests exercise negative cases for repeats, progression, format
  variety, day time and measured fullness. They check these mechanical rules.
  They do not replace a review of teaching quality or challenge difficulty.
- `npm test` passed: 278 files, 12,442 tests, exit 0.
- `npx eslint src` and `npm run build` passed, exit 0.
- The generated contact sheet and page images were inspected. The local dev
  server served the likelihood page image. The browser confirmed a complete
  1275 by 1650 PNG. Browser screenshot capture timed out. The rendered PNGs
  supplied the visual check.

The type list covers 71 exact skill IDs. Other skills fail closed. This review
does not establish content support for every BC skill or any other level.
