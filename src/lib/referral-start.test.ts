import Stripe from "stripe";
import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { startPlan } from "@/lib/stripe";
import { memoryBilling } from "@/lib/billing-memory";
import type { ReferralReservation, StartReferral } from "@/lib/referrals";

function fixture(paid=false) {
 const billing=memoryBilling({children:[{parentId:"p",childId:"c",firstName:"Synthetic",card:{id:"card",customer:"cus",saved:true}}],subscriptions:paid?[{id:"old",customer:"cus",status:"canceled",defaultCard:"pm"}]:[]});
 const requests:URLSearchParams[]=[];const order:string[]=[];
 const s=new Stripe("sk_test_start_referral",{maxNetworkRetries:0,httpClient:Stripe.createFetchHttpClient(async(input,init)=>{
  const u=new URL(String(input)),method=init?.method??"GET",body=new URLSearchParams(String(init?.body??""));
  if(u.pathname==="/v1/subscriptions"&&method==="GET")return Response.json({data:paid?[{id:"old",status:"canceled",customer:"cus",metadata:{},created:1,items:{data:[]}}]:[],has_more:false});
  if(u.pathname==="/v1/products/unica_math")return Response.json({id:"unica_math"});
  if(u.pathname==="/v1/prices")return Response.json({data:[{id:"price",active:true,product:"unica_math",currency:"cad",unit_amount:7999,recurring:{interval:"month",interval_count:1,usage_type:"licensed"}}],has_more:false});
  if(u.pathname==="/v1/customers/cus")return Response.json({id:"cus",invoice_settings:{default_payment_method:{id:"pm",type:"card"}}});
  if(u.pathname==="/v1/subscriptions"&&method==="POST"){order.push("charge");requests.push(body);return Response.json({id:"new",status:paid?"active":"trialing",customer:"cus",metadata:{start_key:body.get("metadata[start_key]")},created:2,items:{data:[]},trial_end:body.get("trial_end")?Number(body.get("trial_end")):null});}
  throw Error("Unexpected provider path "+u.pathname);
 })});
 const reservation:ReferralReservation={id:"op",key:"durable",parent:"p",child:"c",customer:"cus",invoice:null,subscription:null,coupon:"half",product:"unica_math",cents:7999,state:"reserved",createdAt:0,startKey:"start",allowed:true,policy:"clear"};
 const referrals:StartReferral={async reserve(input){order.push("reserve");return {...reservation,startKey:input.key};},async refused(){order.push("refused");}};
 return{billing,s,referrals,requests,order};
}
it("reserves and attaches the referral before an immediate paid Restart can charge",async()=>{
 const f=fixture(true);const result=await startPlan(f.s,{cardSetup:"card",customer:"cus",price:79.99,deliveryConfirmed:false,purpose:"restart"},undefined,f.billing.store,f.referrals);
 expect(result.ok).toBe(true);expect(f.order).toEqual(["reserve","charge"]);expect(f.requests[0].get("discounts[0][coupon]")).toBe("half");expect(f.requests[0].has("trial_end")).toBe(false);
});
it("leaves the shared 30-day trial free and does not reserve or use its coupon",async()=>{
 const f=fixture();await startPlan(f.s,{cardSetup:"card",customer:"cus",price:79.99,deliveryConfirmed:true},undefined,f.billing.store,f.referrals);
 expect(f.order).toEqual(["charge"]);expect(f.requests[0].has("trial_end")).toBe(true);expect(f.requests[0].has("discounts[0][coupon]")).toBe(false);
});
it("sends no immediate charge when durable referral admission fails",async()=>{
 const f=fixture(true);f.referrals.reserve=async()=>{throw Error("Database admission failed");};await expect(startPlan(f.s,{cardSetup:"card",customer:"cus",price:79.99,deliveryConfirmed:false,purpose:"restart"},undefined,f.billing.store,f.referrals)).rejects.toThrow("admission failed");expect(f.requests).toHaveLength(0);
});
