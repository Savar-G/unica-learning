import { randomUUID } from "node:crypto";
import type { LearningEvent, LearningEventStore } from "@/lib/learning-events";

// The learning events' store (src/lib/learning-events.ts, #302) in memory, for tests. It keeps the database's rules:
// an event's child must be one of the families' children, under the event's parent, and an assessment question's test
// must be that child's (the foreign keys); a family
// whose deletion is requested takes no event (the family write fence); the idempotency key is unique, so an insert of a
// stored key gives the stored event and adds none; a range read is one child's events from its start (included) to its
// end (not included), by time and then id. Events are JSON in the database, so the store keeps and gives copies.

/** The families the store knows: each child with its parent, each test with its child, and the parents whose family deletion is requested. */
export interface MemoryFamilies {
  children: { id: string; parentId: string }[];
  tests?: { id: string; childId: string }[];
  deleting?: string[];
}

export function memoryLearningEventStore(families: MemoryFamilies): LearningEventStore {
  const rows: LearningEvent[] = [];
  return {
    async insert(event) {
      if (families.deleting?.includes(event.parentId)) return { refused: "family_unavailable" };
      if (!families.children.some((c) => c.id === event.childId && c.parentId === event.parentId)) return { refused: "the child is not under that parent" };
      const q = event.question;
      if (q.source === "assessment" && !families.tests?.some((t) => t.id === q.assessmentId && t.childId === event.childId)) return { refused: "the test is not the child's" };
      const stored = rows.find((r) => r.key === event.key);
      if (stored) return { created: false, event: structuredClone(stored) };
      const row = { ...structuredClone(event), id: randomUUID() };
      rows.push(row);
      return { created: true, event: structuredClone(row) };
    },
    async range(childId, { from, to }) {
      const [start, end] = [Date.parse(from), Date.parse(to)];
      return rows
        .filter((r) => r.childId === childId && Date.parse(r.occurredAt) >= start && Date.parse(r.occurredAt) < end)
        .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id))
        .map((r) => structuredClone(r));
    },
  };
}
