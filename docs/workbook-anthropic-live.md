# Direct Anthropic Book 1 runs

Cedric authorized direct Anthropic generation for Gerald and Geraldine on November 16, 2026, up to USD35 each, USD70 combined. The previous USD5 local verification budget is separate and must not be reset. This runner creates a normal stored draft through the existing workbook job. It does not approve, print, ship or email a book.

The normal production button still queues Savar's subscription worker. Having a local API key does not change that button. Run this operator command from the reviewed, clean checkout instead:

```sh
ANTHROPIC_API_KEY_FILE=/private/path/to/key node scripts/workbook-anthropic-live.mjs --child Gerald
ANTHROPIC_API_KEY_FILE=/private/path/to/key node scripts/workbook-anthropic-live.mjs --child Gerald --execute
```

Repeat for Geraldine after Gerald finishes. Omit `--execute` for read-only family and queue checks. Supabase credentials come from `SUPABASE_SECRET_KEY` or the existing `supabase-pagewise` Keychain item. The script does not change the worker's environment or Vercel settings. Never print or commit the key.

The runner verifies the two fixed child IDs, their parent, Cedric's current admin identity, no stored Book 1 and no active run. The database defaults new runs to the server runner, so Savar's Mac cannot take them. It refuses existing active runs rather than rerouting them or mixing old model checkpoints into a new run. The normal job preserves the family's stored instructions, curriculum, independent solve checks, strict physical fit checks, durable AI-call records and draft rendering.

The observed current worker frame has no decision-model gate configured. This runner likewise has no decision-model key. It retains the deterministic and independent-solver checks, but does not claim an additional calibrated model page review. Inspect the finished PDF before approval.

Each child has one persistent ledger at `~/.local/state/unica/workbook-anthropic-live/<child-id>.json`. Reuse it for every attempt. Never delete, rename, replace or reinitialize it to permit more spending. The guard reserves a conservative maximum before each dispatch. It includes concurrent requests, restarts, token usage, retries and schema repairs. Unknown billing keeps its reservation. Unknown pricing or usage exceeding a reservation halts the ledger. A crash may leave its lock behind; reconcile the ledger before removing that lock.

Only the pinned Sonnet 5.5 writer and Haiku 5.5 solver are priced. Subscription fallback, OpenRouter fallback, server-side model fallback and SDK transport retries are disabled. A rejected structured-output schema may be resent with the schema in its instructions, with a separate guarded dispatch. Single-dispatch edit callers cannot make that extra request. No unrelated AI feature receives the API key. Token counting is free; an account rejection stops before message creation.

Rates and token-count behavior were checked against [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) and [token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting) on November 16, 2026. The ledger uses the higher Haiku context rate and conservative cache accounting. Its total can exceed the eventual invoice, which keeps the authorized cap conservative.

If generation fails, read the stored run error and the budget ledger before another attempt. For an interrupted active API run, add `--resume-run <run-id>` to continue its exact build and writer/solver models under the same ledger. Normal lease checks prevent taking another active holder's work. A newly created run's number and identity are checked again after the transactional start, so concurrent approval cannot turn this authorization into Book 2 generation. A `done` outcome establishes a stored draft, not sample approval or readiness to mail. Preserve failed attempts and incomplete drafts as evidence.
