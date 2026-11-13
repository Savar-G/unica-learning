import { answer, bad, budgetCaller } from "@/lib/budget-route";
import { setDefaultRate } from "@/lib/budget-store";
import { parseRate } from "@/lib/budget";

// Sets the USD to CAD rate that a new USD budget entry starts from (D-333). Old entries keep their own rate. Admins only.
export async function PUT(request: Request) {
  const caller = await budgetCaller(request, { json: true });
  if (caller instanceof Response) return caller;
  const rate = parseRate(caller.body && typeof caller.body === "object" ? (caller.body as Record<string, unknown>).rate : null);
  if (rate === null) return bad("Enter a rate above 0 and under 100.");
  return answer(await setDefaultRate(caller.admin, rate));
}
