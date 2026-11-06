import Stripe from "stripe";
import { afterEach, expect, it, vi } from "vitest";
import { customerPlan } from "@/lib/parent-plan-server";
import { stripePauses } from "@/lib/plan-pause-stripe";
import type { PauseOperation } from "@/lib/plan-pause";
vi.mock("server-only", () => ({}));
afterEach(()=>vi.useRealTimers());
const charge="2027-01-01T18:00:00.000Z", next="2027-01-15T18:00:00.000Z";
const subscription=(extra:Record<string,unknown>={})=>({id:"sub",status:"active",customer:"cus",billing_mode:{type:"flexible"},collection_method:"charge_automatically",cancel_at_period_end:false,cancel_at:null,schedule:null as string|null,metadata:{},items:{data:[{quantity:1,current_period_end:Date.parse(charge)/1000,price:{currency:"cad",recurring:{interval:"month",interval_count:1,usage_type:"licensed"}}}]},...extra});
const operation=(kind:"paid"|"trial"="paid"):PauseOperation=>({id:"operation",state:"open",send:true,quote:{weeks:2,used:0,year:2026,subscription:"sub",kind,previousCharge:charge,chargeAt:next,bookId:"book",targetNumber:2,late:false,earliest:"2026-11-20",latest:"2026-12-10",shippedAt:"2026-11-01T18:00:00Z",deliveredAt:"2026-11-03T18:00:00Z",today:"2026-11-05"}});
function fixture(extra:Record<string,unknown>={},answer?:unknown,loseResponse=false){
 const requests:{method:string;path:string;body:URLSearchParams;key:string|null}[]=[];
 const current=subscription(extra); let schedule:unknown=answer;
 const client=new Stripe("sk_test_synthetic_pause",{maxNetworkRetries:0,httpClient:Stripe.createFetchHttpClient(async(input,init)=>{
  const url=new URL(String(input)),method=init?.method??"GET",body=new URLSearchParams(String(init?.body??""));
  requests.push({method,path:url.pathname,body,key:new Headers(init?.headers).get("idempotency-key")});
  if(method==="GET"&&url.pathname==="/v1/subscriptions")return Response.json({data:[current],has_more:false});
  if(method==="GET"&&url.pathname.startsWith("/v1/subscription_schedules/"))return Response.json(schedule);
  if(method==="GET"&&url.pathname==="/v1/subscription_schedules")return Response.json({data:schedule?[schedule]:[],has_more:false});
  if(method==="POST"&&url.pathname==="/v1/subscription_schedules"){
   if(body.has("from_subscription")&&[...body.keys()].some(k=>k.startsWith("metadata[")))return Response.json({error:{type:"invalid_request_error",message:"You cannot set `metadata` if `from_subscription` is set."}},{status:400});
   if((body.get("pause_schedules[0][key]")?.length??0)>40)return Response.json({error:{type:"invalid_request_error",param:"pause_schedules[0][key]",message:"Must be at most 40 characters"}},{status:400});
   schedule=answer??{id:"schedule",status:"active",subscription:"sub",metadata:{},pause_schedules:[{key:body.get("pause_schedules[0][key]"),pause:{pause_at:Date.parse(charge)/1000,status:{type:"scheduled"}},resume:{status:{type:"scheduled"},resume_at:Date.parse(next)/1000,settings:{billing_cycle_anchor:"resume_at",payment_behavior:"resume_on_payment_success",proration_behavior:"none"}}}]};
   current.schedule="schedule";if(loseResponse)throw Error("Synthetic lost response");return Response.json(schedule);
  }
  if(method==="POST"&&url.pathname==="/v1/subscriptions/sub")return Response.json({id:"sub",metadata:{plan_pause_key:body.get("metadata[plan_pause_key]")},trial_end:Number(body.get("trial_end"))});
  throw Error('Unexpected request '+url.pathname);
 })});
 return {client,provider:stripePauses(client,async(parent,card)=>parent==="p"&&card==="c"?"cus":null),requests,current,release:()=>{if(!schedule||typeof schedule!=="object")throw Error("No schedule");Object.assign(schedule,{subscription:null,released_subscription:"sub",status:"released"});current.schedule=null;}};
}
it("uses native renewal pause and resume through the real SDK transport, with no trial or credit",async()=>{
 const f=fixture(),o=operation();expect(await f.provider.apply("p","c",o)).toBe("applied");
 const write=f.requests.find(r=>r.method==="POST")!;expect(write.path).toBe("/v1/subscription_schedules");expect(write.key).toBe("plan-pause-operation");
 expect(write.body.get("from_subscription")).toBe("sub");
 expect(write.body.get("pause_schedules[0][key]")).toBe("operation");
 expect([...write.body.keys()].some(k=>k.startsWith("metadata["))).toBe(false);
 expect(write.body.get("pause_schedules[0][pause][pause_at][timestamp]")).toBe(String(Date.parse(charge)/1000));
 expect(write.body.get("pause_schedules[0][resume][resume_at][timestamp]")).toBe(String(Date.parse(next)/1000));
 expect(write.body.get("pause_schedules[0][resume][settings][billing_cycle_anchor]")).toBe("resume_at");
 expect(write.body.get("pause_schedules[0][resume][settings][payment_behavior]")).toBe("resume_on_payment_success");
 expect(write.body.get("pause_schedules[0][pause][settings][bill_for][unused_time_from][type]")).toBe("none");
 expect([...write.body.keys()].some(k=>k.includes("trial")||k.includes("pause_collection"))).toBe(false);
 expect(await f.provider.recover("p","c",{...o,send:false})).toBe(true);
 expect(await customerPlan(f.client,"cus")).toMatchObject({kind:"paying",nextCharge:next});
});
it("extends only the existing first trial, with no prorations",async()=>{
 const f=fixture({status:"trialing",trial_end:Date.parse(charge)/1000,metadata:{trial_start_reason:"workbook_delivered"}});
 expect(await f.provider.apply("p","c",operation("trial"))).toBe("applied");
 const w=f.requests.find(r=>r.method==="POST")!;expect(w.path).toBe("/v1/subscriptions/sub");expect(w.body.get("trial_end")).toBe(String(Date.parse(next)/1000));expect(w.body.get("proration_behavior")).toBe("none");
});
it.each([{billing_mode:{type:"classic"}},{schedule:"existing"},{status:"past_due"},{cancel_at_period_end:true},{status:"trialing",trial_end:Date.parse(charge)/1000,metadata:{}}])("refuses unsupported plan state %j",async(extra)=>{
 const f=fixture(extra);expect(await f.provider.plan("p","c")).toBeNull();expect(await f.provider.apply("p","c",operation())).toBe("refused");expect(f.requests.filter(r=>r.method==="POST")).toHaveLength(0);
});
it("requires current ownership and exact matching schedule proof",async()=>{
 const f=fixture({}, {id:"other",subscription:"sub",metadata:{plan_pause_key:"other"},pause_schedules:[]});
 expect(await f.provider.plan("other","c")).toBeNull();expect(f.requests).toHaveLength(0);
 expect(await f.provider.apply("p","c",operation())).toBe("pending");expect(await f.provider.recover("p","c",operation())).toBe(false);
});
it("refuses an elapsed renewal before any provider command",async()=>{
 vi.useFakeTimers();vi.setSystemTime(Date.parse(charge));const f=fixture();expect(await f.provider.apply("p","c",operation())).toBe("refused");expect(f.requests.filter(r=>r.method==="POST")).toHaveLength(0);
});

it("recovers a matching pause after its schedule completed and detached",async()=>{
 const f=fixture();expect(await f.provider.apply("p","c",operation())).toBe("applied");f.release();
 expect(await f.provider.recover("p","c",operation())).toBe(true);
 expect(f.requests.at(-1)?.path).toBe("/v1/subscription_schedules");
});

it("recovers a lost create response by the exact pause key without sending another command",async()=>{
 const f=fixture({},undefined,true),o=operation();
 expect(await f.provider.apply("p","c",o)).toBe("pending");
 expect(await f.provider.recover("p","c",{...o,send:false})).toBe(true);
 expect(f.requests.filter(r=>r.method==="POST")).toHaveLength(1);
 expect(await f.provider.recover("p","c",{...o,id:"another-operation"})).toBe(false);
 expect(await f.provider.recover("p","c",{...o,quote:{...o.quote,chargeAt:"2027-01-22T18:00:00.000Z"}})).toBe(false);
});

it("does not accept schedule metadata in place of the pause entry's operation key",async()=>{
 const f=fixture({}, {id:"schedule",subscription:"sub",metadata:{plan_pause_key:"operation"},pause_schedules:[{key:"other-operation",pause:{pause_at:Date.parse(charge)/1000},resume:{resume_at:Date.parse(next)/1000,settings:{billing_cycle_anchor:"resume_at",payment_behavior:"resume_on_payment_success",proration_behavior:"none"}}}]});
 expect(await f.provider.apply("p","c",operation())).toBe("pending");
 expect(await f.provider.recover("p","c",operation())).toBe(false);
});

it("fits a durable operation UUID within Stripe's 40-character pause-entry limit",async()=>{
 const f=fixture(),o={...operation(),id:"11111111-2222-4333-8444-555555555555"};
 expect(await f.provider.apply("p","c",o)).toBe("applied");
 expect(f.requests.find(r=>r.method==="POST")!.body.get("pause_schedules[0][key]")).toBe(o.id);
 expect(await f.provider.recover("p","c",o)).toBe(true);
});
