# Cancel recovery checks for issue #772

Date: 2026-11-09. Base: `bc6aeb63`.

## Failure controls

- Without the admin close implementation, all nine public-interface admin checks failed.
- With the old request close, the test that requests family deletion during the Stripe read failed at the family fence.
- With the sweep disabled, four alert checks failed. These include a lost admission answer and a process stopped after admission.
- Before the reminder route called the sweep, its integration check failed because the response had no cancellation sweep result.
- Before the migration, the rolled-back hosted probe failed because the recovery functions did not exist.

## Evidence

- Cancel request: a simulated Stripe SDK transport proves the admission, unknown-write, close, and alert behavior. It passes through the actual public Cancel function. It makes no provider request.
- Sweep: concurrent and repeated runs prove one delivery per operation through a synthetic database transport. A refused send can retry. An unknown send stays claimed. A claim that crosses the send deadline sends nothing and is released.
- Admin action: a simulated Stripe SDK transport proves applied and refused outcomes, a failed read, the minimum age, and family scope. It proves that the action sends no Stripe write. It does not prove production Stripe permissions.
- Database: migration `20261109180404` was applied through Supabase MCP. `list_migrations` confirmed it. The synthetic hosted probe passed and rolled back. It checks normal and fenced closes, hold release, retry, alert claims, admin-only listing, foreign-family refusal, narrow fence changes, and service-only grants. It deletes no family.
- Compatibility: hashes of `finish_plan_control`, `admit_plan_cancel`, `assert_family_writable`, `fence_family_write`, and `fence_child_delete_write` matched before and after application. The hosted probe also checks that the old close still refuses a fenced family.
- Types: `npm run db:types` generated the committed database types after application.
- Browser: Aside checked the real client component on a temporary local page with sample data and simulated action responses. The button displayed the applied, refused, and unreadable-Stripe messages. The test tab was closed. The server was stopped. The temporary page was removed. This is component behavior evidence, not a signed-in hosted operator check.

The focused Vitest selection passed 51 checks across seven files with `--maxWorkers=2`. All heavy commands used the shared gate slot. The full suite was not run.

Changed-file ESLint, `next typegen`, `tsc --noEmit`, and the single final `npm run build` passed.
