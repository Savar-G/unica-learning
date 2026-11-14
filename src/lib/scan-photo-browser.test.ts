import { afterEach, expect, it, vi } from "vitest";
import { isPageCodeLink, phoneCodeLooks, PHONE_CODE_READS, prepareScanPhoto, scanThumbnail, SMALLER_ENCODING, THUMB_WIDTH } from "./scan-photo-browser";
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
  const drawn: number[][] = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) => drawn.push([w, h]) }),
    toBlob: (done: (blob: Blob) => void) => done(new Blob([new Uint8Array(sizes.shift()!)])) };
  vi.stubGlobal("document", { createElement: () => canvas });
  expect((await prepareScanPhoto({ size: 8_000_000 } as File)).size).toBe(3_500_000);
  expect(drawn).toEqual([[2800, 1867]]); expect(image.close).toHaveBeenCalledOnce();
  // The canvas is freed when done (#9).
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
});
it("says unavailable, not too large, when the browser cannot encode the photo, and still frees the canvas (#9)", async () => {
  const image = { width: 4000, height: 3000, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }), toBlob: (done: (blob: Blob | null) => void) => done(null) };
  vi.stubGlobal("document", { createElement: () => canvas });
  await expect(prepareScanPhoto({ size: 5_000_000 } as File)).rejects.toThrow("unavailable");
  expect(canvas.width).toBe(0); expect(image.close).toHaveBeenCalledOnce();
});
it("encodes smaller after a timeout: about 2000 px at quality 0.75 (#5)", async () => {
  const image = { width: 4000, height: 3000, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
  const drawn: number[][] = [], qualities: number[] = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) => drawn.push([w, h]) }),
    toBlob: (done: (blob: Blob) => void, _type: string, q: number) => { qualities.push(q); done(new Blob(["x"])); } };
  vi.stubGlobal("document", { createElement: () => canvas });
  await prepareScanPhoto({ size: 5_000_000 } as File, SMALLER_ENCODING);
  expect(drawn).toEqual([[2000, 1500]]); expect(qualities).toEqual([0.75]);
});
it("makes a small thumbnail decoded at its small width, and frees what it used (#9)", async () => {
  const image = { width: THUMB_WIDTH, height: 320, close: vi.fn() };
  const decode = vi.fn(async () => image);
  vi.stubGlobal("createImageBitmap", decode);
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob: (done: (blob: Blob) => void) => done(new Blob(["thumb"])) };
  vi.stubGlobal("document", { createElement: () => canvas });
  const photo = new Blob(["photo"]);
  expect(await (await scanThumbnail(photo))!.text()).toBe("thumb");
  expect(decode).toHaveBeenCalledWith(photo, expect.objectContaining({ resizeWidth: THUMB_WIDTH }));
  expect(image.close).toHaveBeenCalledOnce(); expect(canvas.width).toBe(0);
  decode.mockRejectedValueOnce(new Error("cannot decode"));
  expect(await scanThumbnail(photo)).toBeNull();
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
