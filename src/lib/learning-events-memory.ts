import { randomUUID } from "node:crypto";
import type { LearningEvent, LearningEventStore } from "@/lib/learning-events";

// The learning events' store (src/lib/learning-events.ts, #302) in memory, for tests. It keeps the database's rules:
// the idempotency key is unique, so an insert of a stored key gives the stored event and adds none; a range read is one
// child's events from its start (included) to its end (not included), by time and then id. Events are JSON in the
// database, so the store keeps and gives copies.
export function memoryLearningEventStore(): LearningEventStore {
  const rows: LearningEvent[] = [];
  return {
    async insert(event) {
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
