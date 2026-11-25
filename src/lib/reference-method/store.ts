import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import { methodRef } from "./identity";
import type { ExistingMethodRow, TopicMethodRow, TopicMethodStore } from "./import";

const TOPIC_METHOD_TABLE = "bank_reference_topic_methods";
const READ_CHUNK = 100;

function columnsOf({ topic, record, ...columns }: TopicMethodRow) {
  return { ...columns, topic_number: topic, record: record as unknown as Json };
}

export function createSupabaseTopicMethodStore(db: SupabaseClient<Database>, now: () => Date): TopicMethodStore {
  return {
    async findExisting(keys) {
      const found = new Map<string, ExistingMethodRow>();
      for (const group of Map.groupBy(keys, (key) => `${key.source}:${key.level}`).values()) {
        const [{ source, level }] = group;
        for (let i = 0; i < group.length; i += READ_CHUNK) {
          const { data, error } = await db
            .from(TOPIC_METHOD_TABLE)
            .select("source, level, topic_number, record, status, digest, updated_at")
            .eq("source", source)
            .eq("level", level)
            .in("topic_number", group.slice(i, i + READ_CHUNK).map((key) => key.topic));
          if (error) throw new Error(`Failed reading the stored method records: ${error.message}`);
          for (const { topic_number, record, status, digest, updated_at } of data) {
            found.set(methodRef({ source, level, topic: topic_number }), { record, status, digest, updated_at });
          }
        }
      }
      return found;
    },

    async insertRow(row) {
      const { data, error } = await db
        .from(TOPIC_METHOD_TABLE)
        .upsert(columnsOf(row), { onConflict: "source,level,topic_number", ignoreDuplicates: true })
        .select("topic_number");
      if (error) throw new Error(`Failed inserting topic ${row.topic}: ${error.message}`);
      return data.length > 0;
    },

    async updateRow(row, updatedAt) {
      // Always later than the revision that was read, also when two runs have one clock time.
      const next = new Date(Math.max(now().getTime(), Date.parse(updatedAt) + 1)).toISOString();
      const { data, error } = await db
        .from(TOPIC_METHOD_TABLE)
        .update({ ...columnsOf(row), updated_at: next })
        .eq("source", row.source)
        .eq("level", row.level)
        .eq("topic_number", row.topic)
        .eq("updated_at", updatedAt)
        .select("topic_number");
      if (error) throw new Error(`Failed updating topic ${row.topic}: ${error.message}`);
      return data.length > 0;
    },
  };
}
