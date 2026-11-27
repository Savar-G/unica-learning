// The bank import: a draft file becomes draft rows of the working copy. Every check runs before the first write. An
// item that changed gets the next revision and goes back to draft (its approval was for the old revision); an item that
// did not change keeps its revision and status; an item that the draft no longer has is retired, never deleted. Draft
// files hold private content, so a file inside a git repository is refused before it is read.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { findGitAncestor } from "@/lib/reference-record/output-guard";
import { canonicalJson } from "@/lib/workbook-v2/hash";
import { checkDraft, KEPT_FIELDS, type DraftRows } from "./draft";
import type { BankItemStatus, BankStore, LevelRows, LevelWrite } from "./types";

export interface ImportCounts { added: number; changed: number; unchanged: number; retired: number }
export type ImportResult =
  | { ok: true; levelId: string; version: string; counts: ImportCounts }
  | { ok: false; problems: string[] };

type Item = { status: BankItemStatus; revision?: number };

/** What an item holds, apart from its revision and status, in a form that does not depend on the order of keys. */
const fieldsOf = (row: object): string => canonicalJson(Object.fromEntries(Object.entries(row).filter(([key]) => key !== "status" && key !== "revision")));

/** The planned rows of one kind: the ones to write, and the counts. */
function planItems<Row extends Item>(
  current: readonly Row[],
  wanted: readonly Partial<Row>[],
  key: (row: Partial<Row>) => string,
  revised: boolean,
  counts: ImportCounts,
  kept: Partial<Row> = {},
): Row[] {
  const before = new Map(current.map((row) => [key(row), row]));
  const seen = new Set<string>();
  const writes: Row[] = [];
  const next = (row: Row) => (revised ? { revision: (row.revision ?? 0) + 1 } : {});
  for (const fresh of wanted) {
    const id = key(fresh);
    seen.add(id);
    const old = before.get(id);
    if (!old) {
      writes.push({ ...kept, ...fresh, status: "draft", ...(revised ? { revision: 1 } : {}) } as Row);
      counts.added++;
      continue;
    }
    // Fields that the draft does not hold (a child-facing title, say) keep the value they have.
    const merged = { ...old, ...fresh };
    if (old.status !== "retired" && fieldsOf(old) === fieldsOf(merged)) {
      counts.unchanged++;
      continue;
    }
    writes.push({ ...merged, status: "draft", ...next(old) });
    counts.changed++;
  }
  for (const old of current) {
    if (seen.has(key(old)) || old.status === "retired") continue;
    writes.push({ ...old, status: "retired", ...next(old) });
    counts.retired++;
  }
  return writes;
}

/** The write that turns the current rows of a level into the rows of a draft. Pure: the same rows give the same write. */
export function planImport(current: LevelRows, rows: DraftRows): { write: LevelWrite; counts: ImportCounts } {
  const counts: ImportCounts = { added: 0, changed: 0, unchanged: 0, retired: 0 };
  const old = current.level;
  const level = {
    ...rows.level,
    status: old?.status ?? "draft",
    // Settings that the admin tool keeps (a mastery line, pages a day) stay; only the draft's own id and format change.
    config: { ...old?.config, ...rows.level.config },
  };
  const byId = (row: { id?: string }) => String(row.id);
  return {
    write: {
      expected: current.version,
      level,
      topics: planItems(current.topics, rows.topics, byId, false, counts, KEPT_FIELDS.topics),
      sheets: planItems(current.sheets, rows.sheets, (row) => String(row.sheet_id), true, counts),
      questions: planItems(current.questions, rows.questions, byId, true, counts),
      scenarios: planItems(current.scenarios, rows.scenarios, byId, true, counts, KEPT_FIELDS.scenarios),
      regionPacks: planItems(current.regionPacks, rows.regionPacks, byId, true, counts, KEPT_FIELDS.regionPacks),
    },
    counts,
  };
}

/** Checks the draft, then writes it in one step. A draft with any problem writes nothing. */
export async function importDraft(draft: unknown, store: BankStore): Promise<ImportResult> {
  const checked = checkDraft(draft);
  if (!checked.ok) return checked;
  const current = await store.readLevel(checked.rows.level.id);
  const { write, counts } = planImport(current, checked.rows);
  const written = await store.writeLevel(write);
  if (!written.ok) return { ok: false, problems: [written.problem] };
  return { ok: true, levelId: write.level.id, version: written.version, counts };
}

/**
 * Refuses a file inside a git repository or worktree: by its own path, and by the path its links lead to. A draft
 * holds private content and the code repository is public.
 */
export function assertOutsideGitRepo(filePath: string): void {
  const absolute = resolve(filePath);
  for (const place of [absolute, dirname(absolute)]) {
    const repo = findGitAncestor(place);
    if (repo) throw new Error(`Refusing the draft file ${absolute}: it is inside a git repository (${repo}). Keep draft files in a private folder outside every repository.`);
  }
}

/** Reads a draft file that is outside every git repository. */
export function readDraftFile(filePath: string): unknown {
  assertOutsideGitRepo(filePath);
  return JSON.parse(readFileSync(resolve(filePath), "utf8"));
}

/** The import command: the file check, then the import. */
export async function runBankImport(filePath: string, store: BankStore): Promise<ImportResult> {
  let draft: unknown;
  try {
    draft = readDraftFile(filePath);
  } catch (cause) {
    return { ok: false, problems: [cause instanceof Error ? cause.message : String(cause)] };
  }
  return importDraft(draft, store);
}

export function formatImport(result: ImportResult): string {
  if (!result.ok) return `The draft was not imported. Nothing was written.\n${result.problems.map((p) => `- ${p}`).join("\n")}`;
  const { added, changed, unchanged, retired } = result.counts;
  return `Imported level ${result.levelId}: ${added} added, ${changed} changed, ${unchanged} unchanged, ${retired} retired.`;
}
