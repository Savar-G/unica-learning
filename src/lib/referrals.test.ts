import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyReferral, reconcileReferralInvoice, recordReferralInvoice, recoverReferrals, referralOverview, referralStarts, type ReferralInvoice, type ReferralProvider, type ReferralReservation } from "@/lib/referrals";
import { memoryReferrals } from "@/lib/referrals-memory";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { sendReferralRewards } from "@/lib/referral-email";

const origin = "https://unica.test";
function fixture() {
  let time = 1_800_000_000_000;
  const memory = memoryReferrals(() => time);
  memory.addFamily("source", "U-SOURCE1", ["a", "b"]);
  memory.addFamily("new", "U-NEWNEW1", ["c", "d"]);
  const invoices = new Map<string, ReferralInvoice>();
  const applied: ReferralReservation[] = [], withdrawn: ReferralReservation[] = [];
  const fail = { history: false, afterApply: false, mode: false };
  const provider: ReferralProvider = {
    async invoices(customer) { if (fail.history) throw Error("History unreadable"); return [...invoices.values()].filter(i => i.customer === customer).map(i => ({ ...i, couponIds: [...i.couponIds] })); },
    async invoice(id) { const i = invoices.get(id); if (!i) throw Error("Missing invoice"); return { ...i, modeMatches: !fail.mode, couponIds: [...i.couponIds] }; },
    async coupon() { return { id: "half", product: "unica_math" }; },
    async apply(invoice, reservation) { if (!invoices.get(invoice.id)!.couponIds.includes("half")) { applied.push({ ...reservation }); invoices.get(invoice.id)!.couponIds = ["half"]; } if (fail.afterApply) throw Error("Response lost"); },
    async withdraw(invoice, reservation) { withdrawn.push(reservation); invoices.get(invoice.id)!.couponIds = []; },
    async startResult(r) { const i = [...invoices.values()].find(i => i.startKey === r.startKey); return { invoice: i ?? null, absent: !i }; },
  };
  const services = { store: memory.store, provider };
  const invoice = (id: string, child: string, over: Partial<ReferralInvoice> = {}) => {
    const item: ReferralInvoice = { id, customer: `cus-${child}`, subscription: `sub-${child}`, status: "paid", cents: 7999, paidCents: 4000,
      paidAt: time + 1000, actualPayment: true, modeMatches: true, program: true, monthly: true, renewal: true, risk: "clear", couponIds: [], otherDiscount: false, ...over };
    invoices.set(id, item); return item;
  };
  const redeem = () => applyReferral("new", " u-source1 ", services, origin);
  const earn = async (id = "paid", child = "c") => { const i = invoice(id, child); await recordReferralInvoice(i, services); return i; };
  return { memory, services, fail, invoice, invoices, applied, withdrawn, redeem, earn, advance: (ms: number) => { time += ms; } };
}
const draft = { status: "draft" as const, paidCents: 0, paidAt: null, actualPayment: false };

describe("referral public commands", () => {
  it("normalizes a permanent code and never exposes the other family's identity", async () => {
    const f = fixture(); const result = await f.redeem();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overview.appliedCode).toBe("U-SOURCE1");
    expect(result.overview.shareUrl).toBe("https://unica.test/start?referral=U-NEWNEW1");
    expect(Object.keys(result.overview).sort()).toEqual(["appliedCode","benefitApplied","canApply","code","pendingReferrals","rewardsEarned","rewardsRemaining","shareUrl"]);
    expect((await referralOverview("source", f.services, origin))).toMatchObject({ ok: true, overview: { pendingReferrals: 1 } });
  });
  it.each([
    ["trial", { paidCents: 0, cents: 0, actualPayment: false }],
    ["failed", { status: "open", actualPayment: false }],
    ["manual", { actualPayment: false }],
    ["other product", { program: false }],
    ["one-off", { subscription: null }],
  ] as const)("does not qualify a %s invoice", async (_name, over) => {
    const f = fixture(); await f.redeem(); await recordReferralInvoice(f.invoice("no", "c", over), f.services);
    expect(f.memory.snapshot().rewards.filter(r => r.kind === "earned")).toHaveLength(0);
  });
  it("serializes duplicate and concurrent sibling payments into one reward and notification", async () => {
    const f = fixture(); await f.redeem();
    const first = f.invoice("first", "c"), sibling = f.invoice("sibling", "d");
    await Promise.all([first,first,sibling,sibling].map(i => recordReferralInvoice(i, f.services)));
    expect(f.memory.snapshot().rewards.filter(r => r.kind === "earned")).toHaveLength(1);
    const transport = memoryTransport();
    await Promise.all([sendReferralRewards(f.services.store, transport.transport, origin, () => true),sendReferralRewards(f.services.store, transport.transport, origin, () => true)]);
    expect(transport.delivered).toHaveLength(1);
    expect(transport.delivered[0].text).not.toContain("new");
  });
  it("keeps an unknown email claim and recovers refused or deferred sends", async () => {
    const f = fixture(); await f.redeem(); await f.earn();
    const transport = memoryTransport(); transport.answerNext("refuse", "lose_answer");
    await sendReferralRewards(f.services.store, transport.transport, origin, () => false);
    await sendReferralRewards(f.services.store, transport.transport, origin, () => true);
    await sendReferralRewards(f.services.store, transport.transport, origin, () => true);
    await sendReferralRewards(f.services.store, transport.transport, origin, () => true);
    expect(transport.delivered).toHaveLength(1);
    expect(f.memory.snapshot().rewards.find(r => r.kind === "earned")?.email).toBe("unknown");
  });
  it.each([7999,5999,3999])( "discounts the existing %i-cent invoice without changing its price", async cents => {
    const f = fixture(); await f.redeem(); f.invoice("draft", "c", { ...draft, cents });
    await reconcileReferralInvoice("draft", f.services);
    expect(f.applied[0]).toMatchObject({ cents, coupon: "half" });
    expect(f.invoices.get("draft")!.cents).toBe(cents);
  });
  it("never consumes a zero trial or replaces an unrelated discount", async () => {
    const f = fixture(); await f.redeem();
    f.invoice("zero", "c", { ...draft, cents: 0 }); f.invoice("other", "c", { ...draft, otherDiscount: true });
    await reconcileReferralInvoice("zero", f.services); await reconcileReferralInvoice("other", f.services);
    expect(f.applied).toHaveLength(0); expect(f.memory.snapshot().operations).toHaveLength(0);
  });
  it("freezes enrolled children, excludes assessment-only children and admits later children only to later rewards", async () => {
    const f = fixture(); f.memory.addChild("new", "assessment", false); await f.redeem();
    f.invoice("first", "c", draft); await reconcileReferralInvoice("first", f.services);
    f.memory.addChild("new", "later");
    const incoming = f.memory.snapshot().rewards.find(r => r.kind === "incoming")!;
    expect([...incoming.children.keys()].sort()).toEqual(["c","d"]);
    f.invoice("later-invoice", "later", draft); await reconcileReferralInvoice("later-invoice", f.services);
    expect(f.applied).toHaveLength(1);
  });
  it("lets an active sibling use separate later rewards while another sibling waits", async () => {
    const f = fixture(); await f.redeem(); await f.earn();
    f.memory.addFamily("second", "U-SECOND1", ["e"]);
    await applyReferral("second","U-SOURCE1",f.services,origin);
    await recordReferralInvoice(f.invoice("second-paid","e"), f.services);
    f.invoice("a-one", "a", draft); await reconcileReferralInvoice("a-one", f.services);
    Object.assign(f.invoices.get("a-one")!, { status: "paid", paidCents: 4000, actualPayment: true, couponIds: ["half"] });
    await recordReferralInvoice(f.invoices.get("a-one")!, f.services);
    f.invoice("a-two", "a", draft); await reconcileReferralInvoice("a-two", f.services);
    expect(f.applied.map(o => o.invoice)).toEqual(["a-one","a-two"]);
    const rs=f.memory.snapshot().rewards.filter(r=>r.parent==="source");
    expect(rs[0].children.get("b")).toBe("unused"); expect(rs).toHaveLength(2);
  });
  it("retains the reservation after accepted write/response loss and retries no second benefit", async () => {
    const f = fixture(); await f.redeem(); f.invoice("draft","c",draft); f.fail.afterApply = true;
    await expect(reconcileReferralInvoice("draft",f.services)).rejects.toThrow("Response lost");
    f.advance(60*86400000); f.fail.afterApply = false;
    await recoverReferrals(f.services,()=>true);
    expect(f.applied).toHaveLength(1); expect(f.memory.snapshot().operations).toHaveLength(1);
  });
  it("keeps an uncertain immediate start even when no subscription is yet visible", async () => {
    const f = fixture(); await f.redeem();
    const reservation = await referralStarts(f.services).reserve({card:"card",customer:"cus-c",key:"frozen",cents:5999});
    expect(reservation).toMatchObject({cents:5999,startKey:"frozen"}); f.advance(100*86400000);
    await recoverReferrals(f.services,()=>true);
    expect(f.memory.snapshot().operations[0].state).toBe("reserved");
    const again=await referralStarts(f.services).reserve({card:"card",customer:"cus-c",key:"frozen",cents:7999});
    expect(again?.cents).toBe(5999);
  });
  it("freezes the absence of a reward under the immediate-start key", async () => {
    const f=fixture(); const starts=referralStarts(f.services);
    expect(await starts.reserve({card:"a",customer:"cus-a",key:"no-discount",cents:7999})).toBeNull();
    await f.redeem(); await f.earn();
    expect(await starts.reserve({card:"a",customer:"cus-a",key:"no-discount",cents:7999})).toBeNull();
    expect(await starts.reserve({card:"a",customer:"cus-a",key:"later-key",cents:7999})).not.toBeNull();
  });
  it.each(["hold","revoke"] as const)("withdraws an unused discount on current %s risk",async risk=>{
    const f=fixture();await f.redeem();const paid=await f.earn();f.invoice("benefit","a",draft);await reconcileReferralInvoice("benefit",f.services);
    paid.risk=risk;await recordReferralInvoice(paid,f.services);await reconcileReferralInvoice("benefit",f.services);
    expect(f.withdrawn).toHaveLength(1);expect(f.invoices.get("benefit")!.couponIds).toEqual([]);
    if(risk==="hold"){paid.risk="clear";await recordReferralInvoice(paid,f.services);await reconcileReferralInvoice("benefit",f.services);expect(f.invoices.get("benefit")!.couponIds).toEqual(["half"]);}
  });
  it("keeps used discounts and rejects reordered risk revival",async()=>{
    const f=fixture();await f.redeem();const paid=await f.earn();f.invoice("used","a",draft);await reconcileReferralInvoice("used",f.services);
    const used=f.invoices.get("used")!;Object.assign(used,{status:"paid",paidCents:4000,couponIds:["half"]});await recordReferralInvoice(used,f.services);
    await f.services.store.command({action:"risk",parent:"new",invoice:paid.id,risk:"revoke",readOrder:1000});
    await f.services.store.command({action:"risk",parent:"new",invoice:paid.id,risk:"clear",readOrder:999});
    const reward=f.memory.snapshot().rewards.find(r=>r.kind==="earned")!;
    expect(reward.risk).toBe("revoke");expect(reward.children.get("a")).toBe("used");expect(reward.children.get("b")).toBe("unused");
  });
  it("refuses self-referral, unreadable history, old paid families and a wrong provider mode",async()=>{
    const f=fixture();expect(await applyReferral("source","U-SOURCE1",f.services,origin)).toMatchObject({ok:false,error:"self_referral"});
    f.fail.history=true;expect(await f.redeem()).toMatchObject({ok:false,error:"unavailable"});f.fail.history=false;
    f.invoice("old","d",{actualPayment:false});expect(await f.redeem()).toMatchObject({ok:false,error:"already_paid"});
    f.fail.mode=true;await expect(reconcileReferralInvoice("old",f.services)).rejects.toThrow("mode mismatch");
  });
  it("counts invalid attempts and makes retries of a confirmed code idempotent",async()=>{
    const f=fixture();await f.redeem();await f.redeem();expect(f.memory.snapshot().rewards.filter(r=>r.kind==="incoming")).toHaveLength(1);
    for(let i=0;i<11;i++)await applyReferral("new","unknown",f.services,origin);
    expect(await applyReferral("new","unknown",f.services,origin)).toMatchObject({ok:false,error:"rate_limited"});
  });
  it("retains lifetime payment history and other entitlements after child and source-family deletion",async()=>{
    const f=fixture();await f.redeem();await f.earn();f.memory.deleteChild("new","c");
    expect(f.memory.snapshot().families.find(f=>f.id==="new")?.hadPaid).toBe(true);
    f.memory.deleteFamily("new");expect(f.memory.snapshot().rewards.filter(r=>r.parent==="source"&&r.kind==="earned")).toHaveLength(1);
    f.invoice("survivor","b",draft);await reconcileReferralInvoice("survivor",f.services);expect(f.applied).toHaveLength(1);
  });
  it("audits a previewed correction without creating another award or rewriting used benefits",async()=>{
    const f=fixture();await f.redeem();await f.earn();f.memory.addFamily("correct","U-CORRECT1",["z"]);
    f.invoice("used","a",draft);await reconcileReferralInvoice("used",f.services);
    const p=await f.services.store.command({action:"preview",parent:"new",actor:"admin",code:"U-CORRECT1",reason:"Correct code supplied"});
    expect(p.preview?.unused).toBe(2);
    await f.services.store.command({action:"correct",parent:"new",actor:"admin",preview:p.preview!.token});
    expect(f.memory.snapshot().audits).toHaveLength(1);expect(f.memory.snapshot().rewards.filter(r=>r.kind==="earned")).toHaveLength(1);
    expect(f.memory.snapshot().rewards.find(r=>r.kind==="earned")!.parent).toBe("source");
  });
});

it("returns an unused cancelled invoice benefit to the same child's paid Restart",async()=>{
 const f=fixture();await f.redeem();f.invoice("old-unpaid","c",draft);await reconcileReferralInvoice("old-unpaid",f.services);
 let retired=0;f.services.provider.retire=async()=>{retired++;return "absent";};
 const result=await referralStarts(f.services).reserve({card:"card",customer:"cus-c",key:"restart",cents:5999});
 expect(retired).toBe(1);expect(result?.coupon).toBe("half");expect(f.memory.snapshot().operations.map(o=>o.state)).toEqual(["absent","reserved"]);
});
it("reads the qualifying payment again before an earned discount can be dispatched",async()=>{
 const f=fixture();await f.redeem();const source=await f.earn();source.risk="revoke";
 f.invoice("draft","a",draft);await reconcileReferralInvoice("draft",f.services);
 expect(f.applied).toHaveLength(0);expect(f.memory.snapshot().rewards.find(r=>r.kind==="earned")!.risk).toBe("revoke");
});
it("keeps a confirmed incoming benefit after the source code is removed by deletion",async()=>{
 const f=fixture();await f.redeem();f.memory.deleteFamily("source");const result=await referralOverview("new",f.services,origin);
 expect(result).toMatchObject({ok:true,overview:{appliedCode:null,benefitApplied:true,canApply:false}});
});
it("waits for an actual subscription payment after a manual paid mark",async()=>{
 const f=fixture();await f.redeem();await recordReferralInvoice(f.invoice("manual","c",{actualPayment:false}),f.services);
 expect(f.memory.snapshot().rewards.filter(r=>r.kind==="earned")).toHaveLength(0);
 f.advance(2000);await f.earn("actual","c");expect(f.memory.snapshot().rewards.filter(r=>r.kind==="earned")).toHaveLength(1);
});
