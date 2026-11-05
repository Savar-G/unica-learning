import Stripe from "stripe";
import {createClient} from "@supabase/supabase-js";
import {beforeEach,expect,it,vi} from "vitest";
import type {Database} from "@/lib/database";
const f=vi.hoisted(()=>({db:null as unknown,client:null as unknown}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase-auth",()=>({adminClient:()=>f.db}));
vi.mock("@/lib/stripe",async original=>({...await original<typeof import("@/lib/stripe")>(),stripe:()=>f.client}));
import {adjustedPlan,restartFamilyPlan} from "@/lib/plan-controls-server";
const card="11111111-1111-4111-8111-111111111111";
function fixture(){
 let price=99,generation=0,state="none",revision="",blocked=false,cancelled=false;
 const pauses: unknown[] = [];
 const providerWrites:URLSearchParams[]=[],rpcs:{name:string;body:Record<string,unknown>}[]=[];
 const plans:Record<string,unknown>[]=[{id:"old",status:"canceled",customer:"cus",metadata:{}}];
 const client=new Stripe("sk_test_restart_server",{maxNetworkRetries:0,httpClient:Stripe.createFetchHttpClient(async(input,init)=>{
  const u=new URL(String(input)),method=init?.method??"GET",body=new URLSearchParams(String(init?.body??""));
  if(method==="GET"&&u.pathname==="/v1/subscriptions")return Response.json({data:plans,has_more:false});
  if(method==="GET"&&u.pathname.startsWith("/v1/products/"))return Response.json({id:"unica_math"});
  if(method==="GET"&&u.pathname==="/v1/customers/cus")return Response.json({id:"cus",invoice_settings:{default_payment_method:{id:"pm",type:"card"}}});
  if(method==="POST"&&u.pathname==="/v1/subscriptions"){providerWrites.push(body);const made={id:"new",status:"active",default_payment_method:"pm",trial_end:null,metadata:{start_key:body.get("metadata[start_key]")}};plans.push(made);return Response.json(made);}
  throw Error('Unexpected provider request '+u.pathname);
 })});
 const db=createClient<Database>("https://synthetic.invalid","synthetic",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const u=new URL(String(input)),name=u.pathname.split('/').at(-1)!,body=JSON.parse(String(init?.body??'{}'));
  if(u.pathname.includes('/rpc/')){
   rpcs.push({name,body});
   if(name==='plan_control_context')return Response.json({revision,blocked,cancelled,pauses,child:'child'});
   if(name==='card_recovery_rows')return Response.json(generation?[{card_id:card,customer:'cus',session_id:null,payment_method_id:null,needs_repair:false,start_generation:generation,start_key:'key',start_card:'pm',start_at:new Date().toISOString(),start_state:state,start_subscription:state==='started'?'new':null,start_first_charge:null,start_finished_at:state==='started'?new Date().toISOString():null,start_email:'none',start_alert:null}]:[]);
   if(name==='admit_plan_start_terms'){generation=Number(body.p_generation);state='open';return Response.json({generation,key:body.p_key,card:'pm',at:new Date().toISOString(),state,purpose:'restart',monthly_cents:body.p_monthly_cents,subscription:null,first_charge:null,finished_at:null,email:'none',alert:null});}
   if(name==='finish_plan_start'){state='started';return Response.json(true);}
   if(name==='begin_family_card_operation'||name==='end_family_card_operation')return Response.json(null);
   if(name==='plan_start_terms')return Response.json({purpose:'restart',monthly_cents:7999});
   throw Error('Unexpected RPC '+name);
  }
  if(name==='card_setups')return Response.json(u.searchParams.get('parent_id')==='eq.parent'?{id:card,child_id:'child',stripe_customer_id:'cus',card_saved_at:'2026-10-01',price,plan:'one'}:null);
  throw Error('Unexpected database read '+u.pathname);
 }}});
 f.db=db;f.client=client;
 return {db,pauses,providerWrites,rpcs,plans,cancel:()=>{cancelled=true;},price:(p:number)=>{price=p;},revision:(r:string)=>{revision=r;},block:()=>{blocked=true;},end:()=>{plans[1].status='canceled';}};
}
beforeEach(()=>vi.restoreAllMocks());
it("reads the saved price and owner, starts without a trial and releases only the route hold",async()=>{
 const b=fixture();const q=await restartFamilyPlan('parent',card);expect(q).toMatchObject({ok:true,state:'preview',price:79.99});
 if(!q.ok||!('token'in q))throw Error('missing quote');
 expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:true,state:'started'});
 expect(b.providerWrites[0].get('items[0][price_data][unit_amount]')).toBe('7999');expect(b.providerWrites[0].has('trial_period_days')).toBe(false);
 expect(b.rpcs.some(r=>r.name==='admit_plan_start_terms'&&r.body.p_purpose==='restart')).toBe(true);expect(b.rpcs.some(r=>r.name==='end_family_card_operation')).toBe(true);
 b.end();expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:false,error:'stale'});expect(b.providerWrites).toHaveLength(1);
});
it("refuses foreign ownership, changed price, changed cancellation revision and pending controls before creating",async()=>{
 const b=fixture();expect(await restartFamilyPlan('foreign',card)).toMatchObject({ok:false,error:'not_found'});
 const q=await restartFamilyPlan('parent',card);if(!q.ok||!('token'in q))throw Error('missing quote');
 b.price(40);expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:false,error:'stale'});
 b.price(99);b.revision('cancelled');expect(await restartFamilyPlan('parent',card,q.token)).toMatchObject({ok:false,error:'stale'});
 b.block();expect(await restartFamilyPlan('parent',card)).toMatchObject({ok:false,error:'pending'});expect(b.providerWrites).toHaveLength(0);
});

it("shows confirmed pause dates beside a stored plan, without moving a later renewal or a cancelled plan",async()=>{
 const b=fixture();
 b.pauses.push({state:"applied",quote:{weeks:2,year:2026,used:0,subscription:"sub",kind:"paid",previousCharge:"2026-12-01T18:00:00.000Z",chargeAt:"2026-12-15T18:00:00.000Z",bookId:"book",targetNumber:2,late:false,earliest:null,latest:null,shippedAt:"2026-11-01",deliveredAt:"2026-11-03",today:"2026-11-05"}});
 const plan={kind:"paying" as const,nextCharge:"2026-12-01T18:00:00.000Z",monthly:79.99};
 expect(await adjustedPlan(b.db,"parent",card,plan)).toMatchObject({nextCharge:"2026-12-15T18:00:00.000Z"});
 expect(await adjustedPlan(b.db,"parent",card,{...plan,nextCharge:"2027-01-15T18:00:00.000Z"})).toMatchObject({nextCharge:"2027-01-15T18:00:00.000Z"});
 b.cancel();expect(await adjustedPlan(b.db,"parent",card,plan)).toEqual({kind:"unknown"});
});
