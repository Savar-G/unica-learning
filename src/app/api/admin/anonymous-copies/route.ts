import { adminSession, anonymousTestRows } from "@/lib/admin-store";
import { anonymousCopiesCsv, anonymousCopiesJson } from "@/lib/anonymous-copy-export";

// The copies without names (#201, D-119), for admins: ?format=csv (one row per question) or ?format=json (every copy,
// whole). Test families are left out unless ?test=1 (D-099). The rows are read with the admin's own session, so the
// database's admin read policy decides. Everyone else gets 404.
export async function GET(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  if (format !== "csv" && format !== "json") return new Response("Unsupported format", { status: 400 });
  const options = { includeTestFamilies: url.searchParams.get("test") === "1" };
  const rows = await anonymousTestRows(admin);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(format === "csv" ? anonymousCopiesCsv(rows, options) : anonymousCopiesJson(rows, options), {
    headers: {
      "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="anonymous-tests-${day}.${format}"`,
      "cache-control": "no-store",
    },
  });
}
