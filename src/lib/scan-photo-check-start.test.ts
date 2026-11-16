import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sharp from 'sharp';
const state = vi.hoisted(() => ({ bytes: new Uint8Array(), tags: [] as unknown[] }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/product-monitoring', () => ({ monitorProduct: vi.fn() }));
vi.mock('@/lib/decision-price', () => ({ withPriceGuard: (client: unknown) => client, livePriceGuard: async () => {} }));
vi.mock('@/lib/ai-usage', async (original) => ({ ...await original(), recordAiUsage: (tag: unknown) => state.tags.push(tag) }));
vi.mock('@/lib/scan-photo-check-store', async (original) => ({
  ...await original(),
  photoCheckStore: () => ({ eligible: async () => true, claim: async () => true, straight: async () => state.bytes, finish: async () => true }),
}));
import { startPhotoCheck } from '@/lib/scan-photo-check-start';
beforeEach(() => { vi.clearAllMocks(); state.tags.length = 0; });
afterEach(() => { state.tags.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('records the verified child owner from the parent-scoped photo', async () => {
  vi.stubEnv('SCAN_MARKING_OPENROUTER_API_KEY', 'synthetic-marking-key');
  vi.stubEnv('PHOTO_CHECK_FAKE', '');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'gen-photo-probe', usage: { cost: 0.01 }, answers: { blurry: { type: 'noul', noul: 0.04 } } }))));
  state.bytes = new Uint8Array(await sharp({ create: { width: 300, height: 300, channels: 3, background: '#ffffff' } }).png().toBuffer());
  const knownChild = '00000000-0000-0000-0000-000000000002';
  const filters: unknown[] = [];
  const query = { select: vi.fn(() => query), eq: vi.fn((key: string, value: string) => { filters.push([key, value]); return query; }), abortSignal: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: { child_id: knownChild }, error: null })) };
  const from = vi.fn((table: string) => { expect(table).toBe('scan_photos'); return query; });
  await startPhotoCheck({ from } as never, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', async run => { await run(); });
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(state.tags).toHaveLength(1);
  expect(state.tags[0]).toEqual({ feature: 'photo_check', childId: knownChild, parentId: '00000000-0000-0000-0000-000000000001', source: { kind: 'scan_photo', id: '00000000-0000-0000-0000-000000000003' } });
  expect(state.tags[0]).toHaveProperty('childId', knownChild);
  expect(filters).toEqual([['id', '00000000-0000-0000-0000-000000000003'], ['parent_id', '00000000-0000-0000-0000-000000000001']]);
});


it("retains unknown child ownership when the scoped owner read fails", async () => {
  vi.stubEnv("SCAN_MARKING_OPENROUTER_API_KEY", "synthetic-marking-key");
  vi.stubEnv("PHOTO_CHECK_FAKE", "");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "gen-photo-unknown-owner", usage: { cost: 0.01 }, answers: { blurry: { type: "noul", noul: 0.04 } } }))));
  state.bytes = new Uint8Array(await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer());
  const from = vi.fn(() => { throw new Error("owner unavailable"); });
  await startPhotoCheck({ from } as never, "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000003", async run => { await run(); });
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(state.tags).toHaveLength(1);
  expect(state.tags[0]).not.toHaveProperty("childId");
});
