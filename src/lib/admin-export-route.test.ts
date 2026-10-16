import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPORT_DATASETS, EXPORT_FORMATS, exportHref, type ExportReader } from "@/lib/admin-export";
import { memoryExportReader, type ExportData } from "@/lib/admin-export-memory";

// The export route (#200): admins only, a download of one dataset, streamed. The admin store is a stub: `admin` is the
// signed-in admin or null (a parent, a visitor, a forged cookie), and the reader is the in-memory one, counted.
let admin: { userId: string; email: string } | null = null;
let reads = 0;
let failAt: number | null = null;
let data: Partial<ExportData> = {};
vi.mock("@/lib/admin-store", () => ({
  adminSession: async () => admin,
  exportReader: (): ExportReader => {
    const inner = memoryExportReader(data);
    const read = <T,>(f: () => Promise<T>) => {
      if (failAt !== null && reads === failAt) throw new Error("connection reset");
      reads++;
      return f();
    };
    return {
      testFamilies: () => read(() => inner.testFamilies()),
      page: (...args) => read(() => inner.page(...args)),
      ofTests: (...args) => read(() => inner.ofTests(...args)),
    };
  },
}));
const { GET } = await import("@/app/api/admin/export/route");

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const test = (n: number) => ({ id: uuid(n), parent_id: uuid(1000 + n), child_id: uuid(2000 + n), grade: 3, province: "BC", status: "completed" });
const get = (query: string) => GET(new Request(`https://unicalearning.com/api/admin/export?${query}`));

describe("the export route", () => {
  beforeEach(() => {
    admin = { userId: uuid(9999), email: "admin@example.com" };
    reads = 0;
    failAt = null;
    data = { assessments: Array.from({ length: 250 }, (_, i) => test(i + 1)), testFamilies: [uuid(1001)] };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("is not found for anyone who is not an admin, and reads nothing", async () => {
    admin = null;
    const res = await get("dataset=tests&format=csv");
    expect(res.status).toBe(404);
    expect(reads).toBe(0);
  });

  it("downloads the dataset as a CSV file that is never cached, without the test families", async () => {
    const res = await get("dataset=tests&format=csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="unica-tests-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // The bytes: text() drops the byte order mark, as a spreadsheet does when it reads the file.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes).split("\r\n");
    expect(lines[0].startsWith("id,created_at,parent_id")).toBe(true);
    // The header, 249 tests and the empty string after the last line break.
    expect(lines).toHaveLength(251);
    expect(lines.some((l) => l.startsWith(uuid(1)))).toBe(false);
  });

  it("downloads JSON, with the test families when asked for", async () => {
    const res = await get("dataset=tests&format=json&tests=1");
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/filename="unica-tests-\d{4}-\d{2}-\d{2}-with-test-families\.json"$/);
    expect(await res.json()).toHaveLength(250);
  });

  it("starts the download before it has read every page", async () => {
    const res = await get("dataset=tests&format=csv");
    // The test families and the first page of tests; the other pages are read as the download goes.
    expect(reads).toBe(2);
    await res.text();
    expect(reads).toBeGreaterThan(3);
  });

  it("answers every download link of the export page with that dataset in that format", async () => {
    for (const { id } of EXPORT_DATASETS) for (const format of EXPORT_FORMATS) for (const withTests of [false, true]) {
      const res = await GET(new Request(`https://unicalearning.com${exportHref({ dataset: id, format, withTests })}`));
      expect(res.status).toBe(200);
      const name = res.headers.get("content-disposition")!;
      expect(name).toContain(`unica-${id.replaceAll("_", "-")}-`);
      expect(name.endsWith(`${withTests ? "-with-test-families" : ""}.${format}"`)).toBe(true);
      await res.arrayBuffer();
    }
  });

  it("refuses a dataset or a format it does not know", async () => {
    expect((await get("dataset=parents&format=csv")).status).toBe(400);
    expect((await get("dataset=tests&format=xlsx")).status).toBe(400);
    expect((await get("format=csv")).status).toBe(400);
    expect(reads).toBe(0);
  });

  it("answers that it could not read the database when the first read fails", async () => {
    failAt = 0;
    const res = await get("dataset=tests&format=csv");
    expect(res.status).toBe(503);
  });

  it("cuts the download with an error when a later read fails, so a part never looks like the whole file", async () => {
    failAt = 3;
    const res = await get("dataset=tests&format=json");
    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow("connection reset");
  });
});
