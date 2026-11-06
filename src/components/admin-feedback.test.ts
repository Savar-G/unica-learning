import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/components/admin-pending",()=>({AdminPending:()=>null}));
import { AdminFeedbackList } from "./admin-feedback";
it("renders saved feedback as text, keeps line breaks and product filters in paging links",()=>{
  const html=renderToStaticMarkup(createElement(AdminFeedbackList,{product:"marking",page:2,more:true,rows:[{id:"sample",parent_id:"parent",child_id:null,product:"marking",text:'<script>alert("x")</script>\nNext line',source:"/account/scan",created_at:"2026-11-06T20:00:00Z",status:"new"}]}));
  expect(html).not.toContain("<script>");expect(html).toContain("&lt;script&gt;");expect(html).toContain("white-space:pre-wrap");
  expect(html).toContain('href="/admin/parents/parent"');expect(html).toContain("product=marking&amp;page=3");expect(html).toContain('value="marking" selected=""');
});
