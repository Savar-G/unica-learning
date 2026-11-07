# Hosted integration of parent explanations

Computer: Savars-MacBook-Pro-5.local. The reviewed repair is `58fafd00f49601d1441e4172a89042a2594d3e81`. Actual main merge `7fe49140c807e29f774b84d941c7621d37043a7a` integrated without conflict. The reviewed feature source and migration stayed byte-identical during that merge.

Applied `parent_problem_explanations` as hosted migration `20261107030658` in project `cdjobwsyzndtltzfpyqa`. The migration source blob is `9e5c06b190283c2b79d9295f3e156f846452ba5b`, equal to the reviewed blob. It changes no release switch or shared marking function. The initial price is disabled and unverified.

Hosted privilege inspection found RLS on all four new tables. The anon and authenticated roles have no table access or RPC execute grant. The service role has read access and the command RPC, with no direct mutation grants. Both family and child write fences cover the two private owned tables. Composite child ownership and cascade references are installed.

The behavioral probe is `supabase/tests/parent_problem_explanations_rollback.sql`. It returned `PROBE_OK_PD675`. The actual service-role boundary exercised complete-page context, a disabled-price refusal, a temporary synthetic reservation, the global cap, unknown-cost retention, literal comparison text, one cached result, a pending-sibling refusal at context/admission/save/read, and the family-deletion fence. Both browser roles were refused at the actual RPC boundary. A caught subtransaction rolled back every synthetic row, price and money hold. Final counts were zero probe parents, cached results, spend rows and enabled prices. No provider or Storage request ran. The first probe stopped on an ambiguous probe variable and rolled back; the corrected probe passed.

The security advisor added four INFO findings for RLS tables with no policies. These are the four intentional service-only tables. Browser grants are revoked and the service-only command owns mutation. No other finding was added. The [Supabase advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) explains that informational check.

Official `npm run db:types` exited 0. The installed CLI was v2.118.0; the command supplied the explicit project ID. The generated file contains the clean429 table and functions. Its diff against the peer's `33b60236` has 186 additions and zero deletions. The only manual type correction is the approved `NullArgs` entry for nullable parent, photo and token arguments of `parent_explanation_command`. The generated file was not edited by hand.

Root then added feature-local provider filters to support a verified request maximum: only the Anthropic endpoint, no internal fallback, and maximum prompt/completion/request prices. The shared AI adapter and global model configuration remain unchanged. The binding transport test failed before that addition and passed after it. A final integration review must cover this addition before live price enablement.

These checks use one hosted backend and synthetic records. They do not prove concurrent hosted behavior, actual image content, real provider prices or billing, browser behavior or release acceptance. Provider proof, browser evidence, the complete test sequence and final review remain open. Family release is off.
