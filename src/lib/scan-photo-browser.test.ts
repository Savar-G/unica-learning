import { afterEach, expect, it, vi } from "vitest";
import { isPageCodeLink, phoneCodeLooks, PHONE_CODE_READS, prepareScanPhoto } from "./scan-photo-browser";
afterEach(() => vi.unstubAllGlobals());
it("refuses oversized camera input before decoding", async () => {
  const decode = vi.fn(); vi.stubGlobal("createImageBitmap", decode);
  await expect(prepareScanPhoto({ size: 20 * 1024 * 1024 + 1 } as File)).rejects.toThrow("size");
  expect(decode).not.toHaveBeenCalled();
});
it("bounds the network JPEG and releases the decoded camera bitmap", async () => {
  const image = { width: 6000, height: 4000, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
  const sizes = [3_500_001, 3_500_000];
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }),
    toBlob: (done: (blob: Blob) => void) => done(new Blob([new Uint8Array(sizes.shift()!)])) };
  vi.stubGlobal("document", { createElement: () => canvas });
  expect((await prepareScanPhoto({ size: 8_000_000 } as File)).size).toBe(3_500_000);
  expect(canvas.width).toBe(2800); expect(canvas.height).toBe(1867); expect(image.close).toHaveBeenCalledOnce();
});
it("refuses excessive decoded pixels and releases the bitmap", async () => {
  const image = { width: 8001, height: 6000, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
  await expect(prepareScanPhoto({ size: 1000 } as File)).rejects.toThrow("image");
  expect(image.close).toHaveBeenCalledOnce();
});

const page = "https://unicalearning.com/tutor/p/abcdefghijklmnop";

it("accepts only a workbook page's code, the shape the server accepts", () => {
  expect(isPageCodeLink(page)).toBe(true);
  for (const other of ["http://unicalearning.com/tutor/p/abcdefghijklmnop", "https://example.com/tutor/p/abcdefghijklmnop", `${page}?x=1`, `${page}#a`, "https://unicalearning.com/tutor/p/short", "not a link"])
    expect(isPageCodeLink(other), other).toBe(false);
});

it("reads the whole photo first, then each quarter at 2x, and stops at the first page code (#915)", async () => {
  const seen: string[] = [];
  const look = await phoneCodeLooks(async (r) => { seen.push(`${r.zoom}:${r.x},${r.y}`); return seen.length === 3 ? page : seen.length === 2 ? "https://example.com/x" : null; });
  expect(look).toBe("read");
  expect(seen).toEqual(["1:0,0.5", "1:0,0", "2:0,0.5"]);
  expect(PHONE_CODE_READS).toHaveLength(6);
});

it("says unread only after every read, and nothing when out of time or a read fails", async () => {
  expect(await phoneCodeLooks(async () => null)).toBe("unread");
  let t = 0;
  expect(await phoneCodeLooks(async () => { t += 3000; return null; }, 4000, () => t)).toBeNull();
  expect(await phoneCodeLooks(async () => { throw new Error("canvas"); })).toBeNull();
});
