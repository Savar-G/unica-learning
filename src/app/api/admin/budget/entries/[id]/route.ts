import { answer, bad, budgetCaller } from "@/lib/budget-route";
import { deleteEntry, setSettled, updateEntry } from "@/lib/budget-store";
import { isUuid, parseEntry } from "@/lib/budget";

// One budget entry (D-333). PATCH with { settled } ticks "split settled" on an expense; PATCH with a whole entry changes
// it; DELETE hides it (the database keeps it and its change log). Admins only.
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/budget/entries/[id]">) {
  const caller = await budgetCaller(request, { json: true });
  if (caller instanceof Response) return caller;
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const body = caller.body;
  if (body && typeof body === "object" && Object.keys(body).length === 1 && "settled" in body) {
    if (typeof body.settled !== "boolean") return bad("Settled is true or false.");
    return answer(await setSettled(caller.admin, id, body.settled));
  }
  const entry = parseEntry(body);
  if (!entry.ok) return bad(entry.error);
  return answer(await updateEntry(caller.admin, id, entry.value));
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/budget/entries/[id]">) {
  const caller = await budgetCaller(request, { json: false });
  if (caller instanceof Response) return caller;
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  return answer(await deleteEntry(caller.admin, id));
}
