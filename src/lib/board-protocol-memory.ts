// The in-memory transport for the board batch protocol (#328): the test double of the LiveKit RPC transport (#329).
// Every request and answer goes through JSON, as on the wire, and an answer over LiveKit's 15 KiB is lost, as there.
// Tests can hold requests in flight, lose an answer after the receiver acted on the request, delay a request past its
// timeout and deliver it later, or cut the line.
import type { BoardReceiver, BoardRequest, BoardResponse, BoardTransport } from "@/lib/board-protocol";

export interface MemoryTransport extends BoardTransport {
  /** Later requests wait in flight until `flush`. */
  hold(): void;
  /** Delivers the held requests in order and stops holding. */
  flush(): void;
  /** The receiver handles the next request (of this type, when given), then its answer is lost, as in a timeout. */
  loseNextAnswer(type?: BoardRequest["type"]): void;
  /**
   * The next request (of this type, when given) times out before it reaches the receiver: the call fails. The request
   * is not gone: `deliverDelayed` delivers it later, as a late copy on the wire.
   */
  delayNext(type?: BoardRequest["type"]): void;
  /** Delivers the delayed requests to the receiver, in order, and returns its answers (nobody waits for them). */
  deliverDelayed(): BoardResponse[];
  /** From now on every call fails without reaching the receiver. */
  cut(): void;
  /** Every request the receiver handled, in order. */
  readonly delivered: BoardRequest[];
  /** The most requests that were in flight at once. */
  readonly maxInFlight: number;
  /** The largest answer in UTF-8 bytes. */
  readonly largestAnswerBytes: number;
}

/** LiveKit's limit on an RPC answer. */
const LIVEKIT_ANSWER_BYTES = 15 * 1024;

export function createMemoryTransport(receiver: Pick<BoardReceiver, "handle">, options: { maxAnswerBytes?: number } = {}): MemoryTransport {
  const maxAnswerBytes = options.maxAnswerBytes ?? LIVEKIT_ANSWER_BYTES;
  const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const delivered: BoardRequest[] = [];
  let held: (() => void)[] | null = null;
  const lose: (BoardRequest["type"] | "any")[] = [];
  const delay: (BoardRequest["type"] | "any")[] = [];
  const delayed: BoardRequest[] = [];
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
          const late = delay.findIndex((t) => t === "any" || t === req.type);
          if (late >= 0) {
            delay.splice(late, 1);
            delayed.push(req);
            return reject(new Error("The request timed out."));
          }
          delivered.push(req);
          const text = JSON.stringify(receiver.handle(req));
          const bytes = new TextEncoder().encode(text).length;
          largestAnswerBytes = Math.max(largestAnswerBytes, bytes);
          if (bytes > maxAnswerBytes) return reject(new Error("The answer is larger than an RPC answer may be."));
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
    delayNext(type) {
      delay.push(type ?? "any");
    },
    deliverDelayed() {
      return delayed.splice(0).map((req) => {
        delivered.push(req);
        return wire(receiver.handle(req));
      });
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
