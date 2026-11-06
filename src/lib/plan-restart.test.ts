import { expect, it, vi } from "vitest";
import { memoryBilling } from "@/lib/billing-memory";
import { startPlan } from "@/lib/stripe";
vi.mock("server-only", () => ({}));
const family = () => memoryBilling({
  children: [{ parentId: "p", childId: "c", firstName: "Leah", card: { id: "card", customer: "cus", saved: true } }],
  paymentMethods: { cus: [{ id: "pm", type: "card" }] },
  subscriptions: [{ id: "old", customer: "cus", status: "canceled", defaultCard: "pm" }],
});
it("refuses a second free month through the existing admin start", async () => {
  const b = family();
  expect(await startPlan(b.stripe, { cardSetup: "card", customer: "cus", price: 79.99, deliveryConfirmed: true }, undefined, b.store)).toEqual({ ok: false, error: "restart_required" });
  expect(b.subscriptions).toHaveLength(1);
});

import Stripe from "stripe";
import { planPrice } from "@/lib/subscription-plan";
function paidFixture({ lose = false, refuse = false } = {}) {
  const b=family();
  const writes: {body:URLSearchParams;key:string}[]=[];
  const plans: {id:string;status:string;default_payment_method:string;metadata:Record<string,string>;trial_end:null}[]=[];
  const keys=new Map<string,typeof plans[number]>();
  let customerCard="pm", land:(()=>void)|null=null, during:(()=>Promise<void>)|null=null;
  const client=new Stripe("sk_test_paid_restart",{maxNetworkRetries:0,httpClient:Stripe.createFetchHttpClient(async(input,init)=>{
    const url=new URL(String(input)), method=init?.method??"GET", body=new URLSearchParams(String(init?.body??""));
    if(method==="GET"&&url.pathname==="/v1/subscriptions")return Response.json({data:[{id:"old",status:"canceled",metadata:{},trial_end:1},...plans],has_more:false});
    if(method==="GET"&&url.pathname.startsWith("/v1/products/"))return Response.json({id:"unica_math"});
    if(method==="GET"&&url.pathname==="/v1/customers/cus")return Response.json({id:"cus",invoice_settings:{default_payment_method:{id:customerCard,type:"card"}}});
    if(method==="POST"&&url.pathname==="/v1/subscriptions"){
      const key=new Headers(init?.headers).get("idempotency-key")!;writes.push({body,key});await during?.();during=null;
      if(refuse)return Response.json({error:{type:"invalid_request_error",message:"Refused"}},{status:402});
      let p=keys.get(key);if(!p){p={id:"new-"+(keys.size+1),status:"active",default_payment_method:body.get("default_payment_method")!,metadata:{start_key:body.get("metadata[start_key]")!},trial_end:null};keys.set(key,p);}
      const created=p;land=()=>{if(!plans.includes(created))plans.push(created);};
      if(lose)throw Error("Synthetic lost response");land();return Response.json(p);
    }
    if(method==="POST"&&url.pathname.startsWith("/v1/subscriptions/")){plans.find(p=>url.pathname.endsWith(p.id))!.default_payment_method=body.get("default_payment_method")!;return Response.json({id:"new"});}
    if(method==="POST"&&url.pathname==="/v1/customers/cus"){customerCard=body.get("invoice_settings[default_payment_method]")!;return Response.json({id:"cus"});}
    throw Error(`Unexpected ${method} ${url.pathname}`);
  })});
  const start=(purpose:"initial"|"restart"="restart",price=79.99)=>startPlan(client,{cardSetup:"card",customer:"cus",price,deliveryConfirmed:true,purpose},new Date("2026-11-05T18:00:00Z"),b.store);
  return {b,writes,plans,start,land:()=>land?.(),during:(fn:()=>Promise<void>)=>{during=fn;}};
}
it("charges immediately without trial fields, reminder fields or a future anchor",async()=>{
 const f=paidFixture();const result=await f.start("restart",planPrice(99,"one"));expect(result).toMatchObject({ok:true,firstChargeAt:"2026-11-05T18:00:00.000Z"});
 const body=f.writes[0].body;
 expect(body.get("items[0][price_data][unit_amount]")).toBe("7999");expect(body.get("payment_behavior")).toBe("error_if_incomplete");
 expect(body.get("metadata[start_reason]")).toBe("paid_restart");expect([...body.keys()].filter(k=>/trial|billing_cycle_anchor|reminder/.test(k))).toEqual([]);
 expect(f.b.planStarts.get("card")?.[0]).toMatchObject({purpose:"restart",monthlyCents:7999,state:"started",email:"none",firstCharge:null});
 expect(planPrice(49,"one")).toBe(49);
});
it("concurrent paid confirmations use one key and create one subscription",async()=>{
 const f=paidFixture();const result=await Promise.all([f.start(),f.start(),f.start()]);expect(result.some(r=>r.ok)).toBe(true);
 expect(new Set(f.writes.map(w=>w.key)).size).toBe(1);expect(f.plans).toHaveLength(1);expect(f.b.planStarts.get("card")).toHaveLength(1);
});
it("a lost paid create remains open and cannot be retried as a free month",async()=>{
 const f=paidFixture({lose:true});expect(await f.start()).toEqual({ok:false,error:"unconfirmed"});
 expect(f.b.planStarts.get("card")?.[0].state).toBe("open");expect(await f.start("initial")).toEqual({ok:false,error:"wrong_mode"});expect(f.writes).toHaveLength(1);
 f.land();expect(await f.start()).toMatchObject({ok:true,subscription:"new-1"});expect(f.b.planStarts.get("card")?.[0]).toMatchObject({state:"started",email:"none"});expect(f.writes).toHaveLength(1);
});
it("a refused paid start can retry without receiving a trial",async()=>{
 const f=paidFixture({refuse:true});expect(await f.start()).toEqual({ok:false,error:"payment_refused"});expect(f.b.planStarts.get("card")?.[0].state).toBe("refused");
 expect(await f.start()).toEqual({ok:false,error:"payment_refused"});expect(f.b.planStarts.get("card")).toHaveLength(2);expect(f.writes.every(w=>!w.body.has("trial_period_days"))).toBe(true);
});
it("a card update during paid creation converges on the newest saved card",async()=>{
 const f=paidFixture();f.during(()=>f.b.store.recordCard("card",{parentId:"p",session:"new-session",created:200,paymentMethod:"pm_new"}).then(()=>{}));
 expect((await f.start()).ok).toBe(true);expect(f.plans[0].default_payment_method).toBe("pm_new");
});
it("does not replay an older open record without frozen price terms",async()=>{
 const f=paidFixture({lose:true});await f.start();const record=f.b.planStarts.get("card")![0];record.monthlyCents=null;
 expect(await f.start()).toEqual({ok:false,error:"unconfirmed"});expect(f.writes).toHaveLength(1);expect(record.state).toBe("open");
});
