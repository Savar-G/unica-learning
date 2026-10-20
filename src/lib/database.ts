import type { Database as Generated, Json } from "@/lib/database.types";

export type { Json, Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

// The schema types every Supabase client uses: the generated types (src/lib/database.types.ts, `npm run db:types`)
// with one correction. The generator types every function argument as not null, because Postgres cannot mark one
// NOT NULL. NullArgs lists the arguments a call sends as null; each function's SQL reads null there as "none".
// A function or argument name that is not in the generated types fails the build.
type Fns = Generated["public"]["Functions"];
type Known<T extends { [F in keyof T]: F extends keyof Fns ? keyof Fns[F]["Args"] : never }> = T;
type AnswerNulls = "p_misconception" | "p_read_aloud_count" | "p_read_aloud_at_ms" | "p_away_count" | "p_away_ms" | "p_work_text";
type NullArgs = Known<{
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
  [S in keyof Generated]: S extends "public" ? { [K in keyof Generated[S]]: K extends "Functions" ? Functions : Generated[S][K] } : Generated[S];
};

// Interfaces have no index signature, so TypeScript does not accept one as Json. This checks the shape instead:
// only strings, numbers, booleans, null, arrays and plain objects of them.
type JsonShape<T> = T extends string | number | boolean | null ? T
  : T extends (...args: never[]) => unknown ? never
  : T extends object ? { [K in keyof T]: JsonShape<T[K]> }
  : never;

/** A value for a json or jsonb column or argument. */
export function toJson<T>(value: T & JsonShape<T>): Json {
  return value as Json;
}
