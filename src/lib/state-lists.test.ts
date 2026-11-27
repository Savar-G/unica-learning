// Each state list in the code must equal the values its database column allows (docs/state-machines.md, item 2). The
// database side comes from src/lib/database.checks.ts: after a migration that changes a check, run npm run db:checks.
// To add a machine, add one line here with its list and its column.
import { describe, expect, it } from "vitest";
import { CUSTOMER_ACTIVITY_KINDS, ACTIVITY_PAGES } from "@/lib/customer-activity";
import { AD_STEPS } from "@/lib/ad-visit-steps";
import { ATTEMPT_STATUSES } from "@/lib/assessment";
import { FAMILY_BUCKETS } from "@/lib/assessment/deletion";
import { allowedValues, enumCheck } from "@/lib/database-checks";
import { DATABASE_CHECKS } from "@/lib/database.checks";
import { LEARNING_GOALS, MATH_FEELINGS, MATH_HELPS } from "@/lib/learning-style";
import { LOG_KINDS, LOG_STATUSES } from "@/lib/email-log-kinds";
import { SEND_KINDS, SEND_OUTCOMES } from "@/lib/email-send-kinds";
import { FLAG_LEVELS } from "@/lib/maya-call";
import { AI_FEATURES } from "@/lib/ai-usage";
import { AI_USAGE_CONTEXTS, AI_KEY_ALIASES } from "@/lib/ai-usage-context";
import { ASSISTANCE } from "@/lib/maya/session";
import { DELIVERY_TYPES } from "@/lib/resend-webhook";
import { SCAN_BLOCKED_REASONS, SCAN_CALIBRATION_STATES, SCAN_CLEAN_FAILURES, SCAN_JOB_STATES, SCAN_PHOTO_STATES, SCAN_REJECT_REASONS } from "@/lib/scan-states";
import { REFERRAL_RISKS, REFERRAL_OPERATION_STATES, REFERRAL_REWARD_KINDS, REFERRAL_EMAIL_STATES } from "@/lib/referrals";
import { GATE_OUTCOMES } from "@/lib/workbook-run-gates";
import { REFERENCE_RECORD_KINDS, TRANSCRIPT_STATUSES } from "@/lib/reference-record/import";
import { TOPIC_METHOD_STATUSES } from "@/lib/reference-method/types";
import { LEARNING_EVENT_ASSISTANCE } from "@/lib/learning-events";
import { ANSWER_KINDS } from "@/lib/workbook-v2/contract";
import { TIME_LOG_READING_STATES, WORKBOOK_GENERATORS } from "@/lib/workbook-v2-publish/types";

const LISTS: { name: string; list: readonly string[]; table: string; column: string }[] = [
  { name: "CUSTOMER_ACTIVITY_KINDS", list: CUSTOMER_ACTIVITY_KINDS, table: "customer_activity", column: "event" },
  { name: "ACTIVITY_PAGES", list: ACTIVITY_PAGES, table: "customer_activity", column: "page" },
  { name: "REFERRAL_RISKS", list: REFERRAL_RISKS, table: "referral_rewards", column: "risk" },
  { name: "REFERRAL_RISKS", list: REFERRAL_RISKS, table: "referral_invoice_risk", column: "risk" },
  { name: "REFERRAL_OPERATION_STATES", list: REFERRAL_OPERATION_STATES, table: "referral_operations", column: "state" },
  { name: "REFERRAL_REWARD_KINDS", list: REFERRAL_REWARD_KINDS, table: "referral_rewards", column: "kind" },
  { name: "REFERRAL_EMAIL_STATES", list: REFERRAL_EMAIL_STATES, table: "referral_rewards", column: "email_state" },
  { name: "AD_STEPS", list: AD_STEPS, table: "ad_visit_steps", column: "step" },
  { name: "DELIVERY_TYPES", list: DELIVERY_TYPES, table: "email_events", column: "type" },
  { name: "FLAG_LEVELS", list: FLAG_LEVELS, table: "maya_calls", column: "flag" },
  { name: "FLAG_LEVELS", list: FLAG_LEVELS, table: "maya_call_alerts", column: "level" },
  { name: "ASSISTANCE", list: ASSISTANCE, table: "maya_calls", column: "assistance" },
  { name: "FAMILY_BUCKETS", list: FAMILY_BUCKETS, table: "child_deleted_folders", column: "bucket" },
  { name: "LOG_KINDS", list: LOG_KINDS, table: "email_log", column: "kind" },
  { name: "LOG_STATUSES", list: LOG_STATUSES, table: "email_log", column: "status" },
  { name: "SEND_KINDS", list: SEND_KINDS, table: "email_sends", column: "kind" },
  { name: "SEND_OUTCOMES", list: SEND_OUTCOMES, table: "email_sends", column: "outcome" },
  { name: "ATTEMPT_STATUSES", list: ATTEMPT_STATUSES, table: "assessments", column: "status" },
  { name: "SCAN_PHOTO_STATES", list: SCAN_PHOTO_STATES, table: "scan_photos", column: "state" },
  { name: "SCAN_REJECT_REASONS", list: SCAN_REJECT_REASONS, table: "scan_photos", column: "reject_reason" },
  { name: "SCAN_JOB_STATES", list: SCAN_JOB_STATES, table: "scan_marking_jobs", column: "state" },
  { name: "SCAN_BLOCKED_REASONS", list: SCAN_BLOCKED_REASONS, table: "scan_marking_jobs", column: "blocked_reason" },
  { name: "SCAN_CALIBRATION_STATES", list: SCAN_CALIBRATION_STATES, table: "scan_calibrations", column: "state" },
  // #868: the one clean failure that frees a marking dispatch's hold (migration 20261114023202_scan_marking_clean_failures).
  { name: "SCAN_CLEAN_FAILURES", list: SCAN_CLEAN_FAILURES, table: "scan_marking_dispatches", column: "clean_failure" },
  // D-325: the parent goals asked after signup.
  { name: "LEARNING_GOALS", list: LEARNING_GOALS.map((g) => g.id), table: "children", column: "learning_goal" },
  { name: "MATH_FEELINGS", list: MATH_FEELINGS.map((f) => f.id), table: "children", column: "math_feeling" },
  { name: "MATH_HELPS", list: MATH_HELPS.map((h) => h.id), table: "children", column: "math_help" },
  { name: "GATE_OUTCOMES", list: GATE_OUTCOMES, table: "workbook_run_gates", column: "outcome" },
  { name: "REFERENCE_RECORD_KINDS", list: REFERENCE_RECORD_KINDS, table: "bank_reference_images", column: "kind" },
  { name: "TRANSCRIPT_STATUSES", list: TRANSCRIPT_STATUSES, table: "bank_reference_images", column: "transcript_status" },
  { name: "TOPIC_METHOD_STATUSES", list: TOPIC_METHOD_STATUSES, table: "bank_reference_topic_methods", column: "status" },
  { name: "AI_USAGE_CONTEXTS", list: AI_USAGE_CONTEXTS, table: "ai_usage_events", column: "usage_context" },
  { name: "AI_KEY_ALIASES", list: AI_KEY_ALIASES, table: "ai_usage_events", column: "key_alias" },
  // D-330: what made an AI call.
  { name: "AI_FEATURES", list: AI_FEATURES, table: "ai_usage_events", column: "feature" },
  // UNI-141: v2 books in today's workbook tables (migration 20261127023500_workbook_v2_publish).
  { name: "WORKBOOK_GENERATORS", list: WORKBOOK_GENERATORS, table: "workbooks", column: "generator" },
  { name: "TIME_LOG_READING_STATES", list: TIME_LOG_READING_STATES, table: "workbook_time_logs", column: "reading_state" },
  { name: "ANSWER_KINDS", list: ANSWER_KINDS, table: "workbook_item_answers", column: "answer_kind" },
  { name: "LEARNING_EVENT_ASSISTANCE", list: LEARNING_EVENT_ASSISTANCE, table: "learning_events", column: "assistance" },
];

// Grandfathered enum-like SQL checks not yet wired to an exported TS `as const` list.
// Never add new entries here: when a migration adds an enum-like CHECK constraint, export the TS list and add it to LISTS.
const LEGACY_UNREGISTERED_ENUM_CHECKS = new Set([
  "ai_usage_events.cost_basis", "ai_usage_events.provider", "anonymous_tests.province",
  "assessments.help", "assessments.province", "assessments.route", "assessments.stage3_route",
  "budget_categories.kind", "budget_entries.currency", "budget_entries.kind", "budget_entries.paid_by", "budget_entry_changes.action",
  "card_setups.plan", "child_plan_states.kind", "children.province", "children.weekly_time",
  "email_copies.outcome", "email_copies.report_email",
  "family_deletions.phase", "family_deletions.reason", "family_payment_operations.kind",
  "feedback.product", "feedback.source", "feedback.status",
  "learning_events.evidence_kind", "learning_events.question_source", "learning_events.result", "learning_events.source",
  "maya_call_alerts.status", "maya_call_connections.kind", "maya_call_notes.writer", "maya_call_sweep_cursors.kind",
  "maya_calls.kind", "maya_calls.mode", "maya_calls.outcome_reason", "maya_calls.paper_status",
  "maya_calls.question_source", "maya_calls.safety_severity", "maya_calls.status", "maya_calls.understanding",
  "maya_demo_children.made_by", "maya_minute_grants.kind", "maya_spend.charge", "maya_spend.what",
  "next_book_snapshots.held_reason", "next_book_snapshots.trigger_reason", "openrouter_provider_receipts.workspace_id",
  "parent_explanation_prices.model", "parent_explanation_prices.protocol",
  "plan_cancel_alerts.state", "plan_control_operations.kind", "plan_control_operations.state",
  "plan_starts.email_send_status", "plan_starts.email_state", "plan_starts.purpose", "plan_starts.state", "plan_starts.team_alert_state",
  "scan_link_emails.status", "scan_mark_changes.actor", "scan_marking_evaluation_deferrals.policy",
  "scan_marking_evaluation_resolutions.outcome", "scan_team_email_days.state",
  "signup_heard.channel", "signups.booking_state", "signups.curriculum", "signups.plan", "signups.status", "signups.subject",
  "skill_state_history.evidence_source", "skill_state_history.reason", "skill_state_history.state",
  "team_digest_days.state", "waitlist_joins.province", "work_reviews.confidence", "work_reviews.kind",
  "workbook_book1_baselines.engine", "workbook_book1_baselines.initial_activity", "workbook_book1_baselines.planning_kind",
  "workbook_comments.route", "workbook_comments.status", "workbook_draft_revisions.kind", "workbook_edit_calls.kind",
  "workbook_edits.action", "workbook_edits.edit_kind", "workbook_edits.runner", "workbook_edits.status",
  "workbook_emails.kind", "workbook_emails.status",
  "workbook_first_pages.decision", "workbook_first_pages.queued_by", "workbook_first_pages.runner", "workbook_first_pages.status",
  "workbook_plan_previews.engine",
  "workbook_run_ai_calls.kind", "workbook_run_ai_calls.outcome", "workbook_run_ai_calls.provider", "workbook_run_solves.verdict",
  "workbook_runs.runner", "workbook_runs.status", "workbook_runs.step",
  "workbook_scan_backstop_holds.reason", "workbook_scan_progress_events.reason", "workbook_scan_receipts.status",
  "workbook_scan_reminder_attempts.state", "workbook_scan_reminder_messages.state", "workbook_scan_trigger_claims.reason",
  "workbook_second_tries.engine", "workbook_second_tries.help", "workbook_second_tries.result", "workbook_second_tries.source",
  "workbook_workers.primary_ai", "workbooks.status",
]);

describe("state lists equal the database checks", () => {
  it.each(LISTS)("$name equals the check on $table, column $column", ({ list, table, column }) => {
    const allowed = allowedValues(table, column);
    expect(allowed, `${table}.${column} has no "one of these values" check`).not.toBeNull();
    expect([...list].sort()).toEqual(allowed);
  });

  it("covers every enum-like database check (no new unregistered SQL enum checks)", () => {
    const registered = new Set(LISTS.map(({ table, column }) => `${table}.${column}`));
    const dbEnumColumns = new Set<string>();
    for (const check of DATABASE_CHECKS) {
      const parsed = enumCheck(check.definition);
      if (parsed) dbEnumColumns.add(`${check.table}.${parsed.column}`);
    }

    const unregistered = [...dbEnumColumns]
      .filter((key) => !registered.has(key) && !LEGACY_UNREGISTERED_ENUM_CHECKS.has(key))
      .sort();
    expect(
      unregistered,
      "New enum-like Postgres CHECK constraint(s) found. Export an `as const` state list in TS and register it in LISTS (src/lib/state-lists.test.ts).",
    ).toEqual([]);

    const staleLegacy = [...LEGACY_UNREGISTERED_ENUM_CHECKS]
      .filter((key) => registered.has(key) || !dbEnumColumns.has(key))
      .sort();
    expect(
      staleLegacy,
      "Remove covered or deleted column(s) from LEGACY_UNREGISTERED_ENUM_CHECKS so the ratchet shrinks monotonically.",
    ).toEqual([]);
  });
});
