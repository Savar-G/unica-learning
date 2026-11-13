// Each state list in the code must equal the values its database column allows (docs/state-machines.md, item 2). The
// database side comes from src/lib/database.checks.ts: after a migration that changes a check, run npm run db:checks.
// To add a machine, add one line here with its list and its column.
import { describe, expect, it } from "vitest";
import { AD_STEPS } from "@/lib/ad-visit-steps";
import { ATTEMPT_STATUSES } from "@/lib/assessment";
import { FAMILY_BUCKETS } from "@/lib/assessment/deletion";
import { allowedValues } from "@/lib/database-checks";
import { LEARNING_GOALS, MATH_FEELINGS, MATH_HELPS } from "@/lib/learning-style";
import { LOG_KINDS, LOG_STATUSES } from "@/lib/email-log-kinds";
import { FLAG_LEVELS } from "@/lib/maya-call";
import { AI_FEATURES } from "@/lib/ai-usage";
import { ASSISTANCE } from "@/lib/maya/session";
import { DELIVERY_TYPES } from "@/lib/resend-webhook";
import { SCAN_BLOCKED_REASONS, SCAN_CALIBRATION_STATES, SCAN_JOB_STATES, SCAN_PHOTO_STATES } from "@/lib/scan-states";
import { GATE_OUTCOMES } from "@/lib/workbook-run-gates";

const LISTS: { name: string; list: readonly string[]; table: string; column: string }[] = [
  { name: "AD_STEPS", list: AD_STEPS, table: "ad_visit_steps", column: "step" },
  { name: "DELIVERY_TYPES", list: DELIVERY_TYPES, table: "email_events", column: "type" },
  { name: "FLAG_LEVELS", list: FLAG_LEVELS, table: "maya_calls", column: "flag" },
  { name: "FLAG_LEVELS", list: FLAG_LEVELS, table: "maya_call_alerts", column: "level" },
  { name: "ASSISTANCE", list: ASSISTANCE, table: "maya_calls", column: "assistance" },
  { name: "FAMILY_BUCKETS", list: FAMILY_BUCKETS, table: "child_deleted_folders", column: "bucket" },
  { name: "LOG_KINDS", list: LOG_KINDS, table: "email_log", column: "kind" },
  { name: "LOG_STATUSES", list: LOG_STATUSES, table: "email_log", column: "status" },
  { name: "ATTEMPT_STATUSES", list: ATTEMPT_STATUSES, table: "assessments", column: "status" },
  { name: "SCAN_PHOTO_STATES", list: SCAN_PHOTO_STATES, table: "scan_photos", column: "state" },
  { name: "SCAN_JOB_STATES", list: SCAN_JOB_STATES, table: "scan_marking_jobs", column: "state" },
  { name: "SCAN_BLOCKED_REASONS", list: SCAN_BLOCKED_REASONS, table: "scan_marking_jobs", column: "blocked_reason" },
  { name: "SCAN_CALIBRATION_STATES", list: SCAN_CALIBRATION_STATES, table: "scan_calibrations", column: "state" },
  // D-325: the parent goals asked after signup.
  { name: "LEARNING_GOALS", list: LEARNING_GOALS.map((g) => g.id), table: "children", column: "learning_goal" },
  { name: "MATH_FEELINGS", list: MATH_FEELINGS.map((f) => f.id), table: "children", column: "math_feeling" },
  { name: "MATH_HELPS", list: MATH_HELPS.map((h) => h.id), table: "children", column: "math_help" },
  { name: "GATE_OUTCOMES", list: GATE_OUTCOMES, table: "workbook_run_gates", column: "outcome" },
  // D-330: what made an AI call.
  { name: "AI_FEATURES", list: AI_FEATURES, table: "ai_usage_events", column: "feature" },
];

describe("state lists equal the database checks", () => {
  it.each(LISTS)("$name equals the check on $table, column $column", ({ list, table, column }) => {
    const allowed = allowedValues(table, column);
    expect(allowed, `${table}.${column} has no "one of these values" check`).not.toBeNull();
    expect([...list].sort()).toEqual(allowed);
  });
});
