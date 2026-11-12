# Maya request schema compatibility

IMPLEMENT_DONE_MAYA_SCHEMA_COMPAT

The local repair is complete. Practice remains REQUIRED. Paid runs used: 0 of 2.

## Source and ownership

- Computer: Savar's MacBook, `Savars-MacBook-Pro-5.local`.
- Prepared path: `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-8e92d4a3`.
- Resolved path: `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-8e92d4a3`.
- Verified branch: `site/maya-request-schema-compat`.
- Exact base: `70707fd0f2cd28f98983e39d7eb381491a0938e1`.
- Initial checkout was clean. Only this prepared checkout changed.
- Read the fresh `AGENTS.md`, AI client types, OpenRouter transport, Maya model, proposal schema, all practice-role adapters and schemas, and practice CLI model defaults.
- Read the supplied `schema-preflight.json` and `.log` under `/Users/savargupta/unica-workbook-samples/first-customer-marking-20261106/maya-resume/`.

## Official reference

Verified on 2026-11-06: [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations) and its schema complexity section.

The documented request limits are 16 union fields and 24 optional fields. Union fields use `anyOf` or a type array. The API rejects numeric bounds, string length bounds, and array constraints other than `minItems` values 0 and 1. The same page documents additional internal compilation limits. Passing the explicit limits does not prove provider acceptance.

## Change

The common OpenRouter helper examines schema positions before dispatch. It selects instruction-based JSON for `anthropic/claude-*` when a schema exceeds either explicit limit or contains the checked unsupported bounds. It appends the complete original schema to the trusted system instructions. It omits `response_format` for that request.

Supported schemas retain the original system text and strict `json_schema` format. Other model families retain their original format. The helper has no request-name cache and no HTTP retry path.

The helper checks numeric bounds, string length bounds, `maxItems`, `uniqueItems`, and unsupported `minItems` values. It examines nested objects, arrays, alternatives and definition maps. It does not treat property names, descriptions, examples, or enum values as constraints. It is a bounded compatibility check, not a complete schema validator or reference resolver.

JSON parsing and all existing caller checks remain in place. Maya's prompt version changes from `maya-text-chat-28` to `maya-text-chat-29` because the effective system instructions change.

## Practice inventory

The test captures requests through the actual public adapters and `fakeAiClient`. It then sends each captured request through the actual OpenRouter transport and fake HTTP provider.

| Role / request name | Union fields | Optional fields | Detected unsupported constraints | Claude request format |
| --- | ---: | ---: | --- | --- |
| Maya / `maya_proposal` | 35 | 0 | `minimum`, `maxLength`, `maxItems`, `minItems: 2` | Full schema in system instructions |
| Simulator / `practice_child` | 2 | 0 | None | Strict `json_schema` |
| Validity judge / `practice_validity` | 0 | 0 | None | Strict `json_schema` |
| Main judge / `practice_judgement` | 8 maximum | 0 | None | Strict `json_schema` |
| Free-talk review / `maya_talk_review` | 0 | 0 | `maxLength: 300` | Full schema in system instructions |

The main judge control includes all eight dimensions. A case uses only its applicable dimensions. The common helper also supports a Claude override for the judge roles. No model default changes.

## Base falsifier

Before the transport or prompt-version edit, ran this new control against the exact base transport:

```sh
npx vitest run src/lib/ai-openrouter-schema.test.ts --maxWorkers=1 -t 'dispatches the actual Maya 35-union'
```

Result: FAIL, one executed test. The fake HTTP provider rejected the actual request with:

```text
OpenRouter answered 400: Schema rejected: 35 union fields; limit 16; constraints maxItems,minimum,maxLength,minimum,maxLength,maxItems,maxItems,minItems,maxItems
```

After the repair, the same control returns the proposal from one HTTP dispatch. The full actual schema is present in the system message. The user message is unchanged. This is a local fake-provider reproduction, not an observed hosted rejection or paid-model result.

## Verification

```sh
npx vitest run src/lib/ai-openrouter-schema.test.ts src/lib/ai-openrouter.test.ts src/lib/maya-text.test.ts src/lib/maya-practice/practice.test.ts --maxWorkers=1
```

PASS: 253 tests across four files, including 28 new schema compatibility tests.

- Transport: proves format selection, the 16/17 union and 24/25 optional boundaries, nested type arrays, unsupported bounds, one dispatch for accepted requests, and no retry after HTTP 400. Existing tests also pass for timeouts, cancellation, refusals, truncated output and transient retries. This does not prove live provider behavior.
- Accounting and dispatch: proves the existing permission hook, dispatch hook, cost hook, usage request, model, token budget, reasoning options, provider object and headers remain present. This does not exercise a real ledger or provider charge.
- Maya caller: proves malformed JSON still fails parsing. Invalid proposal versions and unsafe free-talk proposals still reach the existing refusal and fallback checks. The two requests in these controls are the existing caller repair, not transport retries. This does not prove model-driven teaching quality.
- Free-talk review: proves a valid pass remains a pass, a valid fail remains a fail, and invalid rules, inconsistent pass output, and reasons above 300 characters remain errors. This does not judge the meaning of an actual model response.
- Practice roles: proves all five current request shapes dispatch through fake HTTP. Existing simulator, validity and score validators still reject invalid parsed values. This does not prove simulated-child validity or judgement quality.
- Marking compatibility: proves a representative v6 shape with two nullable `anyOf` fields and a text-length description retains its complete strict schema and original system text. The control does not import or inspect the unmerged marking source, photos or truth. There is no marking-specific path.

Changed-file lint passed:

```sh
npx eslint src/lib/ai-openrouter.ts src/lib/ai-openrouter-schema.ts src/lib/ai-openrouter-schema.test.ts src/lib/maya-model.ts
```

TypeScript passed:

```sh
NEXT_TELEMETRY_DISABLED=1 npx next typegen
npx tsc --noEmit --incremental false
```

The initial TypeScript attempt failed because this fresh checkout lacked Next-generated route and image declarations. The local Next CLI guide documents `typegen` for this case. Type generation passed. The repeated TypeScript check passed with no errors. No build ran. Generated files remain ignored.

This checkout initially had no dependencies. Installed the locked dependencies locally with `npm ci --ignore-scripts --no-audit --no-fund`. The package manifests and lockfile did not change.

## Changed files and integration

1. `src/lib/ai-openrouter-schema.ts`: new pure request-format helper.
2. `src/lib/ai-openrouter.ts`: helper import and request-body integration only.
3. `src/lib/maya-model.ts`: prompt version only.
4. `src/lib/ai-openrouter-schema.test.ts`: public fake-HTTP controls and role inventory.
5. `docs/maya-schema-compat-report.md`: this report.

Exact changed transport statements for integration with Root's unmerged provider-pin additions:

```diff
+import { openRouterJsonOutput } from "@/lib/ai-openrouter-schema";
 function body(model: string, request: AiJsonRequest) {
+  const output = openRouterJsonOutput(model, request);
-      { role: "system", content: request.system },
+      { role: "system", content: output.system },
-    response_format: { type: "json_schema", json_schema: { name: request.name, strict: true, schema: request.schema } },
+    ...(output.response_format ? { response_format: output.response_format } : {}),
```

The existing `provider: { require_parameters: true }` statement is unchanged. Timeout, cancellation, parsing, retry, accounting and header code is unchanged. Controller files, AI types and practice-role schemas are unchanged.

## Remaining limits

Instruction-based JSON has no provider grammar guarantee. Existing caller validation remains mandatory. **Fenced output (first-ship practice at 6de7e777, 9 of 319 Maya calls failed as `bad_json`):** for a request sent without `response_format`, the OpenRouter adapter (`readOutput` in `src/lib/ai-openrouter.ts`) also reads JSON inside exactly one outer ```` ```json ```` or ```` ``` ```` fence around the whole output, and notes it (`src/lib/ai-fenced.ts`). Prose before or after it, a second block, a fence inside it, another language tag or an unclosed fence is still not JSON. A request that sent `response_format` reads its output strictly, as before. The caller checks the value against the same schema either way. Each fenced Maya proposal is `fenced: true` on its trace attempt (`fencedReplies` counts them), and the practice report counts them (`fencedJson` in report.json, a "Fenced JSON" line in report.md). The helper does not predict undocumented grammar complexity, resolve recursive references, or validate every JSON Schema keyword. A later incompatible schema can still receive a 400; no automatic schema-refusal retry was added.

Root owns independent review, the full gate, required practice, browser checks and publication. Practice remains REQUIRED. Paid runs used: 0 of 2.

No paid or subscription model call, practice run, credential access, hosted write, full suite, build, Chromium run, browser, PR, push, merge, migration, family switch or print change ran. PRs 624, 642 and 667 were not merged or altered.
