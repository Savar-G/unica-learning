// Each state list in the code must equal the values its database column allows (docs/state-machines.md, item 2). The
// database side comes from src/lib/database.checks.ts: after a migration that changes a check, run npm run db:checks.
// To add a machine, add one line here with its list and its column.
import { describe, expect, it } from "vitest";
import { AD_STEPS } from "@/lib/ad-visit-steps";
import { FAMILY_BUCKETS } from "@/lib/assessment/deletion";
import { allowedValues } from "@/lib/database-checks";
import { FLAG_LEVELS } from "@/lib/maya-call";
import { ASSISTANCE } from "@/lib/maya/session";
import { DELIVERY_TYPES } from "@/lib/resend-webhook";

const LISTS: { name: string; list: readonly string[]; table: string; column: string }[] = [
  { name: "AD_STEPS", list: AD_STEPS, table: "ad_visit_steps", column: "step" },
  { name: "DELIVERY_TYPES", list: DELIVERY_TYPES, table: "email_events", column: "type" },
  { name: "FLAG_LEVELS", list: FLAG_LEVELS, table: "maya_calls", column: "flag" },
  { name: "FLAG_LEVELS", list: FLAG_LEVELS, table: "maya_call_alerts", column: "level" },
  { name: "ASSISTANCE", list: ASSISTANCE, table: "maya_calls", column: "assistance" },
  { name: "FAMILY_BUCKETS", list: FAMILY_BUCKETS, table: "child_deleted_folders", column: "bucket" },
];

describe("state lists equal the database checks", () => {
  it.each(LISTS)("$name equals the check on $table, column $column", ({ list, table, column }) => {
    const allowed = allowedValues(table, column);
    expect(allowed, `${table}.${column} has no "one of these values" check`).not.toBeNull();
    expect([...list].sort()).toEqual(allowed);
  });
});
