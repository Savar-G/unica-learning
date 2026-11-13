# Migration history

This folder records SQL changes to the hosted database. It is **not a supported
bootstrap script**: do not replay all files in filename order to create a database.
The live project's `supabase_migrations.schema_migrations` table is the source of
truth for applied versions and names. Read it through Supabase MCP
`list_migrations` before applying a change; filenames alone do not tell you which
changes have run or their dependency order.

## Existing files

The history mixes eight-digit dates and 14-digit timestamps, and many files share
one date prefix. For example, `20261105234500_plan_controls.sql` sorts before
`20261105_plan_starts.sql`, although the controls migration references
`public.plan_starts`, which the latter creates. A lexically sorted replay fails.

Keep historical filenames and SQL intact. Existing scripts, tests and open
branches refer to them. Do not rename files or change the live migration history
merely to make filenames consistent. Reconcile any mismatch with the live history
before deciding which SQL is missing; a differently named local file is not proof
that its change needs to be applied again.

A fresh database needs a separately verified baseline and dependency order. This
policy does not supply that baseline, reconcile the existing files with the live
versions, or establish a replay order for the old files. Do not use a blanket
`supabase db reset` or `supabase db push` as a replacement for that work.

## New migrations

1. Use `<yyyymmddHHMMSS>_<name>.sql`, with a **14-digit UTC timestamp** and a
   descriptive snake_case name. Generate a prefix with `date -u +%Y%m%d%H%M%S`.
   Check that the prefix is unique among local files, `origin/main` and the live
   applied versions. Check again before merging concurrent work. If a new
   migration depends on another new migration, its version must sort after that
   dependency; this rule does not repair the older history.
2. Read the project's applied history with `list_migrations` and verify that the
   schema dependencies exist. Keep the SQL additive so the running site continues
   to work between the database change and the application deployment.
3. Apply the SQL through Supabase MCP `apply_migration` to project
   `cdjobwsyzndtltzfpyqa`, then verify it with `list_migrations` and a probe query.
   Check the returned version and name rather than assuming that the apply tool
   used the local filename's timestamp. Record a differing applied version in the
   PR so the local SQL can be matched to its live history entry.
4. Run `npm run db:types` and commit the generated types in the same PR. When a
   check constraint changes, also run `npm run db:checks`. Follow the generation
   rules in [AGENTS.md](../../AGENTS.md); do not edit generated files by hand.

## SQL probes and CI

Files in `supabase/tests/` are individual probes with their own prerequisites;
their presence does not mean that CI runs them or replays this folder. The
[CI workflow](../../.github/workflows/ci.yml) runs `npm run test:family-zones`
(`supabase/tests/maya_window_zones.cjs --bootstrap`) against an empty local
PostgreSQL database using its selected bootstrap. That check is not a full
migration replay or coverage of every SQL probe. When changing SQL, run the
relevant probes according to their headers and record the commands and results
in the PR.
