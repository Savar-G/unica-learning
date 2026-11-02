import type { Json } from "@/lib/database.types";
import type { AiClient } from "@/lib/ai-client";
import type { GeneratedWorkbook, GenerateInput, GenerateDeps } from "@/lib/workbook-generator";
import { reviseWorkbookPage, WriterPersistenceError } from "@/lib/workbook-generator";
import type { DraftRendering, RunActor, RunRunner, RunSolve } from "@/lib/workbook-job";
import type { RenderProblem } from "@/lib/workbook-render";

export interface ReviewComment {
  requestKey?: string;
  id: string; draftId: string; revision: number; page: number; question: number | null;
  x: number; y: number; note: string; item: unknown; actor: RunActor; createdAt: string;
  status: "pending" | "sent" | "done" | "failed" | "stale"; error: string | null;
  batchId: string | null; before: unknown; after: unknown;
}
export interface EditFrame { build: string | null; model: string | null; solveModel: string; }
export const EDIT_LEASE_MS = 6 * 60_000;

export interface WorkbookEdit {
  id: string; draftId: string; revision: number; runner: RunRunner;
  status: "queued" | "running" | "done" | "failed"; error: string | null; createdAt: string; lease: string | null; expiresAt?: string | null; stalled?: boolean;
}
export type EditResult = { status: "queued"; id: string } | { status: "refused"; reason: string };
export interface EditSnapshot {
  draft: GeneratedWorkbook; rendering: DraftRendering | null; problems: RenderProblem[]; revision: number; input: GenerateInput; parentId: string;
}
export interface EditCheckpoint { number: number; responses?: Json[]; page?: GeneratedWorkbook["pages"][number]; image?: DraftRendering["pages"][number]; error?: string; solves?: RunSolve[] }
export interface WorkbookEditStore {
  frame(id: string, lease: string, frame: EditFrame): Promise<EditFrame | null>;
  checkpoints(id: string): Promise<EditCheckpoint[]>;
  checkpoint(id: string, lease: string, result: EditCheckpoint): Promise<boolean>;
  release(id: string, lease: string): Promise<boolean>;
  claim(id: string, lease: string, runner: RunRunner): Promise<WorkbookEdit | null>;
  comments(batchId: string): Promise<ReviewComment[]>;
  load(draftId: string): Promise<EditSnapshot | null>;
  finish(id: string, lease: string, result: { draft: GeneratedWorkbook; rendering: DraftRendering; problems: RenderProblem[] } | { error: string; problems?: RenderProblem[]; pending?: boolean }): Promise<{ status: "done"; revision: number } | { status: "refused"; reason: string }>;
}
export interface EditJobDeps {
  build?: string | null;
  store: WorkbookEditStore; runner: RunRunner; newId(): string;
  generation: Omit<GenerateDeps, "ai"> & { ai: AiClient | null };
  renderPage(snapshot: EditSnapshot, draft: GeneratedWorkbook, page: number): Promise<{ page: DraftRendering["pages"][number]; paths: string[] }>;
  assemble(snapshot: EditSnapshot, pages: DraftRendering["pages"]): Promise<{ pdfPath: string; paths: string[] }>;
  remove(paths: string[]): Promise<void>;
  shouldYield?(): boolean;
  handOff?(id: string): Promise<void>;
}

/** One request per changed page, plus at most 5 retries on failure across the helper and providers.
 * The helper allows 2 calls. Each can try the subscription once and the API twice, including its transport retry.
 * Completed responses are saved before checks and rendering. */
export async function runWorkbookEdit(id: string, deps: EditJobDeps): Promise<"done" | "failed" | "not-claimed" | "handed-on"> {
  const lease = deps.newId();
  const edit = await deps.store.claim(id, lease, deps.runner);
  if (!edit) return "not-claimed";
  const paths: string[] = [];
  const failures: RenderProblem[] = [];
  try {
    const frame = { build: deps.build ?? null, model: deps.generation.ai?.model ?? null, solveModel: deps.generation.solver.model };
    const savedFrame = await deps.store.frame(id, lease, frame);
    if (!savedFrame) return "not-claimed";
    if (savedFrame.build !== frame.build || savedFrame.model !== frame.model || savedFrame.solveModel !== frame.solveModel) {
      await deps.store.finish(id, lease, { error: "The code or model changed. Try again to start a new edit.", pending: true });
      return "failed";
    }
    const snapshot = await deps.store.load(edit.draftId);
    if (!snapshot || snapshot.revision !== edit.revision) throw new Error("This workbook changed. Reload the page.");
    const comments = await deps.store.comments(id);
    const groups = new Map<number, ReviewComment[]>();
    for (const c of comments) groups.set(c.page, [...groups.get(c.page) ?? [], c]);
    let draft = structuredClone(snapshot.draft);
    const images = new Map(snapshot.rendering?.pages.map((p) => [p.number, p]) ?? []);
    const kept = new Map((await deps.store.checkpoints(id)).map((p) => [p.number, p]));
    let changed = 0;
    for (const [number, group] of groups) {
      const checkpoint = kept.get(number);
      if (checkpoint?.error || (checkpoint?.page && checkpoint.image)) {
        if (checkpoint.error) failures.push({ page: number, question: null, reason: checkpoint.error });
        else if (checkpoint.page && checkpoint.image) { draft.pages = draft.pages.map((p) => p.number === number ? checkpoint.page! : p); images.set(number, checkpoint.image); changed++; }
        continue;
      }
      if (deps.shouldYield?.() && deps.handOff) {
        if (await deps.store.release(id, lease)) await deps.handOff(id);
        return "handed-on";
      }
      let result: EditCheckpoint;
      try {
        const page = draft.pages.find((p) => p.number === number);
        if (!page) throw new Error("This page no longer exists. Select a new location.");
        if (group.some((c) => c.question !== null && !page.questions.some((q) => q.number === c.question))) throw new Error("A question no longer exists. Select a new location.");
        if (!deps.generation.ai) throw new Error("The AI is unavailable.");
        const solves: RunSolve[] = [];
        const responses = checkpoint?.responses ?? [];
        const writerResponses = {
          load: async () => responses,
          async save(response: unknown) {
            const value: Json = JSON.parse(JSON.stringify(response));
            const next = [...responses, value];
            if (!await deps.store.checkpoint(id, lease, { number, responses: next })) throw new Error("This edit stopped. Try again.");
            responses.push(value);
          },
        };
        const next = await reviseWorkbookPage(snapshot.input, { ...deps.generation, ai: deps.generation.ai, writerResponses, onSolve(log) {
          deps.generation.onSolve?.(log);
          solves.push({ questionId: log.id, model: log.model, verdict: log.verdict.status, ms: log.ms, usd: null,
            log: { questions: log.questions, key: log.key, verdict: log.verdict, answers: JSON.stringify(log.answers) } });
        } }, page, {
          question: group.some((c) => c.question === null) ? null : [...new Set(group.map((c) => c.question!))],
          note: group.map((c) => `${c.question === null ? "Whole page" : `Question ${c.question}`}: ${c.note}`).join("\n"),
          items: Object.fromEntries(group.filter((c) => c.item && c.question !== null).map((c) => [c.question!, c.item])),
        });
        const candidate = { ...draft, pages: draft.pages.map((p) => p.number === number ? next : p) };
        const rendered = await deps.renderPage(snapshot, candidate, number);
        images.set(number, rendered.page); draft = candidate; changed++;
        result = { number, page: next, image: rendered.page, solves };
      } catch (e) { if (e instanceof WriterPersistenceError) { await deps.store.release(id, lease).catch(() => false); return "failed"; } const reason = e instanceof Error ? e.message : String(e); failures.push({ page: number, question: null, reason }); result = { number, error: reason }; }
      // An uncertain checkpoint can be read by another holder. Keep its image until that outcome is known.
      try { if (!await deps.store.checkpoint(id, lease, result)) return "not-claimed"; }
      catch { await deps.store.release(id, lease).catch(() => false); return "failed"; }
    }
    if (!changed) throw new Error("No comments could be applied. The previous version is unchanged.");
    const qs = draft.pages.flatMap((p) => p.questions);
    draft.counts = { pages: draft.pages.length, questions: qs.length, checked: qs.filter((q) => q.check.status === "checked").length,
      notChecked: qs.filter((q) => q.check.status === "not-checked").length, failed: qs.filter((q) => q.check.status === "failed").length,
      failedPages: draft.pages.filter((p) => p.fit.status === "failed").length };
    const pages = draft.pages.map((p) => { const image = images.get(p.number); if (!image) throw new Error("A saved page image is unavailable."); return image; });
    const pdf = await deps.assemble(snapshot, pages); paths.push(...pdf.paths);
    let saved: Awaited<ReturnType<WorkbookEditStore["finish"]>>;
    try {
      saved = await deps.store.finish(id, lease, { draft, rendering: { pdfPath: pdf.pdfPath, pages }, problems: failures });
    } catch {
      // A lost response can follow a committed revision. Keep its files and let the stored batch settle the outcome.
      return "failed";
    }
    if (saved.status !== "done") { await deps.remove(paths); return "failed"; }
    return "done";
  } catch (e) {
    await deps.remove(paths).catch(() => undefined);
    await deps.store.finish(id, lease, { error: `The change failed. The previous version is unchanged. ${e instanceof Error ? e.message : String(e)}`, problems: failures });
    return "failed";
  }
}
