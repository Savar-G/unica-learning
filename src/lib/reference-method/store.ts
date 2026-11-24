import type { SupabaseClient } from "@supabase/supabase-js";
import { methodRef } from "./identity";
import type { ExistingMethodRow, TopicMethodStore } from "./import";
import { TOPIC_METHOD_TABLE, type MethodKey } from "./types";

const READ_CHUNK = 100;

// The client is untyped because the generated database types do not hold this table yet.
export function createSupabaseTopicMethodStore(db: SupabaseClient, now: () => Date): TopicMethodStore {
  return {
    async findExisting(keys) {
      const found = new Map<string, ExistingMethodRow>();
      const levels = new Map<string, MethodKey[]>();
      for (const key of keys) {
        const id = `${key.source}:${key.level}`;
        levels.set(id, [...(levels.get(id) ?? []), key]);
      }
      for (const group of levels.values()) {
        const [{ source, level }] = group;
        for (let i = 0; i < group.length; i += READ_CHUNK) {
          const { data, error } = await db
            .from(TOPIC_METHOD_TABLE)
            .select("source, level, topic_number, record, status, digest")
            .eq("source", source)
            .eq("level", level)
            .in("topic_number", group.slice(i, i + READ_CHUNK).map((key) => key.topic));
          if (error) throw new Error(`Failed reading the stored method records: ${error.message}`);
          for (const row of data ?? []) {
            found.set(methodRef({ source: row.source, level: row.level, topic: row.topic_number }), {
              record: row.record,
              status: String(row.status),
              digest: String(row.digest),
            });
          }
        }
      }
      return found;
    },

    async insertRow({ topic, ...columns }) {
      const { data, error } = await db
        .from(TOPIC_METHOD_TABLE)
        .upsert({ ...columns, topic_number: topic }, { onConflict: "source,level,topic_number", ignoreDuplicates: true })
        .select("topic_number");
      if (error) throw new Error(`Failed inserting topic ${topic}: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },

    async updateRow(row, expected) {
      const { data, error } = await db
        .from(TOPIC_METHOD_TABLE)
        .update({ record: row.record, status: row.status, digest: row.digest, updated_at: now().toISOString() })
        .eq("source", row.source)
        .eq("level", row.level)
        .eq("topic_number", row.topic)
        .eq("digest", expected.digest)
        .eq("status", expected.status)
        .select("topic_number");
      if (error) throw new Error(`Failed updating topic ${row.topic}: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
  };
}
