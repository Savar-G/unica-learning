import { afterEach, expect, it, vi } from "vitest";
import { prepareScanPhoto } from "./scan-photo-browser";
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
