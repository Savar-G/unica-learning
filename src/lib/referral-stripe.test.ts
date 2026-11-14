import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { referralPages, stripeReferrals, REFERRAL_COUPON_ID } from "@/lib/referral-stripe";

function fixture() {
  const state = { planStatus:"active",status:"draft",amount:5999,paid:0,mode:false,manual:false,refund:0,dispute:"",discounts:[] as unknown[],itemDiscount:false,auto:true,metadata:{} as Record<string,string>,couponPercent:50,couponExists:true };
  const writes: {path:string;body:URLSearchParams;key:string|null}[]=[];
  const coupon=(expanded:boolean)=>({id:REFERRAL_COUPON_ID,livemode:state.mode,valid:true,percent_off:state.couponPercent,amount_off:null,duration:"once",redeem_by:null,max_redemptions:null,...(expanded?{applies_to:{products:["unica_math"]}}:{})});
  const raw=()=>({id:"in_1",customer:"cus_1",parent:{subscription_details:{subscription:"sub_1"}},livemode:state.mode,status:state.status,subtotal:state.amount,amount_paid:state.paid,status_transitions:{paid_at:state.paid?1800000000:null},billing_reason:"subscription_cycle",discounts:state.discounts,auto_advance:state.auto,metadata:state.metadata});
  const client=new Stripe("sk_test_referral",{maxNetworkRetries:0,httpClient:Stripe.createFetchHttpClient(async(input,init)=>{
    const url=new URL(String(input)),path=url.pathname,method=init?.method??"GET",body=new URLSearchParams(String(init?.body??""));
    if(method==="DELETE"&&path==="/v1/invoices/in_1"){writes.push({path,body,key:new Headers(init?.headers).get("Idempotency-Key")});state.status="void";return Response.json({id:"in_1",object:"invoice",deleted:true});}
    if(method==="POST") {
      writes.push({path,body,key:new Headers(init?.headers).get("Idempotency-Key")});
      if(path==="/v1/coupons"){state.couponExists=true;return Response.json(coupon(body.get("expand[0]")==="applies_to"));}
      if(path==="/v1/invoices/in_1") {
        if(body.has("discounts[0][coupon]"))state.discounts=[{id:"di_1",source:{type:"coupon",coupon:REFERRAL_COUPON_ID}}];
        if(body.get("discounts")==="")state.discounts=[];
        if(body.has("auto_advance"))state.auto=body.get("auto_advance")==="true";
        for(const [k,v]of body)if(k.startsWith("metadata[")){if(v)state.metadata[k.slice(9,-1)]=v;else delete state.metadata[k.slice(9,-1)];}
        return Response.json(raw());
      }
      if(path.endsWith("/void")){state.status="void";return Response.json(raw());}
    }
    if(path==="/v1/customers/cus_1")return Response.json({id:"cus_1",livemode:state.mode,discount:null});
    if(path==="/v1/invoices/in_1")return Response.json(raw());
    if(path==="/v1/invoices")return Response.json({data:[raw()],has_more:false});
    if(path==="/v1/subscriptions/sub_1")return Response.json({id:"sub_1",livemode:state.mode,customer:"cus_1",metadata:{start_key:"start-1"},status:state.planStatus});
    if(path==="/v1/invoices/in_1/lines")return Response.json({data:[{id:"il_1",pricing:{price_details:{price:"price_1"}},parent:{subscription_item_details:{proration:false}},discounts:state.itemDiscount?["other-item-discount"]:[]}],has_more:false});
    if(path==="/v1/prices/price_1")return Response.json({id:"price_1",livemode:state.mode,product:"unica_math",recurring:{interval:"month",interval_count:1}});
    if(path==="/v1/invoice_payments")return Response.json({data:state.manual?[]:[{id:"ip_1",status:"paid",amount_paid:state.paid,payment:{type:"payment_intent",payment_intent:"pi_1"}}],has_more:false});
    if(path==="/v1/payment_intents/pi_1")return Response.json({id:"pi_1",livemode:state.mode,customer:"cus_1",status:"succeeded",amount_received:state.paid,latest_charge:"ch_1"});
    if(path==="/v1/charges/ch_1")return Response.json({id:"ch_1",livemode:state.mode,customer:"cus_1",paid:true,status:"succeeded",captured:true,amount_captured:state.paid,amount_refunded:state.refund});
    if(path==="/v1/disputes")return Response.json({data:state.dispute?[{id:"dp_1",livemode:state.mode,status:state.dispute}]:[],has_more:false});
    if(path===`/v1/coupons/${REFERRAL_COUPON_ID}`)return state.couponExists?Response.json(coupon(url.searchParams.get("expand[0]")==="applies_to")):Response.json({error:{type:"invalid_request_error",code:"resource_missing",message:"Missing coupon"}},{status:404});
    throw Error(`Unexpected request ${method} ${path}`);
  })});
  const provider=stripeReferrals(client,false);
  return {state,writes,provider};
}
const reservation={id:"op",key:"referral-op-0",parent:"p",child:"c",customer:"cus_1",invoice:"in_1",subscription:"sub_1",coupon:REFERRAL_COUPON_ID,product:"unica_math",cents:5999,state:"reserved" as const,startKey:null,createdAt:0,allowed:true,policy:"clear" as const};

describe("Stripe referral adapter uses current provider objects",()=>{
 it("expands the product restriction on the first coupon creation",async()=>{
  const f=fixture();f.state.couponExists=false;expect(await f.provider.coupon()).toEqual({id:REFERRAL_COUPON_ID,product:"unica_math"});
  expect(f.writes[0].body.get("applies_to[products][0]")).toBe("unica_math");
 });
 it("applies a validated 50 percent once coupon with frozen parameters and a durable key",async()=>{
  const f=fixture();await f.provider.coupon();const i=await f.provider.invoice("in_1");await f.provider.apply(i,reservation);await f.provider.apply(i,reservation);
  expect(f.writes).toHaveLength(1);expect(f.writes[0].body.get("discounts[0][coupon]")).toBe(REFERRAL_COUPON_ID);expect(f.writes[0].key).toBe(reservation.key);
 });
 it("refuses a changed invoice price before any provider write",async()=>{
  const f=fixture();f.state.amount=3999;await expect(f.provider.apply(await f.provider.invoice("in_1"),reservation)).rejects.toThrow("frozen invoice");expect(f.writes).toHaveLength(0);
 });
 it.each(["invoice","item"])("keeps an unrelated %s discount",async kind=>{
  const f=fixture();if(kind==="invoice")f.state.discounts=[{id:"di_other",source:{type:"coupon",coupon:"other"}}];else f.state.itemDiscount=true;
  const invoice=await f.provider.invoice("in_1");expect(invoice.otherDiscount).toBe(true);await expect(f.provider.apply(invoice,reservation)).rejects.toThrow("not editable");expect(f.writes).toHaveLength(0);
 });
 it("does not qualify manually marked paid and requires a successful current card charge",async()=>{
  const f=fixture();f.state.status="paid";f.state.paid=3000;f.state.manual=true;expect((await f.provider.invoice("in_1")).actualPayment).toBe(false);
  f.state.manual=false;expect((await f.provider.invoice("in_1")).actualPayment).toBe(true);
 });
 it.each([[1000,"","clear"],[3000,"","revoke"],[0,"needs_response","hold"],[0,"won","clear"],[0,"lost","revoke"]] as const)("reads current refund %i and dispute %s as %s",async(refund,dispute,risk)=>{
  const f=fixture();f.state.status="paid";f.state.paid=3000;f.state.refund=refund;f.state.dispute=dispute;expect((await f.provider.invoice("in_1")).risk).toBe(risk);
 });
 it("rejects wrong mode and a coupon with the wrong amount",async()=>{
  const f=fixture();f.state.mode=true;await expect(f.provider.invoice("in_1")).rejects.toThrow("mode mismatch");f.state.mode=false;f.state.couponPercent=100;await expect(f.provider.coupon()).rejects.toThrow("coupon mismatch");expect(f.writes).toHaveLength(0);
 });
 it("keeps the finalized monthly receivable when revocation follows a collection hold",async()=>{
  const f=fixture();await f.provider.apply(await f.provider.invoice("in_1"),reservation);f.state.status="open";
  await f.provider.withdraw!(await f.provider.invoice("in_1"),{...reservation,policy:"hold",allowed:false});expect(f.state.auto).toBe(false);
  await f.provider.apply(await f.provider.invoice("in_1"),{...reservation,key:"referral-op-2"});expect(f.state.auto).toBe(true);
  await f.provider.withdraw!(await f.provider.invoice("in_1"),{...reservation,policy:"hold",allowed:false});
  expect(await f.provider.withdraw!(await f.provider.invoice("in_1"),{...reservation,policy:"revoke",allowed:false})).toBe("committed");
  expect(f.state.status).toBe("open");expect(f.state.auto).toBe(true);
  expect((await f.provider.invoice("in_1")).couponIds).toEqual([REFERRAL_COUPON_ID]);
  expect(f.writes.some(w=>w.path.endsWith("/void"))).toBe(false);
 });
 it("requires complete pagination and rejects a missing continuation flag",async()=>{
  const seen:(string|undefined)[]=[];expect(await referralPages(async after=>{seen.push(after);return after?{data:[{id:"two"}],has_more:false}:{data:[{id:"one"}],has_more:true};})).toHaveLength(2);expect(seen).toEqual([undefined,"one"]);
  await expect(referralPages(async()=>({data:[{id:"one"}],has_more:true}))).rejects.toThrow("cursor repeated");
  await expect(referralPages(async()=>({data:[],has_more:undefined as unknown as boolean}))).rejects.toThrow("unreadable");
 });
});


it("retires an unpaid invoice only after the current subscription is ended",async()=>{
 const f=fixture();await f.provider.apply(await f.provider.invoice("in_1"),reservation);f.state.status="open";
 expect(await f.provider.retire!(reservation)).toBe("pending");expect(f.writes).toHaveLength(1);
 f.state.planStatus="canceled";expect(await f.provider.retire!(reservation)).toBe("absent");expect(f.writes.at(-1)?.path).toBe("/v1/invoices/in_1/void");
});
it("deletes an ended subscription's draft before its benefit can be reused",async()=>{
 const f=fixture();await f.provider.apply(await f.provider.invoice("in_1"),reservation);f.state.planStatus="canceled";
 expect(await f.provider.retire!(reservation)).toBe("absent");expect(f.state.status).toBe("void");expect(f.writes.at(-1)?.key).toBe("referral-op-0-retire-draft");
});
it("preserves an uncollectible monthly receivable after current revocation",async()=>{
 const f=fixture();await f.provider.apply(await f.provider.invoice("in_1"),reservation);f.state.status="uncollectible";
 expect(await f.provider.withdraw!(await f.provider.invoice("in_1"),{...reservation,policy:"revoke",allowed:false})).toBe("committed");expect(f.state.status).toBe("uncollectible");
 expect(f.writes.some(w=>w.path.endsWith("/void"))).toBe(false);
});
