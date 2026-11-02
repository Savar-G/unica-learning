import { createHash } from "node:crypto";
import { WriterPersistenceError } from "@/lib/workbook-generator";
import type { Json } from "@/lib/database.types";

/** Five total dispatches, including the first call and uncertain outcomes. No hidden provider retries. */
export const EDIT_CALL_LIMIT = 5;
export const EDIT_CALL_LIMIT_REASON = "The AI call limit of 5 was reached. Edit the comment and try again.";
export class EditCallLimitError extends WriterPersistenceError {}
export interface EditCallKey { page: number; question: string; kind: "write" | "solve"; hash: string }
export type EditCallReservation = { status: "saved"; result: Json } | { status: "dispatch"; attempt: number } | { status: "limit" } | { status: "stopped" };
export interface EditCallStore {
  reserveCall(id: string, lease: string, key: EditCallKey): Promise<EditCallReservation>;
  completeCall(id: string, lease: string, key: EditCallKey, attempt: number, result: Json): Promise<boolean>;
}
export type EditCall = <T>(kind: "write" | "solve", question: string, request: unknown, dispatch: () => Promise<T>) => Promise<T>;

type CallOutcome<T> = { value: T } | { error: string };
function readOutcome<T>(outcome: CallOutcome<T>): T {
  if ("error" in outcome) throw new Error(outcome.error);
  return outcome.value;
}

/** One instance per page and execution. The sequence distinguishes deliberate writer retries from recovery. */
export function editCalls(store: EditCallStore, id: string, lease: string, page: number, frame: unknown): EditCall {
  const sequences = new Map<string, number>();
  return async <T>(kind: "write" | "solve", question: string, request: unknown, dispatch: () => Promise<T>): Promise<T> => {
    const scope = `${kind}:${question}`;
    const sequence = (sequences.get(scope) ?? 0) + 1;
    sequences.set(scope, sequence);
    const hash = createHash("sha256").update(JSON.stringify({ frame, sequence, request })).digest("hex");
    const key = { page, question, kind, hash };
    let row: EditCallReservation;
    try { row = await store.reserveCall(id, lease, key); }
    catch (e) { throw new WriterPersistenceError(String(e)); }
    if (row.status === "limit") throw new EditCallLimitError(EDIT_CALL_LIMIT_REASON);
    if (row.status === "stopped") throw new WriterPersistenceError("This edit stopped. Try again.");
    if (row.status === "saved") return readOutcome(row.result as CallOutcome<T>);
    // Replay observed failures too, so recovery reaches the same saved retry sequence.
    // A process crash without a saved outcome still spends its reserved attempt.
    let outcome: CallOutcome<T>;
    try { outcome = { value: await dispatch() }; }
    catch (e) {
      if (e instanceof WriterPersistenceError) throw e;
      outcome = { error: e instanceof Error ? e.message : String(e) };
    }
    const saved: Json = JSON.parse(JSON.stringify(outcome));
    // Retry storage of this result. Never retry the AI because storage failed.
    for (let retry = 0; retry < 3; retry++) {
      try {
        if (!await store.completeCall(id, lease, key, row.attempt, saved)) throw new Error("This edit stopped. Try again.");
        break;
      } catch (e) {
        if (retry === 2) throw new WriterPersistenceError(String(e));
      }
    }
    return readOutcome(outcome);
  };
}
