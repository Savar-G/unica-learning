import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
const f=vi.hoisted(()=>({running:vi.fn(),stop:vi.fn()}));
vi.mock("@/lib/stripe",()=>({runningPlans:f.running,stopPlanNow:f.stop}));
vi.mock("@/lib/family-delete-server",()=>({supabaseDeleteStore:()=>({hold:async()=>"held"})}));
import { childDeletePlans, childDeleteStore, runChildDeletion } from "./child-delete-server";

function database(rows: Record<string,unknown[]>, rpcData: Record<string,unknown> = {}) {
 const filters: Record<string,unknown>[]=[];
 const db={
  from:(table:string)=>{
   const chosen:Record<string,unknown>={table}; filters.push(chosen);
   const q={select:()=>q,eq:(k:string,v:unknown)=>{chosen[k]=v;return q;},neq:(k:string,v:unknown)=>{chosen[`not_${k}`]=v;return q;},limit:()=>q,
    then:(resolve:(v:unknown)=>unknown)=>resolve({data:rows[table] ?? [],error:null})};return q;
  },
  rpc:vi.fn(async(name:string)=>({data:rpcData[name],error:null})),
 };
 return {db:db as unknown as SupabaseClient<Database>,filters,rpc:db.rpc};
}
beforeEach(()=>vi.resetAllMocks());
it("selects only this child's customer and refuses an unresolved saved card",async()=>{
 const h=database({card_setups:[{stripe_customer_id:null,card_saved_at:"today"}]});
 await expect(childDeletePlans(h.db,{} as Stripe,"child").customers("parent")).rejects.toThrow("unresolved");
 expect(h.filters[0]).toMatchObject({table:"card_setups",child_id:"child",parent_id:"parent"});
 expect(f.running).not.toHaveBeenCalled();expect(f.stop).not.toHaveBeenCalled();
});
it("refuses a customer also used by a sibling",async()=>{
 const h=database({card_setups:[{stripe_customer_id:"cus_shared",card_saved_at:"today"}]});
 await expect(childDeletePlans(h.db,{} as Stripe,"child").customers("parent")).rejects.toThrow("shared");
 expect(h.filters[1]).toMatchObject({stripe_customer_id:"cus_shared",not_child_id:"child"});
 expect(f.stop).not.toHaveBeenCalled();
});
it("a child with no card has no Stripe calls, and a historical booking needs support",async()=>{
 const h=database({});expect(await childDeletePlans(h.db,{} as Stripe,"child").customers("parent")).toEqual([]);
 const booked=database({booking_family_links:[{signup_id:"old"}]});
 await expect(childDeletePlans(booked.db,{} as Stripe,"child").customers("parent")).rejects.toThrow("Historical");
 expect(f.stop).not.toHaveBeenCalled();
});
it("an unknown start or family deletion blocks the shared request store",async()=>{
 const h=database({}, {check_child_deletion:"busy"});
 expect(await childDeleteStore(h.db,"child").check("parent")).toBe("busy");
 expect(await childDeleteStore(h.db,"child").hold("parent","token")).toBe("busy");
});
it("a second worker changes nothing when the claim belongs to another worker",async()=>{
 const h=database({}, {claim_child_deletion:false});
 expect(await runChildDeletion(h.db,"parent","child")).toBe("pending");
 expect(h.rpc).toHaveBeenCalledTimes(1);
});
