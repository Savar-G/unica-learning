# Local samples with the Codex subscription

Use Codex CLI 0.166.0 or later. Sign in with ChatGPT in the account directory that the run will use. The sample command does not sign in or change accounts.

The `--codex` option uses `gpt-6.1-sol` at high effort. It requires `--no-store` and an explicit `WORKBOOK_CODEX_HOME`. It rejects other provider options. It never selects an API provider or reads an API key. The production workbook worker keeps its existing provider settings.

```sh
WORKBOOK_CODEX_HOME=/Users/savargupta/.codex-t3/unify \
node scripts/workbook-samples.mjs --codex --subscription-only --no-store \
  --levels U16 --persona first-customer --days 1,5,10 --concurrency 3 \
  --out /tmp/unica-codex-u16
```

Follow the final-pair procedure in [the fast loop](workbook-fast-loop.md). Use `--codex` and `WORKBOOK_CODEX_HOME` in place of the Claude account setting. Use `--replay` when a prior real cache exists. A model change causes new requests. Do not copy responses under a different model name. A first Codex run can need new calls for every question check.

Each call uses a temporary directory. The child receives only basic process settings and the selected Codex account directory. API keys are excluded. User configuration, project instructions, hooks, plugins, apps, shell tools, web search and subagents are disabled. The child uses a read-only sandbox and an ephemeral session. The CLI constrains the response with the request's JSON Schema. A failed turn, missing result, invalid JSON, tool event, timeout or cancellation fails the request.

The writer and solve checker use separate requests to the same Sol model. Code still computes the answer keys and checks the results. This does not provide a second-model check. The local report records the Codex provider and the same-model limit. The cache records `gpt-6.1-sol` with each exact request. The fixed high effort setting applies even when the caller requests less effort.

Calls use the selected subscription allowance. They can reach its usage limit. A usage limit, lost login or missing CLI stops further dispatch through the shared writer and solver provider gate. There is no API fallback.

## Initial verification

On Savar's MacBook, the Unify login passed a real JSON request with Sol at high effort. The public adapter also passed a real request. The focused adapter and provider suites passed 23 tests. These checks establish local subscription access and adapter behavior. They do not establish sample quality, hosted operation or customer approval.

Implementation reference: [Codex exec](https://learn.chatgpt.com/docs/developer-commands#codex-exec). The installed CLI help supplies the exact flags for this version.
