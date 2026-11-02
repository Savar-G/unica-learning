import { ReadableStream } from "node:stream/web";
import { AudioFrame } from "@livekit/rtc-node";
import { USERDATA_TIMED_TRANSCRIPT, voice } from "@livekit/agents";
import { expect, it } from "vitest";
import { boardPaths } from "@/lib/board";
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
