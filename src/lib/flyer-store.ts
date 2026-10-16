import "server-only";
import { connection } from "next/server";
import { buildFamilies } from "@/lib/admin-dashboard";
import { demoRows } from "@/lib/admin-demo";
import { dashboardRows, requireAdmin, type AdminSession } from "@/lib/admin-store";
import { FLYER_CODES, flyerRows, flyerVerdict, type FlyerCode, type FlyerRow, type Verdict } from "@/lib/flyers";
import { adminClient } from "@/lib/supabase-auth";

// What the admin flyers page (/admin/flyers) reads: the scans and delivered counts of the two flyers, and the signups
// that carry their tags. Admins only (requireAdmin); the tables are read through the admin's own session. ?demo=1 shows
// made-up numbers in local development only, like the dashboard.

export interface FlyerPage {
  who: string;
  /** False until the flyer tables exist (supabase/migrations/20261016_add_flyer_tracking.sql). */
  ready: boolean;
  rows: FlyerRow[];
  verdict: Verdict;
  lastScan: Record<FlyerCode, string | null>;
  demo: boolean;
  withTests: boolean;
}

const missingTable = (e: { code?: string; message: string }) => e.code === "PGRST205" || e.code === "42P01" || /flyer_(scans|batches)/.test(e.message);

async function flyerTables(a: AdminSession) {
  const batches = await a.db.from("flyer_batches").select("code, delivered");
  if (batches.error) {
    if (missingTable(batches.error)) return null;
    throw new Error(`flyer batches: ${batches.error.message}`);
  }
  const delivered: Partial<Record<FlyerCode, number>> = {};
  for (const b of (batches.data ?? []) as { code: string; delivered: number }[]) if ((FLYER_CODES as string[]).includes(b.code)) delivered[b.code as FlyerCode] = b.delivered;
  const scans: Partial<Record<FlyerCode, number>> = {};
  const lastScan = {} as Record<FlyerCode, string | null>;
  await Promise.all(
    FLYER_CODES.map(async (code) => {
      const [count, last] = await Promise.all([
        a.db.from("flyer_scans").select("id", { count: "exact", head: true }).eq("code", code),
        a.db.from("flyer_scans").select("scanned_at").eq("code", code).order("scanned_at", { ascending: false }).limit(1),
      ]);
      if (count.error) throw new Error(`flyer scans: ${count.error.message}`);
      scans[code] = count.count ?? 0;
      lastScan[code] = (last.data as { scanned_at: string }[] | null)?.[0]?.scanned_at ?? null;
    }),
  );
  return { delivered, scans, lastScan };
}

export async function loadFlyers(raw: Record<string, string | string[] | undefined>): Promise<FlyerPage> {
  await connection();
  const query = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : [])));
  const withTests = query.tests === "1";
  const now = new Date();
  const finish = (who: string, demo: boolean, tables: Awaited<ReturnType<typeof flyerTables>>, rows: Awaited<ReturnType<typeof dashboardRows>>): FlyerPage => {
    const empty = { delivered: {}, scans: {}, lastScan: { a: null, b: null } };
    const t = tables ?? empty;
    const families = buildFamilies(rows, now);
    const out = flyerRows({ parents: rows.parents, families, scans: t.scans, delivered: t.delivered, withTests });
    return { who, ready: tables !== null || demo, rows: out, verdict: flyerVerdict(out[0], out[1]), lastScan: t.lastScan, demo, withTests };
  };
  if (query.demo === "1" && process.env.NODE_ENV === "development") {
    const rows = demoRows(now);
    // Tag every fourth family as coming from flyer A and every fifth from flyer B.
    rows.parents = rows.parents.map((p, i) => (i % 4 === 0 ? { ...p, source: { utm_source: "flyer", utm_content: "a" } } : i % 5 === 0 ? { ...p, source: { utm_source: "flyer", utm_content: "b" } } : p));
    return finish("demo data", true, { delivered: { a: 240, b: 235 }, scans: { a: 61, b: 48 }, lastScan: { a: now.toISOString(), b: now.toISOString() } }, rows);
  }
  const admin = await requireAdmin();
  return finish(admin.email, false, await flyerTables(admin), await dashboardRows(admin));
}

/** Sets how many of a flyer were handed out (with the secret key; the caller has checked the admin). False when it failed. */
export async function setDelivered(code: FlyerCode, delivered: number): Promise<boolean> {
  const db = adminClient();
  if (!db) return false;
  const { error } = await db.from("flyer_batches").upsert({ code, delivered, updated_at: new Date().toISOString() }, { onConflict: "code" });
  if (error) console.error("[admin] flyer delivered not saved", code, error.message);
  return !error;
}
