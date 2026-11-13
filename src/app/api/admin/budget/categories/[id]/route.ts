import { answer, bad, budgetCaller } from "@/lib/budget-route";
import { renameCategory } from "@/lib/budget-store";
import { isUuid, parseCategoryName } from "@/lib/budget";

// Renames one budget category (D-333). A category is never deleted. Admins only.
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/budget/categories/[id]">) {
  const caller = await budgetCaller(request, { json: true });
  if (caller instanceof Response) return caller;
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const name = parseCategoryName(caller.body && typeof caller.body === "object" ? (caller.body as Record<string, unknown>).name : null);
  if (!name) return bad("Write a category name of 1 to 60 characters.");
  return answer(await renameCategory(caller.admin, id, name));
}
