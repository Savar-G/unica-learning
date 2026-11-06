import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({allowed:true,db:{},list:vi.fn()}));
vi.mock("@/lib/admin-store",()=>({requireAdmin:async()=>{if(!state.allowed)throw Error("notFound");return {db:state.db,email:"admin@example.invalid"};}}));
vi.mock("@/lib/feedback-store",()=>({listFeedback:state.list}));
vi.mock("@/components/admin",()=>({AdminFrame:()=>null}));
vi.mock("@/components/admin-feedback",()=>({AdminFeedbackList:()=>null}));
import FeedbackAdminPage from "./page";
const page=(query={})=>FeedbackAdminPage({searchParams:Promise.resolve(query)} as Parameters<typeof FeedbackAdminPage>[0]);
beforeEach(()=>{state.allowed=true;state.list.mockReset().mockResolvedValue({rows:[],more:false});});
it("runs requireAdmin before any list read",async()=>{state.allowed=false;await expect(page()).rejects.toThrow("notFound");expect(state.list).not.toHaveBeenCalled();});
it("passes only a known product, a bounded page and the admin session to the store",async()=>{
  await page({product:"maya",page:"2"});expect(state.list).toHaveBeenLastCalledWith(state.db,"maya",2);
  await page({product:"unknown",page:"9999999999999999999999"});expect(state.list).toHaveBeenLastCalledWith(state.db,null,1);
});
