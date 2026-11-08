// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({path:"/account"}));
vi.mock("next/navigation",()=>({usePathname:()=>state.path}));
vi.mock("next/link",()=>({default:({href,children}: {href:string;children:React.ReactNode})=>createElement("a",{href},children)}));
import { AccountFeedbackLink } from "./account-feedback-link";
it("exposes Feedback on legacy parent pages and never on the Desk, test or public pages",()=>{
  for(const path of ["/account","/account/finish","/account/password","/account/report/report-id"]){state.path=path;expect(renderToStaticMarkup(createElement(AccountFeedbackLink))).toContain('href="/account/feedback?from=');}
  for(const path of ["/tutor","/tutor/p/token","/account/test/child","/account/start/child","/contact"]){state.path=path;expect(renderToStaticMarkup(createElement(AccountFeedbackLink))).toBe("");}
});
