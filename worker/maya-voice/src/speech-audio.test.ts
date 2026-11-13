import { ReadableStream } from "node:stream/web";
import { AudioFrame } from "@livekit/rtc-node";
import { USERDATA_TIMED_TRANSCRIPT, voice } from "@livekit/agents";
import { describe, expect, it, vi } from "vitest";
import { boardPaths, type Batch } from "@/lib/board";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech } from "@/lib/board-speech";
import { boardAudio, countedSynthesis } from "./speech-audio";

it("maps spoken number words to the accepted text before it releases a cue", async () => {
  const receiver = createBoardReceiver({ sessionId: "call" });
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: () => 0 });
  await board.connect();
  await board.stage("speech", [{ word: 2, batch: { transactionId: "sum", commands: [{ op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }] } }]);
  const scope = board.capture("speech")!;
  const text = new ReadableStream<string>({ start(c) { c.enqueue("Write 27."); c.close(); } });
  const audio = boardAudio(text, async () => new ReadableStream<AudioFrame>({ start(c) {
    const frame = new AudioFrame(new Int16Array(24000), 24000, 1, 24000);
    frame.userdata[USERDATA_TIMED_TRANSCRIPT] = [
      voice.createTimedString({ text: "Write ", endTime: 0.1 }),
      voice.createTimedString({ text: "twenty ", endTime: 0.2 }),
      voice.createTimedString({ text: "seven.", endTime: 0.3 }),
    ];
    c.enqueue(frame); c.close();
  } }), board, scope);
  for await (const frame of audio) void frame;
  await board.played(scope, 200);
  expect(boardPaths(receiver.scene())).toEqual([]);
  await board.played(scope, 300);
  expect(boardPaths(receiver.scene()).length).toBeGreaterThan(0);
});

const columns: Batch = { transactionId: 'columns', commands: [{ op: 'columns', id: 'sum', operation: 'add', operands: [{ id: 'top', value: '27' }, { id: 'bottom', value: '39' }], place: { region: 'main' } }] };
const inputText = (s: string) => new ReadableStream<string>({start(c){c.enqueue(s);c.close();}});
async function setup(word: number) {
 const receiver = createBoardReceiver({sessionId:'call'});
 const sender = createBoardSender({sessionId:'call',senderId:'worker',transport:createMemoryTransport(receiver)});
 const board = createBoardSpeech({sender,now:()=>0});
 await board.connect();
 await board.stage('speech',[{word,batch:columns}]);
 return {receiver,board,scope:board.capture("speech")!};
}
// R450-4 asked that empty TTS cancel its plan. Call 01f456de showed the cost: Maya's saved board holds the batch, so the
// next plan built on it was refused and the call ended. Empty TTS now shows the plan at once and ends it: no cue time
// releases anything later, and nothing stays staged.
it('R450-4 empty TTS shows its plan at once and ends it',async()=>{
 const c=await setup(1);
 const audio=boardAudio(inputText('Write.'),async()=>new ReadableStream<AudioFrame>({start(o){o.close();}}),c.board,c.scope);
 for await(const frame of audio) void frame;
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
 expect(c.receiver.staged()).toHaveLength(0);
 expect(c.board.owns(c.scope)).toBe(false);
});
it('R450 duplicated alignment chunks must not delay a later word to sentence end',async()=>{
 const c=await setup(2);
 const audio=boardAudio(inputText('Write 27 then wait.'),async()=>new ReadableStream<AudioFrame>({start(o){
  const f=new AudioFrame(new Int16Array(24000),24000,1,24000);
  f.userdata[USERDATA_TIMED_TRANSCRIPT]=[
   voice.createTimedString({text:'Write ',startTime:0,endTime:0.1}),
   voice.createTimedString({text:'Write ',startTime:0,endTime:0.1}),
   voice.createTimedString({text:'twenty seven ',startTime:0.1,endTime:0.3}),
   voice.createTimedString({text:'then ',startTime:0.3,endTime:0.5}),
   voice.createTimedString({text:'wait.',startTime:0.5,endTime:0.8}),
  ];o.enqueue(f);o.close();
 }}),c.board,c.scope);
 for await(const frame of audio) void frame;
 await c.board.played(c.scope,300);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});
it('R450 an out of order array must use the cue word end time',async()=>{
 const c=await setup(2);
 const audio=boardAudio(inputText('Write 27 then wait.'),async()=>new ReadableStream<AudioFrame>({start(o){
  const f=new AudioFrame(new Int16Array(24000),24000,1,24000);
  f.userdata[USERDATA_TIMED_TRANSCRIPT]=[
   voice.createTimedString({text:'twenty seven ',startTime:0.1,endTime:0.3}),
   voice.createTimedString({text:'Write ',startTime:0,endTime:0.1}),
   voice.createTimedString({text:'then ',startTime:0.3,endTime:0.5}),
   voice.createTimedString({text:'wait.',startTime:0.5,endTime:0.8}),
  ];o.enqueue(f);o.close();
 }}),c.board,c.scope);
 for await(const frame of audio) void frame;
 await c.board.played(c.scope,300);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});
async function synthFrame(times?: voice.TimedString[], durationMs=1000) {
 return new ReadableStream<AudioFrame>({start(o){
  const samples=24*durationMs;
  const f=new AudioFrame(new Int16Array(samples),24000,1,samples);
  if(times) f.userdata[USERDATA_TIMED_TRANSCRIPT]=times;
  o.enqueue(f);o.close();
 }});
}
it('positive: repeated words retain their ordinal cue',async()=>{
 const c=await setup(4);
 const audio=boardAudio(inputText('Write one plus one.'),async()=>synthFrame(['Write ','one ','plus ','one.'].map((s,i)=>voice.createTimedString({text:s,startTime:i/10,endTime:(i+1)/10}))),c.board,c.scope);
 for await(const frame of audio) void frame;
 await c.board.played(c.scope,300);
 expect(boardPaths(c.receiver.scene()).length).toBe(0);
 await c.board.played(c.scope,400);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});
it.each([true,false])('positive: missing timestamp suffix uses the sentence end, timestamps=%s',async timestamps=>{
 const c=await setup(3);
 const audio=boardAudio(inputText('Write one now.'),async()=>synthFrame(timestamps?[voice.createTimedString({text:'Write ',endTime:0.1})]:undefined),c.board,c.scope);
 for await(const frame of audio) void frame;
 await c.board.played(c.scope,999);
 expect(boardPaths(c.receiver.scene()).length).toBe(0);
 await c.board.played(c.scope,1000);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});
it('positive: a 201-word sentence releases its final cue only at the final word',async()=>{
 const c=await setup(201);
 const words=[...Array(200).fill('one '),'done.'];
 const audio=boardAudio(inputText(words.join('')),async()=>synthFrame(words.map((s,i)=>voice.createTimedString({text:s,startTime:i/100,endTime:(i+1)/100})),3000),c.board,c.scope);
 for await(const frame of audio) void frame;
 await c.board.played(c.scope,2000);
 expect(boardPaths(c.receiver.scene()).length).toBe(0);
 await c.board.played(c.scope,2010);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});

const input = () => new ReadableStream<string>({start(c){c.enqueue('Write.');c.close();}});
const batch = (id:string) => ({transactionId:id,commands:[{op:'write',id,text:'1',place:{region:'main'}}]});
async function raceSetup() {
 const receiver=createBoardReceiver({sessionId:'call',clock:()=>10000});
 const sender=createBoardSender({sessionId:'call',senderId:'worker',transport:createMemoryTransport(receiver)});
 const observe=vi.fn(async()=>{});
 const board=createBoardSpeech({sender,now:()=>10000,observe});
 await board.connect();
 await board.stage('old',[{word:1,batch:batch('old-batch')}]);
 return {receiver,sender,board,observe,scope:board.capture("old")!};
}

it.each(['synthesis','read'])('R450-7 cancelled old TTS must not cancel the next utterance, %s pending',async phase=>{
 const c=await raceSetup();
 let resolveSynthesis!:(s:ReadableStream<AudioFrame>)=>void;
 let started!:()=>void;
 const ready=new Promise<void>(r=>started=r);
 const oldAudio=boardAudio(input(),async()=>{
   started();
   if(phase==='synthesis') return await new Promise<ReadableStream<AudioFrame>>(r=>resolveSynthesis=r);
   return new ReadableStream<AudioFrame>();
 },c.board,c.scope);
 await ready;
 // Allow the adapter to take the current reader for the read-pending case.
 await new Promise<void>(r=>setImmediate(r));
 const cancelling=oldAudio.cancel();
 const stopping=c.board.interrupt(c.scope);
 const staging=c.board.stage('new',[{word:1,batch:batch('new-batch')}]);
 await Promise.all([cancelling,stopping,staging]);
 if(phase==='synthesis') resolveSynthesis(new ReadableStream({start(o){o.close();}}));
 await new Promise<void>(r=>setImmediate(r));
 await c.board.settled();
 expect(c.receiver.staged().map(b=>b.batchId)).toEqual(['new-batch']);
 const newScope = c.board.capture('new')!;
 await c.board.timing(newScope,1,100,'word');
 await c.board.played(newScope,100);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});

it.each(["null", "empty"] as const)("R450-7 late %s output cannot stop a replacement with the same utterance ID", async result => {
  const c = await raceSetup();
  let complete!: (stream: ReadableStream<AudioFrame> | null) => void;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const pending = new Promise<ReadableStream<AudioFrame> | null>(resolve => { complete = resolve; });
  const oldAudio = boardAudio(input(), async () => { entered(); return pending; }, c.board, c.scope);
  await ready;
  const oldScope = c.board.capture("old")!;
  await c.board.stage("old", [{ word: 1, batch: batch("replacement") }]);
  const newScope = c.board.capture("old")!;
  complete(result === "null" ? null : new ReadableStream<AudioFrame>({ start(c) { c.close(); } }));
  for await (const frame of oldAudio) void frame;
  // The public scoped stop must also refuse the earlier generation when its text ID is reused.
  await c.board.interrupt(oldScope);
  await c.board.settled();
  expect(c.receiver.staged().map(b => b.batchId)).toEqual(["replacement"]);
  await c.board.timing(newScope, 1, 100, "word");
  await c.board.played(newScope, 100);
  expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});

/** A sentence's audio that the test plays out: one frame, then the end only when `end` is called. */
function heldSentence() {
  let end = () => {};
  let cancelled = false;
  const stream = new ReadableStream<AudioFrame>({
    start(o) {
      o.enqueue(new AudioFrame(new Int16Array(2400), 24000, 1, 2400));
      end = () => { try { o.close(); } catch { /* already cancelled */ } };
    },
    cancel() { cancelled = true; },
  });
  return { stream, end: () => end(), get cancelled() { return cancelled; } };
}

it("synthesizes the next sentence while the current one plays, and reads them in order", async () => {
  const c = await setup(1);
  const made: string[] = [];
  const sentences: ReturnType<typeof heldSentence>[] = [];
  const audio = boardAudio(inputText("Write 27. Then add 39."), async (text) => {
    for await (const chunk of text) made.push(chunk);
    const s = heldSentence();
    sentences.push(s);
    return s.stream;
  }, c.board, c.scope);
  const reader = audio.getReader();
  // The first sentence's frame plays, and its end has not come: the second is already being made.
  await reader.read();
  await new Promise<void>(r => setImmediate(r));
  expect(made).toEqual(["Write 27.", "Then add 39."]);
  sentences[0].end();
  const second = await reader.read();
  expect(second.done).toBe(false);
  sentences[1].end();
  expect((await reader.read()).done).toBe(true);
});

it("a cut stream retires the sentence made ahead, so it is never read", async () => {
  const c = await setup(1);
  const sentences: ReturnType<typeof heldSentence>[] = [];
  const audio = boardAudio(inputText("Write 27. Then add 39."), async () => {
    const s = heldSentence();
    sentences.push(s);
    return s.stream;
  }, c.board, c.scope);
  const reader = audio.getReader();
  await reader.read();
  await new Promise<void>(r => setImmediate(r));
  expect(sentences).toHaveLength(2);
  await reader.cancel();
  await new Promise<void>(r => setImmediate(r));
  expect(sentences[1].cancelled).toBe(true);
});

it("plays nothing before the plan is on the receiver, and nothing at all when sending it failed", async () => {
  const receiver = createBoardReceiver({ sessionId: "call" });
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: () => 0 });
  await board.connect();
  // The plan's send does not answer until the test says so.
  let answer: (ok: boolean) => void = () => {};
  const send = sender.send.bind(sender);
  vi.spyOn(sender, "send").mockImplementation(async (b, o) => (await new Promise<boolean>(r => { answer = r; })) ? send(b, o) : Promise.reject(new Error("no answer")));
  const staging = board.stage("speech", [{ word: 1, batch: columns }]);
  void staging.catch(() => {});
  const scope = board.capture("speech")!;
  let made = 0;
  const audio = boardAudio(inputText("Write."), async () => { made++; return synthFrame(); }, board, scope);
  const reader = audio.getReader();
  let heard = false;
  const read = reader.read().then(r => { heard = !r.done; return r; });
  await new Promise<void>(r => setTimeout(r, 20));
  // The voice was asked already, and no frame came out.
  expect(made).toBe(1);
  expect(heard).toBe(false);
  answer(false);
  expect((await read).done).toBe(true);
  expect(heard).toBe(false);
  await expect(board.sent(scope)).rejects.toThrow();
});

// Math signs are spoken as words (docs/maya-voice.md "Math symbols are spoken as words"). These run boardAudio through
// countedSynthesis, as the agent's ttsNode does, with a fake provider that records the text it received and times the
// words it said.
describe("math is spoken as words", () => {
  const timed = (words: [string, number][]) => words.map(([text, end], i) =>
    voice.createTimedString({ text, startTime: i === 0 ? 0 : words[i - 1][1], endTime: end }));
  /** A provider that answers each sentence with 1 s of audio and the given word times (null: no word times). */
  function provider(times: (voice.TimedString[] | null)[]) {
    const received: string[] = [];
    const counted: string[] = [];
    const synthesize = (input: ReadableStream<string> | AsyncIterable<string>) => countedSynthesis(input, async (text) => {
      let said = "";
      for await (const chunk of text) said += chunk;
      const words = times[received.length];
      received.push(said);
      return new ReadableStream<AudioFrame>({ start(c) {
        const frame = new AudioFrame(new Int16Array(24000), 24000, 1, 24000);
        if (words) frame.userdata[USERDATA_TIMED_TRANSCRIPT] = words;
        c.enqueue(frame); c.close();
      } });
    }, (text) => counted.push(text));
    return { received, counted, synthesize };
  }
  const shown = (c: Awaited<ReturnType<typeof setup>>) => boardPaths(c.receiver.scene()).length > 0;

  it("sends 52 − 28 = 24 as words, and the cue on 24 fires when 24 is said", async () => {
    // Words: We're(1) doing(2) 52(3) −(4) 28(5) =(6) 24(7) today.(8)
    const c = await setup(7);
    const p = provider([timed([["We're ", 0.1], ["doing ", 0.2], ["52 ", 0.3], ["minus ", 0.4], ["28 ", 0.5], ["equals ", 0.6], ["24 ", 0.7], ["today.", 0.9]])]);
    for await (const frame of boardAudio(inputText("We're doing 52 − 28 = 24 today."), p.synthesize, c.board, c.scope)) void frame;
    expect(p.received).toEqual(["We're doing 52 minus 28 equals 24 today."]);
    // The voice is counted by what the provider received.
    expect(p.counted).toEqual(["We're doing 52 minus 28 equals 24 today."]);
    await c.board.played(c.scope, 699);
    expect(shown(c)).toBe(false);
    await c.board.played(c.scope, 700);
    expect(shown(c)).toBe(true);
  });

  it("finds a cue on a fraction in the provider's words for it", async () => {
    // Words: Shade(1) 3/4(2) of(3) the(4) bar(5) now.(6). "3/4" is said as "three quarters", which ends at 0.4 s.
    const c = await setup(2);
    const p = provider([timed([["Shade ", 0.1], ["three ", 0.2], ["quarters ", 0.4], ["of ", 0.5], ["the ", 0.6], ["bar ", 0.7], ["now.", 0.9]])]);
    for await (const frame of boardAudio(inputText("Shade 3/4 of the bar now."), p.synthesize, c.board, c.scope)) void frame;
    expect(p.received).toEqual(["Shade three quarters of the bar now."]);
    await c.board.played(c.scope, 200);
    expect(shown(c)).toBe(false);
    await c.board.played(c.scope, 399);
    expect(shown(c)).toBe(false);
    await c.board.played(c.scope, 400);
    expect(shown(c)).toBe(true);
  });

  it("keeps the word count of Maya's text across sentences when a word is said as several", async () => {
    // Words: Shade(1) 3/4.(2) Then(3) 2(4) 1/2(5) more.(6). The second sentence starts at 1 s; "1/2" ends at 1.5 s.
    const c = await setup(5);
    const p = provider([
      timed([["Shade ", 0.2], ["three ", 0.4], ["quarters.", 0.8]]),
      timed([["Then ", 0.1], ["two ", 0.2], ["and ", 0.3], ["one ", 0.4], ["half ", 0.5], ["more.", 0.7]]),
    ]);
    for await (const frame of boardAudio(inputText("Shade 3/4. Then 2 1/2 more."), p.synthesize, c.board, c.scope)) void frame;
    expect(p.received).toEqual(["Shade three quarters.", "Then two and one half more."]);
    expect(p.counted).toEqual(["Shade three quarters.", "Then two and one half more."]);
    await c.board.played(c.scope, 1499);
    expect(shown(c)).toBe(false);
    await c.board.played(c.scope, 1500);
    expect(shown(c)).toBe(true);
  });

  it("without word times, a cue on a fraction still fires at its sentence's audio end", async () => {
    const c = await setup(2);
    const p = provider([null]);
    for await (const frame of boardAudio(inputText("Shade 3/4 of the bar."), p.synthesize, c.board, c.scope)) void frame;
    expect(p.received).toEqual(["Shade three quarters of the bar."]);
    await c.board.played(c.scope, 999);
    expect(shown(c)).toBe(false);
    await c.board.played(c.scope, 1000);
    expect(shown(c)).toBe(true);
  });

  it("reads a sign with its number when a sentence break falls between them", async () => {
    // speechSentences splits "Find it: ? − 28 = 24." after the "?": the unknown and the minus are still read together.
    const c = await setup(1);
    const p = provider([null, null]);
    for await (const frame of boardAudio(inputText("Find it: ? − 28 = 24."), p.synthesize, c.board, c.scope)) void frame;
    expect(p.received).toEqual(["Find it: what", "minus 28 equals 24."]);
  });

  it("sends a line without a board as words too", async () => {
    const p = provider([null]);
    const out = await p.synthesize(inputText("Let's do 52 − 28. It is 25% of $4."));
    for await (const frame of out!) void frame;
    expect(p.received).toEqual(["Let's do 52 minus 28. It is 25 percent of 4 dollars."]);
    expect(p.counted).toEqual(["Let's do 52 minus 28. It is 25 percent of 4 dollars."]);
  });
});

// Call 01f456de (2026-11-13), from its stored trace: the clarify turn wrote the question (b1), and the next turn placed a
// note below b1's note (b2). b1's audio never came, so b1 was never released; the child's next words cancelled it, and
// the board core refused b2 ("no object to place this next to"), which ended the call.
const CALL = "01f456de-db1a-4d26-9633-63e4523649d7";
const b1: Batch = { transactionId: `${CALL}-b1`, commands: [
  { id: "question", op: "columns", place: { region: "main" }, operands: [{ id: "top", value: "52" }, { id: "bottom", value: "28" }], operation: "subtract" },
  { id: "note-1-0-question-problem", op: "write", text: "52 − 28", place: { below: "question" } },
] };
const b2: Batch = { transactionId: `${CALL}-b2`, commands: [{ id: "note-2-0-question-problem", op: "write", text: "52 − 28", place: { below: "note-1-0-question-problem" } }] };
describe("a speech that gives no audio (call 01f456de)", () => {
  async function call01f456de(tts: () => Promise<ReadableStream<AudioFrame> | null>) {
    const receiver = createBoardReceiver({ sessionId: "call" });
    const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport: createMemoryTransport(receiver) });
    const board = createBoardSpeech({ sender, now: () => 0 });
    await board.connect();
    await board.stage("clarify", [{ word: 6, batch: b1 }]);
    const clarify = board.capture("clarify")!;
    const silent = vi.fn();
    const audio = boardAudio(inputText("Let's look at 52 − 28 together."), tts, board, clarify, silent);
    try { for await (const frame of audio) void frame; } catch { /* the voice failed */ }
    // The child talks: the worker stops the plan it holds (agent.ts `stopBoard`).
    await board.interrupt(clarify);
    await board.settled();
    return { receiver, board, silent, next: board.stage("try", [{ word: 3, batch: b2 }]) };
  }
  it.each([
    ["an empty stream", async (): Promise<ReadableStream<AudioFrame> | null> => new ReadableStream<AudioFrame>({ start(o) { o.close(); } })],
    ["no stream", async (): Promise<ReadableStream<AudioFrame> | null> => null],
    ["a voice that fails", async (): Promise<ReadableStream<AudioFrame> | null> => new ReadableStream<AudioFrame>({ start(o) { o.error(new Error("TTS task failed")); } })],
  ] as const)("shows its batches, so the next plan built on them stages: %s", async (_name, tts) => {
    const c = await call01f456de(tts);
    await expect(c.next).resolves.toEqual({ refused: [] });
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch").map(e => e.batchId)).toEqual([b1.transactionId]);
    expect(c.receiver.staged().map(s => s.batchId)).toEqual([b2.transactionId]);
    expect(c.silent).toHaveBeenCalledWith(expect.objectContaining({ heardAny: false, text: "Let's look at 52 − 28 together." }));
  });
});
