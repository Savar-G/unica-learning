// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({children,href}: {children: React.ReactNode;href:string}) => createElement("a",{href},children) }));
import { FeedbackForm } from "@/components/feedback-form";
let root: Root, host: HTMLDivElement;
const fetcher=vi.fn();
beforeEach(async()=>{
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",fetcher);fetcher.mockReset();host=document.createElement("div");document.body.append(host);root=createRoot(host);
  await act(async()=>root.render(createElement(FeedbackForm,{initialProduct:"workbook"})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const text=()=>host.querySelector<HTMLTextAreaElement>("textarea")!;
async function type(value:string) {await act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(text(),value);
  text().dispatchEvent(new Event("input",{bubbles:true}));
});}
const send=()=>act(async()=>{host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
const reply=(ok:boolean,error?:string)=>new Response(JSON.stringify({ok,...(error?{error}:{})}),{status:ok?200:503});
it("has exactly two visible fields, labels, and one Send action",()=>{
  expect(host.querySelectorAll("select,textarea,input")).toHaveLength(2);expect(host.querySelectorAll("button")).toHaveLength(1);
  for(const field of host.querySelectorAll("select,textarea"))expect(host.querySelector(`label[for="${field.id}"]`)).not.toBeNull();
  expect(text().hasAttribute("maxlength")).toBe(false);
});
it("requires an explicit product on a plain form, keeps text and sends nothing until one is chosen",async()=>{
  await act(async()=>root.render(createElement(FeedbackForm,{key:"plain"})));
  const select=host.querySelector("select")!;
  expect(select.value).toBe("");expect(select.selectedOptions[0].textContent).toBe("Choose a product");
  expect([...select.options].some(o=>o.value==="other"&&o.textContent==="Something else")).toBe(true);
  await type("Keep these words.");await send();
  expect(text().value).toBe("Keep these words.");expect(fetcher).not.toHaveBeenCalled();
  const alert=host.querySelector("[role=alert]")!;
  expect(alert.textContent).toBe("Choose a product before you send your feedback.");
  expect(select.parentElement?.contains(alert)).toBe(true);expect(select.parentElement?.classList.contains("bad")).toBe(true);
  expect(select.getAttribute("aria-invalid")).toBe("true");expect(select.getAttribute("aria-describedby")).toBe(alert.id);
  expect(document.activeElement).toBe(alert);
  await act(async()=>{select.value="other";select.dispatchEvent(new Event("change",{bubbles:true}));});
  fetcher.mockResolvedValueOnce(reply(true));await send();expect(JSON.parse(fetcher.mock.calls[0][1].body).product).toBe("other");
});
it("keeps a contextual preselected product ready to send",async()=>{
  await act(async()=>root.render(createElement(FeedbackForm,{key:"context",initialProduct:"marking"})));
  expect(host.querySelector("select")!.value).toBe("marking");
  await type("A marking question.");fetcher.mockResolvedValueOnce(reply(true));await send();
  expect(JSON.parse(fetcher.mock.calls[0][1].body).product).toBe("marking");
});
it("shows empty and long refusals, keeps full input, associates the error and moves focus",async()=>{
  await send();expect(host.querySelector("[role=alert]")?.textContent).toContain("Write your feedback");expect(document.activeElement?.id).toBe("feedback-result");
  await type("x".repeat(5001));await send();expect(text().value).toHaveLength(5001);expect(host.querySelector("[role=alert]")?.textContent).toContain("5,000");
  expect(text().getAttribute("aria-invalid")).toBe("true");expect(text().getAttribute("aria-describedby")).toContain("feedback-result");expect(fetcher).not.toHaveBeenCalled();
});
it.each(["", "x".repeat(5001)])("places the text refusal beside its field with the existing error token classes",async value=>{
  await type(value);await send();const alert=host.querySelector("[role=alert]")!;
  expect(text().parentElement?.contains(alert)).toBe(true);expect(alert.classList.contains("err")).toBe(true);
  expect(text().parentElement?.classList.contains("bad")).toBe(true);expect(document.activeElement).toBe(alert);
});
it("reuses the request id after an uncertain write, then clears only after confirmed success",async()=>{
  await type("Please add more room.");fetcher.mockRejectedValueOnce(Error("lost response"));await send();expect(text().value).toBe("Please add more room.");
  const first=JSON.parse(fetcher.mock.calls[0][1].body);fetcher.mockResolvedValueOnce(reply(true));await send();
  expect(JSON.parse(fetcher.mock.calls[1][1].body).requestId).toBe(first.requestId);expect(text().value).toBe("");expect(host.querySelector("[role=status]")?.textContent).toContain("feedback is saved");
});
it("uses a new request for changed text and for a conflict retry",async()=>{
  await type("First message");fetcher.mockResolvedValueOnce(reply(false,"unavailable"));await send();
  await type("Changed message");fetcher.mockResolvedValueOnce(reply(false,"conflict"));await send();
  fetcher.mockResolvedValueOnce(reply(true));await send();const ids=fetcher.mock.calls.map(c=>JSON.parse(c[1].body).requestId);expect(new Set(ids).size).toBe(3);
});
it("keeps input after signed-out or malformed responses and never claims success",async()=>{
  await type("Keep this message");fetcher.mockResolvedValueOnce(reply(false,"signed_out"));await send();expect(host.querySelector('a[href^="/sign-in?next="]')).not.toBeNull();expect(text().value).toBe("Keep this message");
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ok:true}),{status:503}));await send();expect(host.querySelector("[role=status]")).toBeNull();expect(text().value).toBe("Keep this message");
});
it("disables fields while sending and ignores simultaneous submit events",async()=>{
  await type("One message");let finish:(r:Response)=>void=()=>{};fetcher.mockImplementationOnce(()=>new Promise<Response>(r=>{finish=r;}));
  await act(async()=>{const form=host.querySelector("form")!;form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
  expect(fetcher).toHaveBeenCalledTimes(1);expect(host.querySelector("button")?.disabled).toBe(true);expect(text().disabled).toBe(true);
  await act(async()=>finish(reply(true)));expect(host.querySelector("button")?.disabled).toBe(false);
});
