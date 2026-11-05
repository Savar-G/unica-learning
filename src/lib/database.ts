import type { Database as Generated, Json } from "@/lib/database.types";
import type { AdStep } from "@/lib/ad-visit-steps";
import type { AnswerChange } from "@/lib/answer-events";
import type { EventResult, EventSource, EvidenceKind } from "@/lib/learning-events";
import type { QuestionRef } from "@/lib/question-package";
import type { AnonymousTestCopy, AttemptStatus, FactsTest, HelpAnswer, Placement, Province, ReportModel, Route, SkillEvidence, SkillState, SkillStateReason, Stage3Route, StoredTest } from "@/lib/assessment";
import type { KnownPlan } from "@/lib/parent-plan";
import type { LogKind, LogStatus } from "@/lib/reminders";
import type { PlanId } from "@/lib/site";
import type { ScanCalibrationResult } from "@/lib/scan-crops";
import type { TestDevice } from "@/lib/test-context";
import type { StoredReview } from "@/lib/work-review";
import type { WorkbookStatus } from "@/lib/workbook-content";
import type { GeneratedPage, GeneratedWorkbook, StoredCall } from "@/lib/workbook-generator";
import type { DraftRendering, RunError, RunFrame, RunRunner, RunSolve, RunStatus, RunStep } from "@/lib/workbook-job";
import type { AiCallRecord, AiProvider } from "@/lib/ai-fallback";
import type { AiCallKind } from "@/lib/workbook-ai";
import type { RenderProblem } from "@/lib/workbook-render";
import type { PagePrintContract, PrintedRegion, ScanManifest, TeachingContext } from "@/lib/workbook-print-contract";
import type { BoardHistory } from "@/lib/board-history";
import type { Outcome, WordingHistory } from "@/lib/maya";
import type { AlertStatus, CallKind, CallRecord, CallStatus, FlagLevel } from "@/lib/maya-call";
import type { CallNote, NoteFacts, NoteTranscriptLine } from "@/lib/maya-call-note";
import type { MayaTrace } from "@/lib/maya-trace";
import type { WorkbookDelivery, WorkbookEmailKind, WorkbookEmailStatus } from "@/lib/workbook-email";
import type { ConnectionKind } from "@/lib/maya-voice";

export type { Json };

// The schema types every Supabase client uses: the generated types (src/lib/database.types.ts, `npm run db:types`)
// with two corrections, both checked against the generated types, so a name that is not there fails the build.

// 1. What a column holds where the schema says less: a check constraint limits a text column to a few values, and a
// jsonb column holds the type the site writes to it. Each entry keeps the column's null; a column that is not jsonb
// can only narrow. Reads, inserts and updates of these columns take these types.
type Tbls = Generated["public"]["Tables"];
type ColumnTypes = KnownColumns<{
  ad_visit_steps: { step: AdStep };
  anonymous_tests: { copy: AnonymousTestCopy };
  answers: { answer_changes: AnswerChange[] | null };
  assessment_facts: { test: FactsTest };
  assessments: { status: AttemptStatus; province: Province; route: Route | null; stage3_route: Stage3Route | null; help: HelpAnswer | null; test: StoredTest; placement: Placement | null; device: TestDevice | null };
  card_setups: { plan: PlanId };
  child_plan_states: { kind: KnownPlan["kind"] };
  children: { province: Province };
  email_log: { kind: LogKind; status: LogStatus | null };
  learning_events: { source: EventSource; question_source: QuestionRef["source"]; result: EventResult; evidence_kind: EvidenceKind | null };
  maya_calls: {
    kind: CallKind; mode: CallRecord["mode"]; question_source: QuestionRef["source"]; status: CallStatus; versions: CallRecord["versions"];
    outcome_reason: Outcome["reason"] | null; assistance: Outcome["assistance"] | null; paper_status: Outcome["paperStatus"] | null;
    understanding: Outcome["understanding"] | null; safety_severity: Outcome["safetySeverity"]; live: NonNullable<CallRecord["live"]> | null;
    trace: MayaTrace | null; board_history: BoardHistory | null; child_ink: BoardHistory | null; flag: FlagLevel | null; note_pending: CallRecord["notePending"];
  };
  maya_call_notes: { facts: NoteFacts; sentences: string[]; writer: CallNote["writer"]; transcript: NoteTranscriptLine[] };
  maya_call_connections: { kind: ConnectionKind };
  maya_call_alerts: { level: FlagLevel; status: AlertStatus };
  maya_demo_children: { made_by: "maya-demo-child" };
  maya_wording_history: { heard: WordingHistory };
  parents: { source: Record<string, string> };
  reports: { model: ReportModel };
  skill_state_history: { state: SkillState; reason: SkillStateReason; evidence_source: SkillEvidence };
  work_reviews: { kind: StoredReview["kind"]; confidence: StoredReview["confidence"] };
  scan_calibrations: { state: "running" | "ready" | "refused"; result: ScanCalibrationResult | null };
  workbooks: { status: WorkbookStatus; print_manifest: ScanManifest | null };
  workbook_pages: { print_contract: PagePrintContract | null };
  workbook_questions: { regions: PrintedRegion[] | null; teaching: TeachingContext | null };
  workbook_drafts: { draft: GeneratedWorkbook };
  workbook_emails: { kind: WorkbookEmailKind; status: WorkbookEmailStatus; delivery: WorkbookDelivery | Record<string, never> };
  workbook_runs: { status: RunStatus; step: RunStep | null; errors: RunError[]; runner: RunRunner };
  workbook_draft_revisions: { kind: "generated" | "edit" | "redo-page"; content: GeneratedWorkbook | null; rendering: DraftRendering | null; render_problems: RenderProblem[] };
  workbook_audit: { detail: Record<string, Json | undefined> };
  workbook_run_pages: { page: GeneratedPage };
  workbook_run_calls: { call: StoredCall };
  workbook_run_solves: { verdict: RunSolve["verdict"]; log: RunSolve["log"] };
  workbook_run_frames: { frame: RunFrame };
  workbook_run_ai_calls: { kind: AiCallKind; provider: AiProvider; outcome: AiCallRecord["outcome"] };
  workbook_workers: { primary_ai: AiProvider };
}>;
type Fits<T, Column> = Json extends Column ? T
  : (null extends T ? 1 : 0) extends (null extends Column ? 1 : 0) ? (NonNullable<T> extends NonNullable<Column> ? T : never) : never;
type KnownColumns<T extends { [N in keyof T]: N extends keyof Tbls ? { [C in keyof T[N]]: C extends keyof Tbls[N]["Row"] ? Fits<T[N][C], Tbls[N]["Row"][C]> : never } : never }> = T;
type ApplyColumnTypes<T, C> = { [K in keyof T]: K extends keyof C ? C[K] : T[K] };
type DbTables = {
  [N in keyof Tbls]: N extends keyof ColumnTypes
    ? {
      Row: ApplyColumnTypes<Tbls[N]["Row"], ColumnTypes[N]>;
      Insert: ApplyColumnTypes<Tbls[N]["Insert"], ColumnTypes[N]>;
      Update: ApplyColumnTypes<Tbls[N]["Update"], ColumnTypes[N]>;
      Relationships: Tbls[N]["Relationships"];
    }
    : Tbls[N];
};

// 2. The generator types every function argument as not null, because Postgres cannot mark one NOT NULL. NullArgs
// lists the arguments a call sends as null; each function's SQL reads null there as "none".
type Fns = Generated["public"]["Functions"];
type KnownArgs<T extends { [F in keyof T]: F extends keyof Fns ? keyof Fns[F]["Args"] : never }> = T;
type AnswerNulls = "p_misconception" | "p_read_aloud_count" | "p_read_aloud_at_ms" | "p_away_count" | "p_away_ms" | "p_work_text";
type NullArgs = KnownArgs<{
  queue_workbook_edit: "p_question" | "p_item";
  // A plan start on a child with no card update has no session.
  finish_card_lock: "p_session";
  settle_card_update: "p_session";
  // A refused start has no plan, and a plan with no trial has no first charge.
  finish_plan_start: "p_subscription" | "p_first_charge";
  note_plan_start_alert: "p_email_id" | "p_error";
  note_plan_start_email_send: "p_email_id" | "p_error";
  finish_workbook_edit: "p_content" | "p_rendering" | "p_error";
  admin_template_stats_v2: "school_grade" | "curriculum";
  // An idle worker has no run; a worker outside git has no build.
  beat_workbook_worker: "p_build" | "p_run" | "p_note";
  save_child_profile_and_skill_changes: "p_assessment" | "p_expected";
  save_child_profile_and_skill_changes_from_tests: "p_assessment" | "p_expected";
  change_answer: AnswerNulls | "p_work_path" | "p_strokes_path";
  change_answer_keep_drawing: AnswerNulls;
  claim_maya_weekly: "p_retry";
  claim_family_retention: "subscription_ended_at";
  complete_test: "p_help";
  create_family: "p_postal";
  // Paging: null asks for the first page.
  family_deletion_candidates: "after_id";
  family_retention_candidates: "after_id";
  finish_booking_signup: "customer";
  // A parent's demo minutes have no child (#330).
  grant_maya_minutes: "p_child";
  maya_minutes_used: "p_child";
  // A draft none of whose pages rendered has no rendering.
  finish_workbook_run: "p_rendering";
  save_workbook_run_draft: "p_profile_build";
  pending_family_payment_operations: "after_id";
  record_reminder_click: "p_assessment";
  // A plan with no charge or end date; a row filled from Stripe has no event.
  save_child_plan_state: "p_next_charge_at" | "p_ends_at" | "p_monthly_cents" | "p_event_at" | "p_event_id";
  save_family_payment_progress: "head_id" | "after_id";
}>;
type WithNullArgs<Fn, K> = Fn extends unknown
  ? { [P in keyof Fn]: P extends "Args" ? { [A in keyof Fn[P]]: A extends K ? Fn[P][A] | null : Fn[P][A] } : Fn[P] }
  : never;
type Functions = { [F in keyof Fns]: F extends keyof NullArgs ? WithNullArgs<Fns[F], NullArgs[F]> : Fns[F] };

export type Database = {
  [S in keyof Generated]: S extends "public"
    ? { [K in keyof Generated[S]]: K extends "Tables" ? DbTables : K extends "Functions" ? Functions : Generated[S][K] }
    : Generated[S];
};

export type TableName = keyof DbTables;
export type Tables<T extends TableName> = DbTables[T]["Row"];
export type TablesInsert<T extends TableName> = DbTables[T]["Insert"];
export type TablesUpdate<T extends TableName> = DbTables[T]["Update"];

// Interfaces have no index signature, so TypeScript does not accept one as Json. This checks the shape instead:
// only strings, numbers, booleans, null, arrays and plain objects of them.
type JsonShape<T> = T extends string | number | boolean | null ? T
  : T extends (...args: never[]) => unknown ? never
  : T extends object ? { [K in keyof T]: JsonShape<T[K]> }
  : never;

/** A value for a json or jsonb argument, or a jsonb column that ColumnTypes does not type. */
export function toJson<T>(value: T & JsonShape<T>): Json {
  return value as Json;
}
