// The working copy in Supabase (migration 20261127191913_bank_working_copy). Pass a client with the secret key: the
// bank tables and bank_write_level are service-only. Every read pages past PostgREST's cap of 1,000 rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import { draftFromRows } from "./draft";
import { supabaseSnapshotStore } from "./supabase-snapshots";
import type { BankStore, LevelRows, LevelWrite, WriteResult } from "./types";

/** Rows of one read; PostgREST never gives more than 1,000, whatever the range asks. */
export const BANK_PAGE_ROWS = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Every row, one range after another, until a page comes back short. An aborted `signal` stops before the next page. */
async function allPages<T>(what: string, page: (from: number, to: number) => Page<T>, signal?: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += BANK_PAGE_ROWS) {
    signal?.throwIfAborted();
    const { data, error } = await page(from, from + BANK_PAGE_ROWS - 1);
    if (error) throw new Error(`bank read ${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < BANK_PAGE_ROWS) return rows;
  }
}

/** bank_write_level refuses with these codes: a stale read, and a sheet id that another level owns. */
const REFUSALS = new Set(["PT409", "23505"]);
/** Maximum consistent-read retries when a concurrent write updates the level between paged reads. */
const MAX_READ_ATTEMPTS = 5;

export function supabaseBankStore(db: SupabaseClient<Database>): BankStore {
  const readLevel = async (levelId: string): Promise<LevelRows> => {
    for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt++) {
      const { data: level, error } = await db.from("bank_levels")
        .select("id, display_name, position, status, config, basis, default_region, updated_at").eq("id", levelId).maybeSingle();
      if (error) throw new Error(`bank read level: ${error.message}`);
      const beforeVersion = level?.updated_at ?? null;
      const [topics, sheets, questions, scenarios, regionPacks] = await Promise.all([
        allPages("topics", (from, to) => db.from("bank_topics")
          .select("level_id, id, code, position, title, child_title, standards_tags, basis, status").eq("level_id", levelId).order("id").range(from, to)),
        allPages("sheets", (from, to) => db.from("bank_sheets")
          .select("sheet_id, level_id, topic_id, position, first_page, kind, content, basis, revision, status").eq("level_id", levelId).order("sheet_id").range(from, to)),
        allPages("questions", (from, to) => db.from("bank_questions")
          .select("level_id, id, position, scenario_kind, regions, slots, unit, solver, difficulty, phrasings, basis, revision, status").eq("level_id", levelId).order("id").range(from, to)),
        allPages("scenarios", (from, to) => db.from("bank_scenarios")
          .select("level_id, id, position, interest, level_band, kind, content, basis, revision, status").eq("level_id", levelId).order("id").range(from, to)),
        allPages("region packs", (from, to) => db.from("bank_region_packs")
          .select("level_id, id, position, units, coins, spelling, clock_format, date_format, grade_names, basis, revision, status").eq("level_id", levelId).order("id").range(from, to)),
      ]);
      const { data: after, error: afterError } = await db.from("bank_levels")
        .select("updated_at").eq("id", levelId).maybeSingle();
      if (afterError) throw new Error(`bank read level version: ${afterError.message}`);
      const afterVersion = after?.updated_at ?? null;
      const noRows = topics.length === 0 && sheets.length === 0 && questions.length === 0 && scenarios.length === 0 && regionPacks.length === 0;
      if (beforeVersion === afterVersion && (beforeVersion !== null || noRows)) {
        if (!level) return { level: null, version: null, topics, sheets, questions, scenarios, regionPacks };
        const { updated_at: version, ...row } = level;
        return { level: row, version, topics, sheets, questions, scenarios, regionPacks };
      }
    }
    throw new Error(`bank read ${levelId}: level changed concurrently across ${MAX_READ_ATTEMPTS} reads`);
  };

  const writeLevel = async (write: LevelWrite): Promise<WriteResult> => {
    // The rows are plain JSON already; the round trip drops nothing.
    const payload: Json = JSON.parse(JSON.stringify(write));
    const { data, error } = await db.rpc("bank_write_level", { p_write: payload });
    if (error) {
      if (REFUSALS.has(error.code)) return { ok: false, problem: error.message };
      throw new Error(`bank write: ${error.message}`);
    }
    const version = typeof data === "object" && data !== null && !Array.isArray(data) ? data.version : undefined;
    if (typeof version !== "string") throw new Error("bank write: unexpected answer");
    return { ok: true, version };
  };

  return { readLevel, writeLevel, exportLevelDraft: async (levelId) => draftFromRows(await readLevel(levelId)), ...supabaseSnapshotStore(db, allPages) };
}
