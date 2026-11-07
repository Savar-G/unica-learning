import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "@/lib/database";
import type { ExplanationContext, ExplanationRef, ExplanationStore } from "@/lib/parent-problem-explanation";

/** Generated RPC typing stays binding. Root installs the additive migration and regenerates official types. */
export function parentExplanationStore(db: SupabaseClient<Database>): ExplanationStore {
  async function command(action: string, ref: ExplanationRef | null, context: string | null = null, token: string | null = null, extra: Record<string, unknown> = {}): Promise<unknown> {
    const result = await db.rpc("parent_explanation_command", { p_action: action, p_parent: ref?.parent ?? null,
      p_photo: ref?.photo ?? null, p_token: token, p_data: toJson({ ...(ref ? { itemId: ref.itemId, version: ref.version } : {}), context, ...extra }) });
    if (result.error) throw new Error("explanation_store");
    return result.data;
  }
  return {
    async context(ref) {
      const result = await command("context", ref);
      return result && typeof result === "object" && !Array.isArray(result) && "context" in result ? result as unknown as ExplanationContext : null;
    },
    async claim(ref, context, token) {
      const result = await command("claim", ref, context, token);
      if (result === "claimed" || result === "busy") return result;
      return result && typeof result === "object" && "explanation" in result ? { explanation: result.explanation } : "refused";
    },
    async admit(ref, context, token, model) {
      const result = await command("admit", ref, context, token, { model });
      if (result === "cap" || result === "unavailable") return result;
      return result && typeof result === "object" && "dispatch" in result && typeof result.dispatch === "string" ? { dispatch: result.dispatch } : "refused";
    },
    async settle(dispatch, cost) { if (await command("settle", null, null, dispatch, { cost }) !== true) throw new Error("explanation_settle"); },
    async finish(ref, context, token, explanation) { return await command("finish", ref, context, token, { explanation }) === true; },
    read: (ref, context) => command("read", ref, context),
    async release(ref, context, token) { await command("release", ref, context, token); },
  };
}
