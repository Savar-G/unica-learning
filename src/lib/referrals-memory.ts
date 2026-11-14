import type { ReferralCommand, ReferralDue, ReferralReply, ReferralReservation, ReferralStore } from "@/lib/referrals";

interface Family {
  id: string; code: string; enrolled: Set<string>; customers: Map<string, string | null>; deleted: boolean;
  complete: boolean; blocked: boolean; hadPaid: boolean; paidAt: number | null; first: { id: string; at: number; actual: boolean } | null;
  from: string | null; appliedAt: number; attempts: number[];
}
interface Reward { id: string; parent: string; source: string; kind: "incoming" | "earned"; risk: "clear" | "hold" | "revoke"; order: number; started: boolean; children: Map<string, "unused" | "used">; email: string | null }
interface Operation extends ReferralReservation { reward: string }

/** One serial command at a time, like the database transaction. Test fixtures use only this public seam. */
export function memoryReferrals(now: () => number = () => 1_800_000_000_000) {
  const families = new Map<string, Family>(), rewards: Reward[] = [], operations: Operation[] = [];
  const startChoices = new Map<string, string | null>();
  const riskOrders = new Map<string, number>(), risks = new Map<string, "clear" | "hold" | "revoke">();
  const previews = new Map<string, { parent: string; from: string | null; to: string; reason: string; actor: string }>();
  const audits: { actor: string; reason: string; parent: string }[] = [];
  let serial = 0, queue = Promise.resolve();
  const family = (id: string) => { const f = families.get(id); if (!f) throw new Error("Family missing"); return f; };
  const reward = (parent: string, source: string, kind: Reward["kind"]) => {
    const r: Reward = { id: `reward-${++serial}`, parent, source, kind, risk: "clear", order: serial, started: false, children: new Map(), email: null };
    rewards.push(r); return r;
  };
  const overview = (f: Family) => ({ code: f.code, shareUrl: "", rewardsEarned: rewards.filter(r => r.parent === f.id && r.kind === "earned").length,
    rewardsRemaining: rewards.filter(r => r.parent === f.id && r.kind === "earned" && r.risk !== "revoke" && (!r.started || [...r.children.values()].includes("unused"))).length,
    pendingReferrals: [...families.values()].filter(x => x.from === f.id && !x.first).length,
    appliedCode: f.from ? family(f.from).code || null : null, benefitApplied: rewards.some(r => r.source === f.id && r.kind === "incoming"), canApply: !f.hadPaid && !f.from && f.complete && !f.blocked });
  const command = (c: ReferralCommand): ReferralReply => {
    const f = c.parent ? family(c.parent) : c.action === "risk" ? [...families.values()].find(f => f.first?.id === c.invoice) ?? null : null;
    if (f?.deleted && !["finish", "risk", "paid", "start_result"].includes(c.action)) return { ok: false, error: "family_unavailable" };
    switch (c.action) {
      case "deletion_history": return { ok: true, financial: { needed: !!f!.from, customers: [...f!.customers.keys()] } };
      case "child_operations": return { ok: true, due: { customers: [], emails: [], reservations: operations.filter(o => o.parent === f!.id && o.child === c.child && ["reserved","applied"].includes(o.state)).map(o => ({ ...o })) } };
      case "overview": return { ok: true, overview: overview(f!) };
      case "history": {
        if ([...f!.customers.keys()].some(x => !c.customers?.includes(x))) return { ok: false, error: "unavailable" };
        f!.blocked = false; f!.complete = !!c.complete; f!.hadPaid ||= !!c.paid; return { ok: true };
      }
      case "attempt": {
        f!.attempts = f!.attempts.filter(t => t > now() - 3_600_000);
        if (f!.attempts.length >= 10) return { ok: false, error: "rate_limited" };
        f!.attempts.push(now()); return { ok: true };
      }
      case "apply": {
        const source = [...families.values()].find(x => x.code === c.code && !x.deleted);
        if (!source) return { ok: false, error: "invalid" };
        if (source.id === f!.id) return { ok: false, error: "self_referral" };
        if (f!.from) return f!.from === source.id ? { ok: true } : { ok: false, error: "already_applied" };
        if (!f!.complete || f!.blocked) return { ok: false, error: "unavailable" };
        if (f!.hadPaid) return { ok: false, error: "already_paid" };
        f!.from = source.id; f!.appliedAt = now(); reward(f!.id, f!.id, "incoming"); return { ok: true };
      }
      case "paid": {
        f!.hadPaid = true;
        f!.paidAt = Math.min(f!.paidAt ?? Infinity, c.paidAt!);
        if (c.paid && (!f!.first || c.paidAt! < f!.first.at || (c.paidAt === f!.first.at && c.invoice! < f!.first.id))) {
          f!.first = { id: c.invoice!, at: c.paidAt!, actual: !!c.paid };
        }
        if (f!.from && f!.first?.actual && f!.paidAt! >= f!.appliedAt && !rewards.some(r => r.source === f!.id && r.kind === "earned")) reward(f!.from, f!.id, "earned");
        if (f!.from && f!.paidAt! < f!.appliedAt) for (const r of rewards.filter(r => r.source === f!.id)) r.risk = "revoke";
        if (c.risk) command({ ...c, action: "risk" });
        return { ok: true };
      }
      case "risk": {
        if (!f) return { ok: true };
        if ((riskOrders.get(c.invoice!) ?? -1) > (c.readOrder ?? 0)) return { ok: true };
        riskOrders.set(c.invoice!, c.readOrder ?? 0);
        const risk = risks.get(c.invoice!) === "revoke" ? "revoke" : c.risk!;
        risks.set(c.invoice!, risk);
        if (f!.first?.id === c.invoice) for (const r of rewards.filter(r => r.source === f!.id)) r.risk = r.risk === "revoke" ? "revoke" : risk;
        return { ok: true };
      }
      case "reserve": case "start": {
        const existing = operations.find(o => c.action === "start" ? o.startKey === c.key : o.invoice === c.invoice);
        if (existing) return { ok: true, reservation: { ...existing, policy: rewards.find(r => r.id === existing.reward)!.risk, allowed: rewards.find(r => r.id === existing.reward)!.risk === "clear" } };
        if (c.action === "start" && startChoices.has(c.key!)) return { ok: true, reservation: null };
        if (c.action === "reserve" && c.paid === false) return { ok: true, reservation: null };
        if (c.action === "start" && c.paid === false) { startChoices.set(c.key!, null); return { ok: true, reservation: null }; }
        if (operations.some(o => o.child === c.child && o.state === "reserved")) return { ok: false, error: "unavailable" };
        let selected = rewards.filter(r => r.parent === f!.id && r.risk === "clear" && r.children.get(c.child!) === "unused" && !operations.some(o => o.reward === r.id && o.child === c.child && o.state !== "absent")).sort((a,b) => a.order-b.order)[0];
        if (!selected) {
          for (const r of rewards.filter(r => r.parent === f!.id && !r.started && r.risk === "clear").sort((a,b) => a.order-b.order)) {
            r.started = true; for (const child of new Set([...f!.enrolled,...(c.children ?? []),c.child!])) r.children.set(child, "unused");
            if (r.children.has(c.child!)) { selected = r; break; }
          }
        }
        if (!selected) { if (c.action === "start") startChoices.set(c.key!, null); return { ok: true, reservation: null }; }
        const id = `operation-${++serial}`;
        const op: Operation = { id, key: `referral-${id}`, parent: f!.id, child: c.child!, customer: c.customer!, invoice: c.invoice ?? null, subscription: c.subscription ?? null,
          qualification: selected.kind === "earned" ? family(selected.source).first?.id ?? null : null, allowed: true, policy: "clear", cents: c.cents!, coupon: c.coupon!, product: c.product!, state: "reserved", startKey: c.key ?? null, createdAt: now(), reward: selected.id };
        if (c.action === "start") startChoices.set(c.key!, id);
        operations.push(op); return { ok: true, reservation: { ...op } };
      }
      case "finish": case "start_result": {
        const op = operations.find(o => c.operation ? o.id === c.operation : c.key ? o.startKey === c.key : o.invoice === c.invoice && (!c.coupon || o.coupon === c.coupon));
        if (!op) return { ok: true };
        if (c.invoice) op.invoice = c.invoice;
        if (c.subscription) op.subscription = c.subscription;
        if (op.state === "used") return { ok: true };
        if (c.result === "detached") { op.state = rewards.find(r => r.id === op.reward)!.risk === "revoke" ? "absent" : "applied"; return { ok: true }; }
        if (c.result === "refused" || c.result === "absent") op.state = "absent";
        else if (c.result === "used") { op.state = "used"; rewards.find(r => r.id === op.reward)!.children.set(op.child, "used"); }
        else op.state = "applied";
        return { ok: true };
      }
      case "due": return { ok: true, due: { customers: [...families.values()].filter(f => !f.deleted).flatMap(f => [...f.customers].map(([customer, child]) => ({ parent: f.id, child, customer }))),
        reservations: operations.filter(o => o.state === "reserved" || o.state === "applied").map(o => ({ ...o })),
        emails: rewards.filter(r => r.kind === "earned" && r.risk === "clear" && r.email === null && !family(r.parent).deleted).map(r => ({ reward: r.id, parent: r.parent, email: `${r.parent}@example.test` })) } satisfies ReferralDue };
      case "tried": case "checked": return { ok: true };
      case "preview": {
        const to = [...families.values()].find(f => f.code === c.code && !f.deleted);
        if (!to || to.id === f!.id || !c.actor || !c.reason?.trim()) return { ok: false, error: "invalid" };
        const token = `preview-${++serial}`;
        previews.set(token, { parent: f!.id, from: f!.from, to: to.id, reason: c.reason, actor: c.actor });
        const rs = rewards.filter(r => r.source === f!.id);
        return { ok: true, preview: { token, before: f!.from, after: to.id, used: rs.reduce((n,r) => n + [...r.children.values()].filter(x=>x==="used").length,0), unused: rs.reduce((n,r) => n + [...r.children.values()].filter(x=>x==="unused").length,0), paid: !!f!.first } };
      }
      case "correct": {
        const p = previews.get(c.preview!);
        if (!p || p.actor !== c.actor || p.parent !== f!.id || p.from !== f!.from) return { ok: false, error: "invalid" };
        const earned = rewards.find(r => r.source === f!.id && r.kind === "earned");
        if (earned && !earned.started) earned.parent = p.to;
        else if (!earned && f!.first?.actual) reward(p.to, f!.id, "earned");
        f!.from = p.to; audits.push({ actor: p.actor, reason: p.reason, parent: p.parent }); previews.delete(c.preview!); return { ok: true };
      }
      case "email_claim": {
        const r = rewards.find(r => r.id === c.reward && r.kind === "earned" && r.risk === "clear");
        if (!r || r.email !== null || family(r.parent).deleted) return { ok: true, token: null };
        r.email = c.token!; return { ok: true, token: c.token };
      }
      case "email_admit": { const r = rewards.find(r => r.id === c.reward); return { ok: true, admitted: !!r && r.risk === "clear" && !family(r.parent).deleted }; }
      case "email_result": { const r = rewards.find(r => r.id === c.reward && r.email === c.token); if (r) r.email = c.emailState === "refused" ? null : c.emailState!; return { ok: true }; }
      case "email_copy": return { ok: true };
    }
  };
  const store: ReferralStore = {
    command(c) {
      const result = queue.then(() => command(c)); queue = result.then(() => {}, () => {}); return result;
    },
    async customers(parent) { return [...family(parent).customers.keys()]; },
    async owner(customer) { for (const f of families.values()) { const child = f.customers.get(customer); if (f.customers.has(customer)) return { parent: f.id, child: child ?? null, customer }; } return null; },
    async readOrder() { return ++serial; },
  };
  return { store,
    addFamily(id: string, code: string, children: string[] = []) { families.set(id, { id, code, enrolled: new Set(children), customers: new Map(children.map(child => [`cus-${child}`, child])), deleted: false, complete: true, blocked: false, hadPaid: false, paidAt: null, first: null, from: null, appliedAt: 0, attempts: [] }); },
    addChild(parent: string, child: string, enrolled = true) { const f = family(parent); f.customers.set(`cus-${child}`, child); if (enrolled) f.enrolled.add(child); f.complete = false; },
    deleteChild(parent: string, child: string) { const f = family(parent); if (!f.complete) f.blocked = true; f.enrolled.delete(child); for (const [customer,id] of f.customers) if (id === child) f.customers.set(customer, null); for (const r of rewards) if (r.parent === parent) r.children.delete(child); },
    deleteFamily(parent: string) { const f = family(parent); f.deleted = true; f.code = ""; for (const child of f.enrolled) this.deleteChild(parent, child); },
    snapshot() { return structuredClone({ families: [...families.values()], rewards, operations, audits }); },
  };
}
