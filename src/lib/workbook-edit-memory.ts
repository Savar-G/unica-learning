import type { EditSnapshot, ReviewComment, WorkbookEdit, WorkbookEditStore, EditResult, EditCheckpoint } from "@/lib/workbook-edit";
import type { RunRunner } from "@/lib/workbook-job";

/** In-memory review store. All mutations use the same revision and active-batch checks as the database. */
export function memoryWorkbookReview(snapshot: EditSnapshot, options: { status?: "draft" | "approved" | "printed" | "shipped" } = {}) {
  const copy = (s: EditSnapshot): EditSnapshot => ({ ...structuredClone({ ...s, input: undefined }), input: s.input });
  let current = copy(snapshot), status = options.status ?? "draft", serial = 0;
  const comments: ReviewComment[] = [], batches = new Map<string, WorkbookEdit>();
  const revisions: EditSnapshot[] = [copy(snapshot)];
  const active = () => [...batches.values()].some((b) => b.status === "queued" || b.status === "running");
  const locked = () => status === "printed" || status === "shipped";
  const refused = (reason: string): { status: "refused"; reason: string } => ({ status: "refused", reason });
  const checkpoints = new Map<string, Map<number, EditCheckpoint>>();
  const store: WorkbookEditStore = {
    async checkpoints(id) { return structuredClone([...(checkpoints.get(id)?.values() ?? [])]); },
    async checkpoint(id, lease, result) {
      const b=batches.get(id); if(b?.lease!==lease || b.status!=="running") return false;
      const all=checkpoints.get(id) ?? new Map<number,EditCheckpoint>(); all.set(result.number,structuredClone(result));checkpoints.set(id,all);return true;
    },
    async release(id, lease) { const b=batches.get(id);if(b?.lease!==lease || b.status!=="running")return false;b.status="queued";b.lease=null;return true; },
    async claim(id, lease, runner) {
      const b = batches.get(id);
      if (!b || b.status !== "queued" || b.runner !== runner) return null;
      b.status = "running"; b.lease = lease; return structuredClone(b);
    },
    async comments(id) { return structuredClone(comments.filter((c) => c.batchId === id && c.status === "sent")); },
    async load() { return copy(current); },
    async finish(id, lease, result) {
      const b = batches.get(id);
      if (!b || b.status !== "running" || b.lease !== lease) return refused("This edit stopped. Reload the page.");
      if (locked() || b.revision !== current.revision) result = { error: "This workbook changed. Reload the page." };
      if ("error" in result) {
        b.status = "failed"; b.error = result.error;
        for (const c of comments.filter((c) => c.batchId === id && c.status === "sent")) {
          c.status = "failed"; c.error = result.problems?.find((p) => p.page === c.page)?.reason ?? result.error;
        }
        return refused(result.error);
      }
      const before = current;
      current = { ...current, draft: structuredClone(result.draft), rendering: structuredClone(result.rendering), revision: current.revision + 1 };
      revisions.push(copy(current)); b.status = "done"; status = "draft";
      for (const c of comments.filter((c) => c.batchId === id && c.status === "sent")) {
        c.error = result.problems.find((p) => p.page === c.page)?.reason ?? null;
        c.status = c.error ? "failed" : "done";
        const bpage = before.draft.pages.find((p) => p.number === c.page), apage = current.draft.pages.find((p) => p.number === c.page);
        c.before = c.question === null ? bpage : bpage?.questions.find((q) => q.number === c.question);
        c.after = c.question === null ? apage : apage?.questions.find((q) => q.number === c.question);
      }
      for (const c of comments.filter((c) => ["pending", "failed", "stale"].includes(c.status))) {
        c.revision = current.revision;
        if (!current.draft.pages.some((p) => p.number === c.page && (c.question === null || p.questions.some((q) => q.number === c.question)))) c.status = "stale";
      }
      return { status: "done", revision: current.revision };
    },
  };
  return { store, comments, batches, revisions, snapshot: () => copy(current), status: () => status,
    save(comment: Omit<ReviewComment, "id" | "status" | "error" | "before" | "after" | "batchId">) {
      if (locked()) return refused("This workbook is printed or shipped. It cannot change.");
      if (comment.revision !== current.revision) return refused("This workbook changed. Reload the page.");
      comments.push({ ...structuredClone(comment), id: `comment-${++serial}`, status: "pending", error: null, before: null, after: null, batchId: null });
      return { status: "saved" };
    },
    send(revision: number, runner: RunRunner): EditResult {
      if (locked()) return refused("This workbook is printed or shipped. It cannot change.");
      if (revision !== current.revision || active()) return refused("This workbook changed or has an edit in progress. Reload the page.");
      const pending = comments.filter((c) => c.status === "pending" || c.status === "failed");
      if (!pending.length) return refused("Add a comment first.");
      const id = `batch-${++serial}`;
      batches.set(id, { id, draftId: current.draft.id, revision, runner, status: "queued", error: null, createdAt: "2026-11-01T20:00:00Z", lease: null });
      for (const c of pending) { c.batchId = id; c.status = "sent"; }
      return { status: "queued", id };
    },
  };
}
