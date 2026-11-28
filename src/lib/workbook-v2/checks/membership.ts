// Whether a printed question is one of the questions of its row: read back from the question and the row's limits, with no
// code of the build that chose it. A shape that can say so itself does (`contains`); a shape with a list is checked
// against the list, and one with a small space against its whole space. A question that cannot be proved is no proof.
import type { SnapshotRow } from "../bank/snapshot";
import { canonicalJson } from "../hash";

/** The largest space that the check reads whole: the build reads spaces up to this size whole too (build/items.ts). */
const MOST_READ = 20_000;
/** A fixed seed: a question of a space other than a word problem does not depend on it. */
const SEED = "membership-check";

/** True when the question is one of the row, false when it is not, and null when the shape gives no way to know. */
export type RowHas = (row: Pick<SnapshotRow, "shape" | "limits">, question: unknown) => boolean | null;

/** The membership of questions in rows, with the questions of each listed row read one time. */
export function rowMembership(): RowHas {
  const forms = new Map<string, ReadonlySet<string> | null>();
  return ({ shape, limits }, question) => {
    if (shape.contains) return shape.contains(question, limits);
    const id = `${shape.id} ${shape.version} ${canonicalJson(limits)}`;
    let known = forms.get(id);
    if (known === undefined) {
      const space = shape.list ? null : shape.space?.(limits);
      known = shape.list ? new Set(shape.list(limits).map((q) => canonicalJson(q)))
        : space && space.count <= MOST_READ ? new Set(Array.from({ length: space.count }, (_, i) => canonicalJson(space.at(i, SEED).question)))
          : null;
      forms.set(id, known);
    }
    return known ? known.has(canonicalJson(question)) : null;
  };
}
