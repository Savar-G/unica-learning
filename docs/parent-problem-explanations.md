# Parent problem explanations (#675, D-299)

The parent selects Explain this problem beside a wrong answer on Page results. The API accepts only the item ID and mark version. The session supplies the parent. The service RPC resolves the child, book, immutable print, page, package and current canonical mark. It refuses other families, mismatched children, pending or unscored marks, unreadable answers and stale versions. The module also refuses invalid, unsupported and not-checked packages or a missing stored key. It does not mark a page or change a score.

The model receives four fields: stored question text, stored correct answer, the answer read from the page, and code-written steps. It receives no photo, identity, family record, profile or private file path. User wording and read answers stay JSON data under the system instruction. The output is one to four short steps and one sentence for the parent to say. Shape and length checks reject invalid output. The component renders text. Code displays the stored key separately. A fake test proves the data boundary. It does not prove that a real model follows the instruction on each adversarial input.

The context hash includes the prompt/schema protocol, canonical item identity, effective observation and mark version, full stored question/version, teaching and regions, and immutable print contract. A photo URL alone cannot select a cached explanation. The RPC checks the context at claim, admission, save and read. Corrections use the same family scan lock. A 20-second database lease serializes concurrent presses. A stale worker cannot save or release its successor. The module also checks abort and live session/release after blocking reads. Failed output never enters the success cache. A successful cached read still needs current ownership and mark eligibility.

## Global spending control

Use only the feature price and anonymous ledger. Test and Admin traffic count. The hard total is USD 10 per UTC calendar month. The global budget lock precedes the period and held-spend calculation. The database clock runs after the lock wait. The model is `anthropic/claude-haiku-5.5`, the lower text model class already used in this repository. This choice is an implementation choice, not a price claim. Global `AI_MODEL`, Maya and marking settings do not change.

Every actual AiClient transport attempt, including a retry, obtains a new reservation. The final wire body is at most 16,384 UTF-8 bytes. The output cap is 768 tokens, including reasoning. The wrapper requires structured output, low effort and required provider parameters. The schema rejects changed bounds. No price is enabled by the migration.

Before root enables the feature price, root must verify a conservative maximum for this exact model, request protocol, bounded input, provider framing, output/reasoning cap, and any per-request charges or internal routing charges. Root must retain the source and calculation in the price evidence. Do not infer a token price or maximum from this document. If the provider cannot establish a safe bound, keep the price disabled. The verification expires after 24 hours. A missing, stale, future or incompatible price refuses dispatch.

Only valid transport usage with the configured model, numeric prompt/output token counts and a finite nonnegative cost settles a charge. Missing or malformed usage, abort, connection loss and unknown failure keep the full reservation. No timer frees money. Settlement is monotonic. Actual usage above the reservation is recorded and stops all later dispatches until investigated. Deletion removes the private cache and dispatch link but keeps the anonymous charge facts. No model, caller, month or price from a browser grants permission.

## Root migration and proof order

1. Start from main `356e6f40fc12552fbdedb717a8607f498832f09a` or a descendant with the existing scan marking, mark-change and deletion migrations.
2. Apply `supabase/migrations/20261106220000_parent_problem_explanations.sql` once. It adds four tables and one service-only RPC. It does not replace a marking or deletion function.
3. Verify the migration list. Run `supabase/tests/parent_problem_explanations_hosted.sql`. Confirm RLS, restricted grants, both write fences and a disabled price.
4. Run `npm run db:types`. Commit the official `src/lib/database.types.ts`. Do not hand-edit it. The implementation deliberately uses the generated RPC name, so an absent RPC type is a build error before this step. Add `parent_explanation_command: "p_parent" | "p_photo" | "p_token"` to `NullArgs` in `src/lib/database.ts` with the official types. The generator marks these SQL arguments as non-null even though settlement must send null. This is the required shared helper addition. This child leaves that file unchanged for coordination. Preserve the clean429 declarations: `scan_marking_evaluation_deferrals`, `defer_scan_marking_evaluation`, and `scan_marking_evaluation_has_generation`.
5. Verify model/provider compatibility and price metadata. Configure only this feature price with the verified maximum and evidence. Keep family switches off. Include all proof spend in the same cap.
6. Run the few approved live proof calls. Check normal output, repeat with no additional dispatch, stale correction refusal, and real usage settlement. Keep provider and hosted evidence separate from local evidence.
7. Inspect the synthetic explanation states on the existing Admin parent preview. Complete the full repository gate and independent review. Root owns the push and PR.

## Local verification

`node supabase/tests/parent_problem_explanations.cjs` starts its own PostgreSQL 18 instance under `/tmp/pd675-pg-*`. It accepts no hosted connection configuration and uses a Unix socket with no TCP listener. It stops the owned server on exit. Dependency tables use the existing reduced scan fixture. Production functions and the new migration run unchanged. The month-boundary test alone substitutes a synthetic database clock and uses a deliberately reordered control.

The focused Vitest set covers the public module, memory adapter, AiClient wrapper, component, route and inert Admin preview. The SQL integration also runs the production module and Supabase adapter with fake AI through the real public RPC. These checks do not establish hosted permissions, real provider quality, browser layout or release acceptance. Those remain with root.
