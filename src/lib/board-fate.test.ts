import { describe, expect, it } from "vitest";
import { CHAT_FATE_LIMIT, chatBoardFates, snapshotFates } from "@/lib/board-fate";
import type { BoardHistory } from "@/lib/board-history";

// B1: the desk's own record of Maya's batches, read as one word per batch for the call (src/lib/board-fate.ts).

const history = (events: BoardHistory["events"]): BoardHistory => ({ v: 1, revision: events.length, events });

describe("chatBoardFates (the desk chat's board)", () => {
  it("reads a batch on the board as shown and a refused one as skipped, in the order they came, each once", () => {
    const h = history([
      { kind: "maya", t: 1, batchId: "c-b1", commands: [] },
      { kind: "pen", t: 2, holder: "child" },
      { kind: "skipped", t: 3, batchId: "c-b2" },
      { kind: "maya", t: 4, batchId: "c-b3", commands: [] },
      { kind: "maya", t: 5, batchId: "c-b1", commands: [] },
    ] as BoardHistory["events"]);
    expect(chatBoardFates(h)).toEqual([
      { batchId: "c-b1", fate: "shown" },
      { batchId: "c-b2", fate: "skipped" },
      { batchId: "c-b3", fate: "shown" },
    ]);
  });

  it("sends the newest batches only, and nothing for a board with none", () => {
    const events = Array.from({ length: CHAT_FATE_LIMIT + 4 }, (_, i) => ({ kind: "maya", t: i, batchId: `c-b${i + 1}`, commands: [] }));
    const fates = chatBoardFates(history(events as BoardHistory["events"]));
    expect(fates).toHaveLength(CHAT_FATE_LIMIT);
    expect(fates.at(-1)).toEqual({ batchId: `c-b${CHAT_FATE_LIMIT + 4}`, fate: "shown" });
    expect(chatBoardFates(history([]))).toEqual([]);
  });
});

describe("snapshotFates (the voice board log the child's screen returns)", () => {
  it("reads a shown batch as shown and a staged batch the screen dropped as cancelled", () => {
    expect(snapshotFates({ events: [
      { kind: "batch", batchId: "v-b1", commands: [] },
      { kind: "ink", page: 1, stroke: { erase: false, w: 5, pts: [] }, boardWidth: 1000 },
      { kind: "cancelled", batchIds: ["v-b2", "v-b3"] },
      { kind: "presented", batchId: "v-b1" },
    ] })).toEqual([
      { batchId: "v-b1", fate: "shown" },
      { batchId: "v-b2", fate: "cancelled" },
      { batchId: "v-b3", fate: "cancelled" },
    ]);
  });

  it("keeps a batch shown when a later cancel names it, and gives no word for a batch the log does not hold", () => {
    expect(snapshotFates({ events: [{ kind: "batch", batchId: "v-b1", commands: [] }, { kind: "cancelled", batchIds: ["v-b1"] }] })).toEqual([{ batchId: "v-b1", fate: "shown" }]);
    expect(snapshotFates({ events: [] })).toEqual([]);
  });
});
