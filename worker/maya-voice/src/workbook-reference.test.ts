import { initializeLogger } from "@livekit/agents";
import { expect, it } from "vitest";
import { FakeSpeech, FakeSTT } from "./fake-providers";
import { readWorkbookReference } from "./workbook-reference";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";
import { selectWorkbookQuestion } from "@/lib/maya-workbook-question";

initializeLogger({ pretty: false, level: "silent" });
async function ready(speech: FakeSpeech) {
  const deadline = Date.now() + 1000;
  while (!speech.listening && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
  expect(speech.listening).toBe(true);
}

it("carries final fake speech through reference selection before a voice session exists", async () => {
  const f = await mayaWorkbookFixture();
  const speech = new FakeSpeech();
  const stream = new FakeSTT(speech).stream();
  let received: unknown;
  let finish!: () => void;
  const complete = new Promise<void>(resolve => { finish = resolve; });
  const reading = readWorkbookReference(stream, async text => {
    received = await selectWorkbookQuestion({ childId: f.ids.child, workbookId: f.ids.workbook, reference: text }, f.reader);
    finish();
  });
  try {
    await ready(speech);
    expect(speech.say("page four, number three")).toBe(true);
    await complete;
    expect(received).toMatchObject({ ok: true, ref: { source: "workbook", page: 4, question: 3 } });
    expect(f.store.rows()).toEqual([]);
  } finally { stream.close(); await reading; }
});

it.each([{ confidence: 0.3 }, { alternatives: ["page four number one"] }])("asks again for uncertain or competing speech: %j", async options => {
  const speech = new FakeSpeech(), stream = new FakeSTT(speech).stream();
  let text: string | undefined;
  let finish!: () => void;
  const complete = new Promise<void>(resolve => { finish = resolve; });
  const reading = readWorkbookReference(stream, async value => { text = value; finish(); });
  try { await ready(speech); expect(speech.say("page four number three", options)).toBe(true); await complete; expect(text).toBe(""); }
  finally { stream.close(); await reading; }
});
