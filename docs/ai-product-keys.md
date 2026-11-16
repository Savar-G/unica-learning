# Dedicated OpenRouter product keys

Every model API key serves one product. The code map in `src/lib/ai-product-keys.ts` assigns each feature to its product and environment variable. Cost attribution uses that feature, the selected credential's safe alias and SHA-256 identity, the model, and the provider's generation ID. It uses no AI classifier.

| Product alias | Features | Server secret |
|---|---|---|
| `maya` | `maya`, `maya_review`, `maya_note`, `maya_speech` | `MAYA_OPENROUTER_API_KEY` |
| `marking` | `marking`, `photo_check` | `SCAN_MARKING_OPENROUTER_API_KEY` |
| `explanations` | `explain` | `PARENT_EXPLANATION_API_KEY` |
| `workbook` | `workbook`, `solve_check`, `workbook_gate` | `WORKBOOK_OPENROUTER_API_KEY` |
| `assessments` | `report`, `work_review` | `ASSESSMENT_OPENROUTER_API_KEY` |
| `profiles` | `child_profile`, `learner_profile` | `PROFILE_OPENROUTER_API_KEY` |

`maya_speech` remains a feature of the separate estimated speech ledger. This map does not send speech calls to OpenRouter or turn estimates into provider charges.

The product variables must contain distinct trimmed credentials. A duplicate binding across any two configured products closes all product API clients. The check returns no credential or error value to a browser or a log. A missing key disables that product's API client. An unknown or missing feature has no API client. The historical feature `other` remains readable, but it cannot select a model key. Helpers reject an incorrect caller feature.

Neither `OPENROUTER_API_KEY` nor `DECISIONS_OPENROUTER_API_KEY` enables a model call. The old aliases `main` and `decisions` remain readable for retained receipts. The separate admin billing reader can still read its configured account; it does not select model credentials.

## Shared helpers and ownership

- `aiClient` requires an assigned usage feature. It selects the product key before it creates the OpenRouter adapter. Model settings and provider routes stay in their existing modules.
- `decisionClient` requires the caller's usage feature. Photo checks use marking. Workbook question and page gates use workbook. The price check, retry count, request bounds and before-send checks retain their behavior.
- Decisions receipts now record each provider response's generation ID and cost once. The returned decision result still gives the existing total retry cost for admission and settlement. A failed charged attempt retains its own receipt.
- Maya's model, safety reads, math and talk reviews, and notes use Maya. The availability checks use the same selection as the request.
- Profile findings after a Maya call use profiles. They keep the call's family, child and source ID. The existing Maya spending admission still bounds those calls.
- Profile rebuilds bind known family and child IDs after the stored source loads. The binding changes no feature, product, context or existing source ID. Without a known owner, the receipt stays unassigned.
- Marking and parent explanations use the full configured product map. They retain their current models, provider routes, retry counts and admission rules.

Only bounded IDs and usage metadata enter the cost ledger. No name, prompt, answer or custom personal text is added for cost reporting. Generation IDs come from the provider. Missing costs remain unknown. Subscription calls retain no per-call charge.

## Local tools and workers

Maya practice uses `MAYA_OPENROUTER_API_KEY` or `MAYA_OPENROUTER_API_KEY_FILE`. Its optional `.env.local` read accepts only product key variables and the existing model setting. All practice roles belong to Maya. Simulator and tutor requests use `maya`; reviews and judges use `maya_review`. Their context stays `practice`, with the run UUID and a code-defined role source.

Maya text tests use `MAYA_OPENROUTER_API_KEY` from the environment or `.env.local`. Their context stays `test`.

Workbook samples use `WORKBOOK_OPENROUTER_API_KEY` or `WORKBOOK_OPENROUTER_API_KEY_FILE`. Writer and solver receipts retain their separate features and evaluation context. Subscription-only mode has no API fallback. Codex mode stays on the ChatGPT subscription and ignores API credentials. The Claude and Codex child process environment allows no model API key.

Photo threshold and decision marking tools use `SCAN_MARKING_OPENROUTER_API_KEY`. Workbook gate tools use `WORKBOOK_OPENROUTER_API_KEY`. These tools use evaluation context and a run UUID. Existing marking evaluation tools retain their marking key and evaluation context. No tool falls back to a generic OpenRouter key.

The workbook worker needs the workbook key only for its optional OpenRouter fallback and gates. Its profile rebuilds need the profiles key. The voice worker needs the Maya key for Maya and the profiles key for optional profile findings. Worker production context remains explicit. Stored admin-test calls and family flags remain reporting evidence. No worker deployment is part of this change.

## Required root work before release

`AI_PRODUCT_KEYS_ROOT_STEPS_PENDING`

1. Integrate the implementation commit into PR #1131 with the separate admin report change. Extend the admin key-month reader to include all six product variables. Retain historical aliases and unknown attribution. Update the project environment table and the old report-off message to use the new names.
2. Create or adopt one dedicated credential for each product. Configure the variables securely on Vercel and on each worker that needs them. Do not reuse a credential across products. Existing marking and explanation credentials may stay when they serve only their listed product. No credentials were read, created or configured by this implementation task.
3. Check live migration history and the unique UTC filename. Apply `20261116213019_ai_product_key_aliases.sql` before code release. It only expands `ai_usage_events.key_alias` to accept `maya`, `workbook`, `assessments` and `profiles`. All existing values remain accepted. The existing `AI_KEY_ALIASES` state-list registration covers the expanded list.
4. Run `npm run db:types` and `npm run db:checks`. Commit the generated output. The implementation task leaves generated files unchanged. Until regeneration, `state-lists.test.ts` must detect the difference from the old hosted constraint.
5. Verify the applied constraint and each dedicated binding on the hosted platform. Complete independent review and the full test, lint and build checks. Local fake requests prove routing and receipts; they do not prove hosted credentials or permissions.
6. Coordinate the voice worker release only after the current Maya owner finishes #1130. Never deploy to the same worker in parallel. Rebuild and restart long-lived processes with the new bindings after the migration and secrets are ready.
7. Update the project vault with the verified result and pending release state. Change this marker to `AI_PRODUCT_KEYS_ROOT_STEPS_DONE` only after the required work is complete.

## Root verification record (2026-11-16)

- Product routing is integrated into PR #1131. The key-month compatibility reader lists all six product variables. The active admin page reads only the Unica workspace analytics.
- Hosted migration `20261116215521 ai_product_key_aliases` matches local `20261116213019_ai_product_key_aliases.sql`. Generated types were refreshed and unchanged. Generated checks contain all 11 accepted current and historical labels. A service-role rollback probe accepted each label, refused an unknown label and left zero probe rows.
- The root configuration and report-message fixes passed 144 focused tests. Independent combined reviews, full checks, worker release, web release and webhook activation remain required.
- Six distinct product credentials are configured for Production. No model request or classifier ran. Historical unknown ownership remains unknown.


## Combined review repairs (2026-11-16)

Two independent reviews of 792763948 passed Standards and found four P2 specification defects. The root repaired the shared admin alias reader, parent-scoped photo child ownership, per-book sample ownership, and paid profile access in the subscription-only first-pages example.

The photo owner read has a three-second limit. A failed read retains unknown ownership and preserves the optional check's existing admission. Stored samples carry verified parent/child IDs and the workbook source. No-store samples carry no invented family or child IDs. All sample modes retain the same shared provider exclusion gate.

The two original acceptance checks failed before the repairs and passed after them. The root's 64 focused tests passed. A synthetic sample-factory probe checked 24 writer/solver requests across four modes, two book owners and no-store ownership. The repaired subscription guard and its control each sent zero fake profile requests. These checks used fake transports and prove no hosted model behavior.

Generated types and 696 checks now include the separately applied additive #1084 board-fates migration, hosted version 20261116221027. This PR includes the generated schema refresh, not that issue's implementation. Final settlement, full checks and release remain pending.
