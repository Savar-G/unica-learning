// Diagnostic ids for spend handles. A Handle (src/lib/maya-spend-block.ts) has only a kind and its micros, so a log line
// cannot name which handle a request used. This getter gives each handle OBJECT one id, for the life of one call's
// getter. The ids are for logs only: they are not database reservation ids, never reach the ledger, and never come from
// amounts or times. The handle is only a WeakMap key: it is not changed, frozen or kept alive. No Node import.

/**
 * One getter per call (the caller owns it). `scopeId` is an opaque namespace, so two getters never give the same id
 * (the call's unique budget key is a good one). The same object always gets the same id; two objects with the same
 * fields get different ids.
 */
export function createHandleDiagnosticIds(scopeId: string): (handle: object) => string {
  const ids = new WeakMap<object, string>();
  let next = 0;
  return (handle) => {
    let id = ids.get(handle);
    if (id === undefined) {
      id = `${scopeId}#h${++next}`;
      ids.set(handle, id);
    }
    return id;
  };
}
