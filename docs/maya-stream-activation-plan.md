# Maya stream activation plan

Source: `6eb24aec76a789bc21f03be49be1f897356a2680`.
Computer: `Savars-MacBook-Pro-5.local`.
Branch: `site/maya-chat-stream-activation`.

1. Bind sentence writes to exact server value `MAYA_CHAT_STREAMING_ENABLED=on` and trusted time at or after the verified cutover, `2026-11-16T20:33:36Z`. Savar approved removal of the earlier 12-hour wait. Live checks found zero active calls, all historical family calls in test families, compatible production readers, and Vercel `skewProtectionMaxAge: 0`. Recheck those release conditions before activation. Test the boundary and admission. Keep the actual-call protocol and family switches unchanged.
2. Prepare an additive service-only synthetic probe table and a constrained adapter for the unchanged `mayaCallStore`. Keep generated files for the lead.
3. Build a CLI with fake model and memory side effects. Test process loss, fresh-process recovery, end, sweep, fencing, normal completion and JSON with a fake local transport. Default to no request.
4. Run focused randomized tests through the shared gate, a relevant type check and lint. Open and link a draft PR. Write the completion report.

The lead applies SQL, regenerates types and checks, runs hosted proof, merges and sets production configuration. This child makes no hosted, credential, live model, browser or vault operation. Keep the credit hold and the local server at port 43125.

## Hosted schema verification (2026-11-16)

The lead applied `20261116192537_maya_stream_probe_calls.sql` through Supabase MCP. The live history records version `20261116204408`, name `maya_stream_probe_calls`. Column types and NOT NULL match the source table. RLS is enabled. There are no policies, user triggers or foreign keys. The service role can select, insert, update and delete. Both browser roles were refused for each operation. All 14 invalid identity cases were rejected in a rolled-back transaction. The probe table was empty after rollback.

`npm run db:types` and `npm run db:checks` generated the schema files from the live project. The output also includes concurrent additive AI usage and receipt schema already applied by other work. The application type check and 26 state-list checks passed. Hosted process recovery remains a separate required check.

Review A found that the former rollback pins omit the late technical-outcome repair. The corrected off procedure keeps the repaired release and all pending records. No rollback target may remove that repair while an incomplete streamed call remains unsettled.
