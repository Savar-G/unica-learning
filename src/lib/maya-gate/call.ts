// The safety behaviours of the gate (#395), run through the saved call: Maya's call module (src/lib/maya-call.ts) on the
// same text adapter and scripted model, with the in-memory call store, the in-memory alert ledger and the in-memory mail
// transport, as src/lib/maya-call-safety.test.ts runs them. So the gate sees what the text adapter alone cannot: the
// call's stored flag and its internal alert to the team (#333). No network and no email.
//
// This file imports the alert module, which is server only: a test that imports it mocks "server-only".
import { memoryWordingHistoryStore } from "@/lib/maya";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { mayaCalls, type CallAlerts, type CallResult } from "@/lib/maya-call";
import { callAlerts } from "@/lib/maya-call-alert";
import { memoryAlertLedger } from "@/lib/maya-call-alert-memory";
import { memoryCallStore } from "@/lib/maya-call-memory";
import type { TalkReviewer } from "@/lib/maya-talk-review";
import {
  callKey, CHILD_MS, GATE_T0, judge, memoryTraceStore, packageOf, runBehaviour, runsOnCall, scenarioModel, scriptedReviewer,
  type Behaviour, type SavedCall, type ScenarioModel, type TraceStore, type Verdict,
} from "./gate";

const PARENT = "gate-parent";
const CHILD = "gate-child";

export interface CallRunOptions {
  model?: ScenarioModel;
  seed?: number;
  reviewer?: TalkReviewer;
  /** Replaces the alerts seam (a broken one in a test). */
  alerts?: CallAlerts;
}

/**
 * Runs one behaviour through the saved call and saves its trace (at the behaviour's id) and its call (at `callKey`):
 * its status, outcome, flag and alerts before cleanup, and the alerts after one more request (the "end" an admin sends
 * on an ended call, which sends a refused alert again). Cleanup can end a live call but cannot change the saved result.
 */
export async function runCallBehaviour(b: Behaviour, store: TraceStore, options: CallRunOptions = {}): Promise<{ error: unknown }> {
  let now = GATE_T0;
  let n = 0;
  const model = options.model ?? scenarioModel();
  const calls$ = memoryCallStore({ testFamilies: [PARENT] });
  const mail = memoryTransport();
  if (b.alert) mail.answerNext(b.alert);
  const ledger = memoryAlertLedger({ now: () => now });
  const tests = [{ id: "behaviour-gate", childId: CHILD }];
  const calls = mayaCalls({
    store: calls$,
    history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests })),
    rebuild: async () => true,
    model: (id) => (id === null || id === model.id ? model : null),
    reviewer: () => options.reviewer ?? scriptedReviewer(b),
    isTestFamily: async (parentId) => parentId === PARENT,
    alerts: options.alerts ?? callAlerts({ ledger, to: "team@example.test", origin: "https://example.test", transport: mail.transport }),
    clock: () => now,
    newId: () => (n++ === 0 ? `gate-${b.id}` : `gate-${b.id}-${n}`),
    seed: () => options.seed ?? 1,
  });
  // Set inside `ok`, so the type is given here: a plain `= null` would narrow it to null below.
  let last = null as Extract<CallResult, { ok: true }> | null;
  const ok = (r: CallResult) => {
    if (!r.ok) throw new Error(`the call refused the input: ${r.error}`);
    return (last = r);
  };
  const send = async (input: Parameters<typeof calls.input>[2]) => ok(await calls.input(last!.view.id, last!.view.revision, input, null));
  let error: unknown = null;
  try {
    model.next(b.open ?? [], undefined);
    ok(await calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: null, package: packageOf(b), startedBy: "gate" }));
    for (const s of b.steps) {
      if (last!.view.status === "ended") break;
      if ("technical" in s) throw new Error("a call run has no technical event");
      if ("child" in s) {
        if (s.uncertain || s.alternatives) throw new Error("a call run has no uncertain speech");
        now += CHILD_MS;
        model.next(s.maya ?? [], s.read);
        await send({ type: "child", text: s.child });
      } else if ("wait" in s) {
        now += s.wait * 1000;
        model.next(s.maya ?? [], undefined);
        await send({ type: "tick" });
      } else if ("write" in s) {
        now += 1000;
        model.next(s.maya ?? [], undefined);
        await send({ type: "writing", status: s.write });
      } else {
        now = Math.max(now, GATE_T0 + s.at * 1000);
        model.next(s.maya ?? [], undefined);
        await send({ type: "tick" });
      }
    }
  } catch (e) {
    error = e;
  } finally {
    try {
      // Read the persisted result before any cleanup request. A synthetic end must never prove that safety ended it.
      const before = calls$.rows()[0];
      const beforeCleanup: SavedCall["beforeCleanup"] = { status: before?.status ?? null, outcome: before?.outcome ?? null };
      const flag = before?.flag ?? null;
      const alerts = last?.view.alerts ?? [];
      if (last && last.view.status === "live") await send({ type: "end" });
      if (last) {
        // The call's next request: "end" on the ended call.
        now += CHILD_MS;
        const next = await send({ type: "end" });
        const record = calls$.rows()[0];
        if (record?.trace) store.save(b.id, JSON.stringify(record.trace));
        const call: SavedCall = { beforeCleanup, flag, alerts, next: next.view.alerts, emails: mail.delivered.length };
        store.save(callKey(b.id), JSON.stringify(call));
      }
    } catch (e) {
      error ??= e;
    }
  }
  return { error };
}

/** Runs a behaviour the way the gate does: through the saved call when it expects a flag, else through the text adapter. */
export const runGateBehaviour = (b: Behaviour, store: TraceStore, options: CallRunOptions = {}) =>
  runsOnCall(b) ? runCallBehaviour(b, store, options) : runBehaviour(b, store, options);

/** Judges a behaviour from what its run saved: the trace, and a call run's call. */
export const judgeSaved = (b: Behaviour, store: TraceStore): Verdict => judge(b, store.load(b.id), store.load(callKey(b.id)));

/** Runs every behaviour and judges each from what it saved. */
export async function runGate(behaviours: readonly Behaviour[], store: TraceStore = memoryTraceStore()): Promise<Verdict[]> {
  for (const b of behaviours) await runGateBehaviour(b, store);
  return behaviours.map((b) => judgeSaved(b, store));
}
