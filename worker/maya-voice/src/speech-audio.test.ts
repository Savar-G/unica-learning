import { ReadableStream } from "node:stream/web";
import { AudioFrame } from "@livekit/rtc-node";
import { USERDATA_TIMED_TRANSCRIPT, voice } from "@livekit/agents";
import { expect, it } from "vitest";
import { boardPaths, type Batch } from "@/lib/board";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech } from "@/lib/board-speech";
import { boardAudio } from "./speech-audio";

it("maps spoken number words to the accepted text before it releases a cue", async () => {
  const receiver = createBoardReceiver({ sessionId: "call" });
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: () => 0 });
  await board.reconnect();
  await board.stage("speech", [{ word: 2, batch: { transactionId: "sum", commands: [{ op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }] } }]);
  const text = new ReadableStream<string>({ start(c) { c.enqueue("Write 27."); c.close(); } });
  const audio = boardAudio(text, async () => new ReadableStream<AudioFrame>({ start(c) {
    const frame = new AudioFrame(new Int16Array(24000), 24000, 1, 24000);
    frame.userdata[USERDATA_TIMED_TRANSCRIPT] = [
      voice.createTimedString({ text: "Write ", endTime: 0.1 }),
      voice.createTimedString({ text: "twenty ", endTime: 0.2 }),
      voice.createTimedString({ text: "seven.", endTime: 0.3 }),
    ];
    c.enqueue(frame); c.close();
  } }), board, "speech");
  for await (const frame of audio) void frame;
  await board.played("speech", 200);
  expect(boardPaths(receiver.scene())).toEqual([]);
  await board.played("speech", 300);
  expect(boardPaths(receiver.scene()).length).toBeGreaterThan(0);
});

const columns: Batch = { transactionId: 'columns', commands: [{ op: 'columns', id: 'sum', operation: 'add', operands: [{ id: 'top', value: '27' }, { id: 'bottom', value: '39' }], place: { region: 'main' } }] };
const inputText = (s: string) => new ReadableStream<string>({start(c){c.enqueue(s);c.close();}});
async function setup(word: number) {
 const receiver = createBoardReceiver({sessionId:'call'});
 const sender = createBoardSender({sessionId:'call',senderId:'worker',transport:createMemoryTransport(receiver)});
 const board = createBoardSpeech({sender,now:()=>0});
 await board.reconnect();
 await board.stage('speech',[{word,batch:columns}]);
 return {receiver,board};
}
it('R450-4 empty TTS must not release without any playback',async()=>{
 const c=await setup(1);
 const audio=boardAudio(inputText('Write.'),async()=>new ReadableStream<AudioFrame>({start(o){o.close();}}),c.board,'speech');
 for await(const frame of audio) void frame;
 expect(boardPaths(c.receiver.scene())).toEqual([]);
 expect(c.receiver.staged()).toHaveLength(0);
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
 }}),c.board,'speech');
 for await(const frame of audio) void frame;
 await c.board.played('speech',300);
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
 }}),c.board,'speech');
 for await(const frame of audio) void frame;
 await c.board.played('speech',300);
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
 const audio=boardAudio(inputText('Write one plus one.'),async()=>synthFrame(['Write ','one ','plus ','one.'].map((s,i)=>voice.createTimedString({text:s,startTime:i/10,endTime:(i+1)/10}))),c.board,'speech');
 for await(const frame of audio) void frame;
 await c.board.played('speech',300);
 expect(boardPaths(c.receiver.scene()).length).toBe(0);
 await c.board.played('speech',400);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});
it.each([true,false])('positive: missing timestamp suffix uses the sentence end, timestamps=%s',async timestamps=>{
 const c=await setup(3);
 const audio=boardAudio(inputText('Write one now.'),async()=>synthFrame(timestamps?[voice.createTimedString({text:'Write ',endTime:0.1})]:undefined),c.board,'speech');
 for await(const frame of audio) void frame;
 await c.board.played('speech',999);
 expect(boardPaths(c.receiver.scene()).length).toBe(0);
 await c.board.played('speech',1000);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});
it('positive: a 201-word sentence releases its final cue only at the final word',async()=>{
 const c=await setup(201);
 const words=[...Array(200).fill('one '),'done.'];
 const audio=boardAudio(inputText(words.join('')),async()=>synthFrame(words.map((s,i)=>voice.createTimedString({text:s,startTime:i/100,endTime:(i+1)/100})),3000),c.board,'speech');
 for await(const frame of audio) void frame;
 await c.board.played('speech',2000);
 expect(boardPaths(c.receiver.scene()).length).toBe(0);
 await c.board.played('speech',2010);
 expect(boardPaths(c.receiver.scene()).length).toBeGreaterThan(0);
});
