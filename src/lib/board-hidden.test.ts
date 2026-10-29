import { describe, expect, it } from "vitest";
import { BOARD_KEY, boardStartsOpen, readBoardHidden, writeBoardHidden } from "./board-hidden";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}
const broken = () => {
  throw new Error("blocked");
};

describe("board hide choice", () => {
  it("is open by default", () => {
    expect(readBoardHidden(() => memory())).toBe(false);
    expect(boardStartsOpen(false, false)).toBe(true);
  });

  it("hiding persists for the next questions and a reload, and reopening clears it", () => {
    const store = memory();
    writeBoardHidden(() => store, true);
    expect(readBoardHidden(() => store)).toBe(true);
    expect(boardStartsOpen(false, readBoardHidden(() => store))).toBe(false);
    writeBoardHidden(() => store, false);
    expect(store.getItem(BOARD_KEY)).toBe("0");
    expect(boardStartsOpen(false, readBoardHidden(() => store))).toBe(true);
  });

  it("a question with stored work opens visible even when hidden", () => {
    expect(boardStartsOpen(true, true)).toBe(true);
  });

  it("tolerates sessionStorage failing", () => {
    expect(readBoardHidden(broken)).toBe(false);
    expect(() => writeBoardHidden(broken, true)).not.toThrow();
    const throwingStore = () => ({ getItem: broken, setItem: broken });
    expect(readBoardHidden(throwingStore)).toBe(false);
    expect(() => writeBoardHidden(throwingStore, true)).not.toThrow();
  });
});
