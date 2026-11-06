import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
vi.mock("server-only",()=>({}));
import { feedbackStore, listFeedback } from "@/lib/feedback-store";
it("uses the parent's id and permits only a known admission answer",async()=>{
  const rpc=vi.fn().mockResolvedValue({data:"duplicate",error:null});const db={rpc} as unknown as SupabaseClient<Database>;
  const input={requestId:"request",childId:null,product:"other" as const,text:"Message",source:"/account"};
  expect(await feedbackStore(db).submit("session-parent",input)).toBe("duplicate");
  expect(rpc).toHaveBeenCalledWith("submit_feedback",{p_parent:"session-parent",p_request:"request",p_child:null,p_product:"other",p_text:"Message",p_source:"/account"});
  rpc.mockResolvedValueOnce({data:{ok:true},error:null});await expect(feedbackStore(db).submit("session-parent",input)).rejects.toThrow("invalid store result");
});
it("filters in the database and reads a stable newest-first bounded page with a lookahead",async()=>{
  const order=vi.fn(),eq=vi.fn(),range=vi.fn().mockResolvedValue({data:Array.from({length:51},(_,i)=>({id:String(i)})),error:null});
  const query={select:()=>query,order,eq,range};order.mockReturnValue(query);eq.mockReturnValue(query);
  const from=vi.fn(()=>query);const db={from} as unknown as SupabaseClient<Database>;
  const result=await listFeedback(db,"marking",2);expect(from).toHaveBeenCalledWith("feedback");expect(eq).toHaveBeenCalledWith("product","marking");
  expect(order.mock.calls).toEqual([["created_at",{ascending:false}],["id",{ascending:false}]]);expect(range).toHaveBeenCalledWith(50,100);expect(result.rows).toHaveLength(50);expect(result.more).toBe(true);
  eq.mockClear();await listFeedback(db,null,1);expect(eq).not.toHaveBeenCalled();
  range.mockResolvedValueOnce({data:null,error:{code:"read_failed"}});await expect(listFeedback(db,null,1)).rejects.toThrow("read_failed");
});
