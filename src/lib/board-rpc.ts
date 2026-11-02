// LiveKit RPC adapter. Large reconnect snapshots use bounded parts. Each protocol answer already fits one RPC.
import type { BoardReceiver, BoardResponse, BoardTransport } from "@/lib/board-protocol";
export const BOARD_RPC = "maya.board";
export interface RpcPeer {
  performRpc(args: { destinationIdentity: string; method: string; payload: string; responseTimeout: number }): Promise<string>;
}
const PART_CHARS = 1000;
const MAX_PARTS = 4096;
export function boardRpcTransport(peer: RpcPeer, destinationIdentity: string, newId: () => string): BoardTransport {
  return { async call(request) {
    const text = JSON.stringify(request);
    const id = newId();
    const count = Math.ceil(text.length / PART_CHARS);
    if (count > MAX_PARTS) throw new Error("The board request is too large.");
    for (let index = 0; index < count; index++) {
      await peer.performRpc({ destinationIdentity, method: BOARD_RPC, responseTimeout: 5000,
        payload: JSON.stringify({ id, index, count, data: text.slice(index * PART_CHARS, (index + 1) * PART_CHARS) }) });
    }
    const answer = await peer.performRpc({ destinationIdentity, method: BOARD_RPC, responseTimeout: 5000, payload: JSON.stringify({ id, commit: true }) });
    return JSON.parse(answer) as BoardResponse;
  } };
}

/** One authenticated worker at a time. Authentication occurs before assembly, including on each part. */
export function boardRpcHandler(receiver: BoardReceiver, options: { allowed(identity: string): boolean; changed(restored: boolean): void }) {
  const transfers = new Map<string, { caller: string; count: number; parts: string[] }>();
  return (caller: string, payload: string): string => {
    if (!options.allowed(caller)) throw new Error("This worker does not own the board.");
    const p = JSON.parse(payload);
    if (typeof p.id !== "string" || !p.id || p.id.length > 100 || payload.length > 8000) throw new Error("Invalid board RPC.");
    let transfer = transfers.get(p.id);
    if (p.commit === true) {
      if (!transfer || transfer.caller !== caller || transfer.parts.length !== transfer.count) throw new Error("Incomplete board request.");
      const response = receiver.handle(JSON.parse(transfer.parts.join("")));
      options.changed(response.ok && response.type === "reset");
      return JSON.stringify(response);
    }
    if (!Number.isSafeInteger(p.index) || !Number.isSafeInteger(p.count) || p.index < 0 || p.count < 1 || p.count > MAX_PARTS || p.index >= p.count || typeof p.data !== "string" || p.data.length > PART_CHARS) throw new Error("Invalid board part.");
    if (p.index === 0) {
      if (!transfers.has(p.id) && transfers.size >= 4) transfers.delete(transfers.keys().next().value!);
      transfer = { caller, count: p.count, parts: [] };
      transfers.set(p.id, transfer);
    }
    if (!transfer || transfer.caller !== caller || transfer.count !== p.count || p.index !== transfer.parts.length) throw new Error("Unordered board part.");
    transfer.parts.push(p.data);
    return "ok";
  };
}
