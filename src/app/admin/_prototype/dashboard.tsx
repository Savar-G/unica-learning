// PROTOTYPE ONLY (branch site/admin-revamp-prototype). Three admin dashboard layouts on /admin, switched with
// ?variant=A|B|C; ?variant=0 shows the current tests list. ?demo=1 (local dev only) uses made-up families and skips
// the admin check, so the layouts can be judged with more than a handful of rows.
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH } from "@/lib/admin-view";
import { BRAND } from "@/lib/site";
import { buildDashboard, loadRaw, pickRange } from "./data";
import { demoRaw } from "./demo";
import { FamilyDrawer } from "./drawer";
import type { Ctx } from "./parts";
import { PrototypeSwitcher } from "./switcher";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import "@/components/admin.css";
import "./prototype.css";

export const SHOW_PROTOTYPE = process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";

const VARIANTS = [
  { key: "A", name: "Daily dashboard" },
  { key: "B", name: "Pipeline board" },
  { key: "C", name: "Activity inbox" },
];

const NAV = [
  { href: ADMIN_PATH, label: "Dashboard" },
  { href: `${ADMIN_PATH}?variant=0`, label: "Tests" },
  { href: `${ADMIN_PATH}/reviews`, label: "AI reviews" },
  { href: `${ADMIN_PATH}/parents`, label: "Parents" },
  { href: `${ADMIN_PATH}/children`, label: "Children" },
  { href: `${ADMIN_PATH}/next-steps`, label: "Cards and waitlist" },
  { href: `${ADMIN_PATH}/emails`, label: "Emails" },
];

export async function PrototypeDashboard({ query: raw }: { query: Record<string, string | string[] | undefined> }) {
  if (!SHOW_PROTOTYPE) notFound();
  await connection();
  const query = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : []))) as Record<string, string>;
  const demo = query.demo === "1" && process.env.NODE_ENV === "development";
  const now = new Date();
  const admin = demo ? null : await requireAdmin();
  const data = demo ? demoRaw(now) : await loadRaw(admin!);
  const d = buildDashboard(data, pickRange(query.range), now);
  const variant = VARIANTS.some((v) => v.key === query.variant) ? query.variant : "A";
  const ctx: Ctx = { query, demo };
  return (
    <div className="look-root adm-root pa-root" data-look="warm" data-variant={variant}>
      <header className="adm-bar">
        <Link className="adm-brand" href={ADMIN_PATH}>{BRAND} <span>admin</span></Link>
        <nav aria-label="Admin"><ul>{NAV.map((n, i) => <li key={n.href}><Link href={n.href} aria-current={i === 0 ? "page" : undefined}>{n.label}</Link></li>)}</ul></nav>
        <span className="adm-who">{demo ? "demo data" : admin!.email}</span>
      </header>
      <div className="pa-page">
        {variant === "A" && <VariantA d={d} ctx={ctx} />}
        {variant === "B" && <VariantB d={d} ctx={ctx} />}
        {variant === "C" && <VariantC d={d} ctx={ctx} />}
      </div>
      {query.family && <FamilyDrawer ctx={ctx} d={d} id={query.family} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}
