# ADR 0001: Bank content lives in the database

- Status: Accepted. Decided, not built yet.
- Date: 2026-11-24
- Source: product spec 2.1, 2.4 (choice 1), 5.3, 12.2 and 18; architecture spec 9.1, 9.2, 10.3, 10.4, 11.1, 11.2 and 17 (Workbook generator v2)

## Context

The bank holds the approved content of each level: topics, sheets, defined questions, scenarios and region packs. The bank is small: 14 levels of 200 sheets is 2,800 sheets. The bank must join with marks and children. The code repo is public.

## Decision

- Bank content is in Supabase Postgres. It is not in the repo.
- A recipe **shape** is TypeScript code in the repo, with typed limits. Recipe **content** (limits, order and wording) is in the database.
- A row is inside its sheet, with its shape and limits. Sheets do not share recipe records.
- Each level has one working copy and its frozen snapshots. A freeze copies the approved sheets, questions, scenarios and region packs into snapshot items. A trigger blocks update and delete on these items.
- A book depends on exactly one snapshot.

## Options rejected

- **Content in the repo.** The repo is public, so content cannot be there.
- **A different database engine.** No evidence shows that the database engine is a slow part. Slow reads come from region, access rules, pooling or payload size. A local test read 40 sheet rows in 0.32 ms.
- **An expression language in the database.** A shape is plain code with typed limits. In v1, a template hides its limits in a text expression.
- **Recipe records that many sheets share.** One edit could change many sheets, so a fix in one place could break another.
- **A snapshot as one row per level.** A book reads about 40 sheets. With one row per item, the admin tool can compare two versions by hash.

## Consequence

- Admins read and write through server functions. Parents read nothing. No bank table has a public access rule.
- A new shape is a code change. A change of limits, order or wording is a database change that needs a new approval and a new freeze.
- Books already made keep their snapshot. Sheet ids stay the same between snapshots.
- The bank import command validates drafts and writes draft rows. Draft files stay outside the public repo.
- Public CI uses synthetic content only. Golden books from real bank content stay private.
- The command line can build a book offline from a snapshot file.
- The real round trip from Vercel to Supabase is not measured yet. The first slice measures it.
