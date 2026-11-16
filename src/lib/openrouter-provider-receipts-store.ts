import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import type { ProviderReceipt } from "@/lib/openrouter-usage-webhook";
import { parseProviderReceiptView, type ProviderReceiptView } from "@/lib/openrouter-provider-receipts";

/** Direct PostgREST RPCs keep this additive migration independent of generated types until ROOT applies it. */
export async function insertProviderReceipts(rows: ProviderReceipt[], signal: AbortSignal): Promise<void> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Provider receipts unavailable");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ingest_openrouter_provider_receipts`, {
    method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ p_rows: rows }), signal, cache: "no-store",
  });
  if (!response.ok) throw new Error("Provider receipts unavailable");
}

/** Use only the verified admin's session. RLS and the RPC's is_admin check remain authoritative. */
export async function readProviderReceipts(admin: AdminSession, period: { from: Date; to: Date }): Promise<ProviderReceiptView> {
  const { data, error } = await admin.db.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Provider receipts unavailable");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_openrouter_provider_receipts`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ p_from: period.from.toISOString(), p_to: period.to.toISOString() }),
    signal: AbortSignal.timeout(5_000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Provider receipts unavailable");
  return parseProviderReceiptView(await response.json());
}
