import { answer, bad, budgetCaller } from "@/lib/budget-route";
import { createEntry } from "@/lib/budget-store";
import { parseEntry } from "@/lib/budget";

// Adds one expense or one payment received to the budget (D-333). Admins only; the checks are in src/lib/budget.ts.
export async function POST(request: Request) {
  const caller = await budgetCaller(request, { json: true });
  if (caller instanceof Response) return caller;
  const entry = parseEntry(caller.body);
  if (!entry.ok) return bad(entry.error);
  return answer(await createEntry(caller.admin, entry.value));
}
