export interface EditProgress {
  id: string;
  revision: number;
  status: "queued" | "running" | "done" | "failed";
  phase: "waiting" | "working" | "retrying" | "stalled" | "saving" | "done" | "failed";
  total: number;
  checked: number;
  ready: number;
  failed: number;
  heartbeatAt: string;
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/** A completed error is checked, not ready. A saved response alone is not a completed page. */
export function workbookEditProgress(row: {
  id: string; base_revision: number; status: string; heartbeat_at: string; checkpoints: unknown; frame: unknown;
}, comments: readonly { batch_id: string | null; page_number: number }[], now: number): EditProgress {
  if (!["queued", "running", "done", "failed"].includes(row.status) || !positive(row.base_revision)
    || !Number.isFinite(now) || !Number.isFinite(Date.parse(row.heartbeat_at)) || !object(row.checkpoints)) {
    throw new Error("edit_progress_shape");
  }
  const pages = [...new Set(comments.filter(c => c.batch_id === row.id).map(c => c.page_number))];
  if (pages.some(n => !positive(n)) || pages.length > 500) throw new Error("edit_progress_pages");
  let ready = 0, failed = 0;
  for (const number of pages) {
    const saved = row.checkpoints[String(number)];
    if (!object(saved) || saved.number !== number) continue;
    if (typeof saved.error === "string" && saved.error.length > 0) failed++;
    else if (object(saved.page) && saved.page.number === number && object(saved.image) && saved.image.number === number) ready++;
  }
  const status = row.status as EditProgress["status"];
  const checked = ready + failed;
  const active = status === "queued" || status === "running";
  const phase: EditProgress["phase"] = !active ? status
    : Date.parse(row.heartbeat_at) + 6 * 60_000 <= now ? "stalled"
    : status === "queued" ? row.frame !== null || checked > 0 ? "retrying" : "waiting"
    : pages.length > 0 && checked === pages.length ? "saving" : "working";
  return { id: row.id, revision: row.base_revision, status, phase, total: pages.length, checked, ready, failed, heartbeatAt: row.heartbeat_at };
}

/** Validate the small HTTP projection before it can change the review screen's active state. */
export function readEditProgress(value: unknown): EditProgress | null {
  if (!object(value) || !Object.hasOwn(value, "batch")) throw new Error("edit_progress_response");
  const p = value.batch;
  if (p === null) return null;
  if (!object(p) || typeof p.id !== "string" || !p.id || !positive(p.revision)
    || !["queued", "running", "done", "failed"].includes(String(p.status))
    || !["waiting", "working", "retrying", "stalled", "saving", "done", "failed"].includes(String(p.phase))
    || typeof p.heartbeatAt !== "string" || !Number.isFinite(Date.parse(p.heartbeatAt))
    || [p.total, p.checked, p.ready, p.failed].some(n => typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > 500)
    || Number(p.checked) !== Number(p.ready) + Number(p.failed) || Number(p.checked) > Number(p.total)
    || (["done", "failed"].includes(String(p.status)) ? p.phase !== p.status : ["done", "failed"].includes(String(p.phase)))) {
    throw new Error("edit_progress_response");
  }
  return { id: p.id, revision: p.revision, status: p.status as EditProgress["status"], phase: p.phase as EditProgress["phase"],
    total: Number(p.total), checked: Number(p.checked), ready: Number(p.ready), failed: Number(p.failed), heartbeatAt: p.heartbeatAt };
}

/** A new read starts only after the previous read ends and its delay expires. Errors use a 30-second delay. */
export function watchWorkbookEditProgress(options: {
  read(signal: AbortSignal): Promise<unknown>;
  update(progress: EditProgress | null): boolean;
  unavailable(): void;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const turn = async () => {
    let delay = 5_000;
    try {
      const next = readEditProgress(await options.read(controller.signal));
      if (controller.signal.aborted || !options.update(next)) return;
    } catch {
      if (controller.signal.aborted) return;
      options.unavailable(); delay = 30_000;
    }
    if (!controller.signal.aborted) timer = setTimeout(() => { void turn(); }, delay);
  };
  timer = setTimeout(() => { void turn(); }, 1_000);
  return () => { controller.abort(); clearTimeout(timer); };
}
