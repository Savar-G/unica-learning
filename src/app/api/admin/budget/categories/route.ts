import { answer, bad, budgetCaller } from "@/lib/budget-route";
import { createCategory } from "@/lib/budget-store";
import { KINDS, parseCategoryName } from "@/lib/budget";

// Adds a category to the budget (D-333), for expenses or for revenue. Admins only.
export async function POST(request: Request) {
  const caller = await budgetCaller(request, { json: true });
  if (caller instanceof Response) return caller;
  const b = caller.body && typeof caller.body === "object" ? (caller.body as Record<string, unknown>) : {};
  const kind = KINDS.find((k) => k === b.kind);
  const name = parseCategoryName(b.name);
  if (!kind) return bad("Choose expense or revenue.");
  if (!name) return bad("Write a category name of 1 to 60 characters.");
  const made = await createCategory(caller.admin, kind, name);
  return made.ok ? Response.json({ ok: true, category: made.value }) : answer(made);
}
