// The spend seam of Maya's text session (C2, agreed with the voice lead): how a session asks for money before a model
// request it starts by itself, with no database request on the turn's path. The caller owns the budget (the voice
// worker's budget block); the session only takes a handle, settles it once with the cost, or gives it back unused.
// No import from the voice worker or the ledger here: the seam is three synchronous calls.

/** What a handle pays for: a turn's own model request, or a reply prepared before the child's final words ("speculative"). */
export type SpendKind = "model" | "speculative";

/** One permitted request. The caller may hold more in it (an id, a block); the session reads only `kind`. */
export interface SpendHandle {
  readonly kind: SpendKind | "review";
  readonly micros: number;
}

export interface SpendSeam {
  /** Permission for one request, at once, with no I/O. Null: no money for it, so the session sends nothing. */
  take(kind: SpendKind): SpendHandle | null;
  /** The request ended or was aborted: its cost in US dollars (the provider's own figure, else an estimate). Once per handle. */
  settle(handle: SpendHandle, usd: number, how?: { used?: boolean }): void;
  /** The request was never sent. Once per handle, in place of `settle`. */
  giveBack(handle: SpendHandle): void;
}

/** An in-memory seam for tests and the command line: it counts handles and cost. `limit`: the most handles it gives. */
export function memorySpendSeam(limit = Number.POSITIVE_INFINITY): SpendSeam & { taken: SpendHandle[]; settled: { handle: SpendHandle; usd: number }[]; givenBack: SpendHandle[]; usd(): number } {
  const taken: SpendHandle[] = [];
  const settled: { handle: SpendHandle; usd: number }[] = [];
  const givenBack: SpendHandle[] = [];
  return {
    taken, settled, givenBack,
    take(kind) {
      if (taken.length - givenBack.length >= limit) return null;
      const handle: SpendHandle = { kind, micros: 1 };
      taken.push(handle);
      return handle;
    },
    settle(handle, usd) { settled.push({ handle, usd }); },
    giveBack(handle) { givenBack.push(handle); },
    usd: () => settled.reduce((n, x) => n + x.usd, 0),
  };
}
