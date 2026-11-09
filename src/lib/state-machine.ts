// One shape for every state machine in the app (docs/state-machines.md). A machine's states are an `as const` list in
// the module that owns it; its moves are a table keyed by state, then by event, that names the next state. A missing
// entry means the event is refused in that state. Guards that need time or data stay pure functions beside the table.
// No clock, no I/O.

/** The moves of a machine: for each state, the events it takes and the state each one leads to. */
export type Table<S extends string, E extends string> = { readonly [K in S]: Partial<Record<E, S>> };

/**
 * The state after `event` in state `from`, or null when that state refuses the event. A state the table does not know
 * (a stored value outside the list) refuses every event, as a string comparison would, and never throws.
 */
export const next = <S extends string, E extends string>(table: Table<S, E>, from: S, event: E): S | null =>
  (Object.prototype.hasOwnProperty.call(table, from) ? table[from][event] : undefined) ?? null;

/** Every move of a machine as [from, event, to], in the table's order: for docs and for tests that walk them all. */
export const moves = <S extends string, E extends string>(table: Table<S, E>): [S, E, S][] =>
  (Object.keys(table) as S[]).flatMap((from) => (Object.entries(table[from]) as [E, S][]).map(([event, to]): [S, E, S] => [from, event, to]));
