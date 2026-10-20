import type { Database as Generated, Json } from "@/lib/database.types";
import type { AnswerChange } from "@/lib/answer-events";
import type { AttemptStatus, FactsTest, HelpAnswer, Placement, Province, ReportModel, Route, StoredTest } from "@/lib/assessment";
import type { LogKind, LogStatus } from "@/lib/reminders";
import type { PlanId } from "@/lib/site";
import type { TestDevice } from "@/lib/test-context";
import type { StoredReview } from "@/lib/work-review";

export type { Json };

// The schema types every Supabase client uses: the generated types (src/lib/database.types.ts, `npm run db:types`)
// with two corrections, both checked against the generated types, so a name that is not there fails the build.

// 1. What a column holds where the schema says less: a check constraint limits a text column to a few values, and a
// jsonb column holds the type the site writes to it. Each entry keeps the column's null; a column that is not jsonb
// can only narrow. Reads, inserts and updates of these columns take these types.
type Tbls = Generated["public"]["Tables"];
type ColumnTypes = KnownColumns<{
  answers: { answer_changes: AnswerChange[] | null };
  assessment_facts: { test: FactsTest };
  assessments: { status: AttemptStatus; province: Province; route: Route | null; help: HelpAnswer | null; test: StoredTest; placement: Placement | null; device: TestDevice | null };
  card_setups: { plan: PlanId };
  children: { province: Province };
  email_log: { kind: LogKind; status: LogStatus | null };
  reports: { model: ReportModel };
  work_reviews: { kind: StoredReview["kind"]; confidence: StoredReview["confidence"] };
}>;
type Fits<T, Column> = Json extends Column ? T
  : (null extends T ? 1 : 0) extends (null extends Column ? 1 : 0) ? (NonNullable<T> extends NonNullable<Column> ? T : never) : never;
type KnownColumns<T extends { [N in keyof T]: N extends keyof Tbls ? { [C in keyof T[N]]: C extends keyof Tbls[N]["Row"] ? Fits<T[N][C], Tbls[N]["Row"][C]> : never } : never }> = T;
type Narrow<T, C> = { [K in keyof T]: K extends keyof C ? C[K] : T[K] };
type DbTables = {
  [N in keyof Tbls]: N extends keyof ColumnTypes
    ? { Row: Narrow<Tbls[N]["Row"], ColumnTypes[N]>; Insert: Narrow<Tbls[N]["Insert"], ColumnTypes[N]>; Update: Narrow<Tbls[N]["Update"], ColumnTypes[N]>; Relationships: Tbls[N]["Relationships"] }
    : Tbls[N];
};

// 2. The generator types every function argument as not null, because Postgres cannot mark one NOT NULL. NullArgs
// lists the arguments a call sends as null; each function's SQL reads null there as "none".
type Fns = Generated["public"]["Functions"];
type KnownArgs<T extends { [F in keyof T]: F extends keyof Fns ? keyof Fns[F]["Args"] : never }> = T;
type AnswerNulls = "p_misconception" | "p_read_aloud_count" | "p_read_aloud_at_ms" | "p_away_count" | "p_away_ms" | "p_work_text";
type NullArgs = KnownArgs<{
  admin_template_stats_v2: "school_grade" | "curriculum";
  change_answer: AnswerNulls | "p_work_path" | "p_strokes_path";
  change_answer_keep_drawing: AnswerNulls;
  claim_family_retention: "subscription_ended_at";
  complete_test: "p_help";
  create_family: "p_postal";
  // Paging: null asks for the first page.
  family_deletion_candidates: "after_id";
  family_retention_candidates: "after_id";
  finish_booking_signup: "customer";
  pending_family_payment_operations: "after_id";
  record_reminder_click: "p_assessment";
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
