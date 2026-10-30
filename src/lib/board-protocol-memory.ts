// The in-memory transport for the board batch protocol (#328): the test double of the LiveKit RPC transport (#329).
// Every request and answer goes through JSON, as on the wire. Tests can hold requests in flight, lose an answer after the
// receiver acted on the request, or cut the line.
import type { BoardReceiver, BoardRequest, BoardResponse, BoardTransport } from "@/lib/board-protocol";

export interface MemoryTransport extends BoardTransport {
  /** Later requests wait in flight until `flush`. */
  hold(): void;
  /** Delivers the held requests in order and stops holding. */
  flush(): void;
  /** The receiver handles the next request (of this type, when given), then its answer is lost, as in a timeout. */
  loseNextAnswer(type?: BoardRequest["type"]): void;
  /** From now on every call fails without reaching the receiver. */
  cut(): void;
  /** Every request the receiver handled, in order. */
  readonly delivered: BoardRequest[];
  /** The most requests that were in flight at once. */
  readonly maxInFlight: number;
  /** The largest answer in UTF-8 bytes. */
  readonly largestAnswerBytes: number;
}

export function createMemoryTransport(receiver: Pick<BoardReceiver, "handle">): MemoryTransport {
  const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const delivered: BoardRequest[] = [];
  let held: (() => void)[] | null = null;
  const lose: (BoardRequest["type"] | "any")[] = [];
  let cut = false;
  let inFlight = 0;
  let maxInFlight = 0;
  let largestAnswerBytes = 0;

  return {
    call(request) {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<BoardResponse>((resolve, reject) => {
        const deliver = () => {
          inFlight--;
          if (cut) return reject(new Error("The line is cut."));
          const req = wire(request);
          delivered.push(req);
          const text = JSON.stringify(receiver.handle(req));
          largestAnswerBytes = Math.max(largestAnswerBytes, new TextEncoder().encode(text).length);
          const answer = JSON.parse(text) as BoardResponse;
          const lost = lose.findIndex((t) => t === "any" || t === req.type);
          if (lost >= 0) {
            lose.splice(lost, 1);
            return reject(new Error("The answer was lost."));
          }
          resolve(answer);
        };
        if (held) held.push(deliver);
        else queueMicrotask(deliver);
      });
    },
    hold() {
      held ??= [];
    },
    flush() {
      const queue = held ?? [];
      held = null;
      for (const deliver of queue) deliver();
    },
    loseNextAnswer(type) {
      lose.push(type ?? "any");
    },
    cut() {
      cut = true;
    },
    delivered,
    get maxInFlight() {
      return maxInFlight;
    },
    get largestAnswerBytes() {
      return largestAnswerBytes;
    },
  };
}
