// Synthetic saved calls for local screenshots. No database, email, audio or model calls.
import { mayaCalls, recordView, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore } from "@/lib/maya-call-memory";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import type { CallListRow } from "@/lib/maya-call-server";

export async function reviewFixture() {
  const parentId = "11111111-1111-4111-8111-111111111111";
  const childId = "22222222-2222-4222-8222-222222222222";
  const assessmentId = "33333333-3333-4333-8333-333333333333";
  const store = memoryCallStore({ testFamilies: [parentId] });
  let now = Date.UTC(2026, 10, 2, 16);
  const seams: CallSeams = {
    store, history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }], tests: [{ id: assessmentId, childId }] })),
    rebuild: async () => true, model: () => ruleMayaModel(), isTestFamily: async () => true,
    alerts: { send: async () => {}, list: async () => [] }, clock: () => now,
    newId: () => "00000000-0000-4000-8000-000000000334", seed: () => 42,
  };
  const calls = mayaCalls(seams);
  const started = await calls.start({ kind: "admin_test", parentId, childId, childName: "Iris", startedBy: "fixture", package: {
    ...SAMPLE_PACKAGES["add-27-39"], id: `${assessmentId}:s1-4`, templateId: "2-add-2-digit", ref: { source: "assessment", assessmentId, questionId: "s1-4" },
  } });
  if (!started.ok) throw new Error(started.error);
  let result = started;
  for (const text of ["I don't know how to start.", "Okay.", "Is it 56?", "Can you help me?", "16", "66", "Because the ones made a ten, so I carried it.", "I wrote it."]) {
    now += 5000;
    const next = await calls.input(result.view.id, result.view.revision, { type: "child", text }, "Iris");
    if (!next.ok) throw new Error(next.error);
    result = next;
    if (result.view.status === "ended") break;
  }
  const record = store.rows()[0];
  const text = recordView(record)!;
  const voice = recordView({ ...record, mode: "voice", connectedSeconds: 38, speechToText: "speech-test-version", voice: "voice-test-version" })!;
  const base: CallListRow = {
    id: text.id, createdAt: text.createdAt, childId, childName: "Iris", questionText: text.questionText, status: text.status,
    model: text.model, outcome: text.outcome!.reason, assistance: text.outcome!.assistance, seconds: text.outcome!.seconds,
    learningEvent: true, mode: "text", connectedSeconds: null, mishearing: text.outcome!.mishearing,
    flag: null, safetySeverity: null, safetyFlag: false,
  };
  const rows: CallListRow[] = [
    { ...base, id: "00000000-0000-4000-8000-000000000331", flag: "safety_immediate", outcome: "safety", assistance: "hint", mode: "voice", createdAt: "2026-10-31T15:00:00Z" },
    { ...base, id: "00000000-0000-4000-8000-000000000332", flag: "safety_concern", outcome: "safety", assistance: "hint", createdAt: "2026-11-01T15:00:00Z" },
    { ...base, id: "00000000-0000-4000-8000-000000000333", flag: "unsafe_request", mode: "voice", createdAt: "2026-11-02T15:00:00Z" },
    base,
  ];
  return { text, voice, rows, record };
}
