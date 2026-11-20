import type { Question } from "./types";

const rank = { easy: 0, medium: 1, hard: 2 };
const difficulty = (q: Question) => rank[q.difficulty ?? "medium"];
const distance = (n: number, min: number, max: number) => Math.max(min - n, n - max, 0);

/**
 * The original rotation determines the slots. Try the possible difficulty combinations within those slots, using
 * the first unused seeded question of each difficulty. The first equal-scoring combination wins.
 */
export function balanceBlock(slots: readonly Question[], pool: readonly Question[], groupOf: (q: Question) => string): Question[] {
  const groups = new Map<string, Question[][]>();
  for (const slot of slots) groups.set(groupOf(slot), [[], [], []]);
  const order = new Map(pool.map((q, i) => [q, i]));
  for (const q of pool) groups.get(groupOf(q))?.[difficulty(q)].push(q);

  let best = slots.slice();
  let bestPenalty = Infinity;
  const picked: Question[] = [];
  const counts = [0, 0, 0];
  const search = (position: number) => {
    if (position === slots.length) {
      const [easy, medium, hard] = counts;
      // Keeping hard questions at two takes priority if the full target cannot be reached.
      const penalty = distance(easy, 1, 2) + distance(medium, 2, 3) + 12 * Math.max(0, hard - 2);
      if (penalty < bestPenalty) {
        best = picked.slice();
        bestPenalty = penalty;
      }
      return;
    }
    const buckets = groups.get(groupOf(slots[position]))!;
    const options = buckets.flatMap((bucket) => {
      const q = bucket.find((q) => !picked.includes(q));
      return q ? [q] : [];
    }).sort((a, b) => order.get(a)! - order.get(b)!);
    for (const option of options) {
      const rating = difficulty(option);
      picked.push(option);
      counts[rating]++;
      search(position + 1);
      counts[rating]--;
      picked.pop();
      if (bestPenalty === 0) break;
    }
  };
  search(0);
  return best.sort((a, b) => difficulty(a) - difficulty(b));
}
