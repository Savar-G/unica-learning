// Local controlled workbook execution. This guard never stores keys, prompts or answers.
import { mkdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
const rates = { 'claude-sonnet-5-5': { input: 2, output: 10 }, 'claude-haiku-5-5': { input: .5, output: 2.5 } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const amount = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export async function workbookAnthropicBudget({ file, childId, limitUsd, countFetch = globalThis.fetch }) {
  if (!childId || !amount(limitUsd) || limitUsd <= 0 || limitUsd > 35) throw Error('Invalid authorized workbook budget');
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  try { await writeFile(file, JSON.stringify({ childId, limitUsd, spentUsd: 0, calls: [] }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  async function transaction(change) {
    const lock = `${file}.lock`;
    let held = false;
    for (let i = 0; i < 100; i++) {
      try { await mkdir(lock, { mode: 0o700 }); held = true; break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await sleep(20); }
    }
    if (!held) throw Error('Workbook budget is locked; no request sent');
    try {
      const state = JSON.parse(await readFile(file, 'utf8'));
      if (!object(state) || state.halted || state.childId !== childId || state.limitUsd !== limitUsd || !amount(state.spentUsd) || !Array.isArray(state.calls)
        || state.calls.some(c => !object(c) || typeof c.id !== 'string' || !['reserved', 'settled', 'validation-rejected'].includes(c.status) || !amount(c.reservedUsd))) throw Error('Workbook budget is invalid; no request sent');
      const result = change(state);
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
      await rename(temp, file);
      return result;
    } finally { await rmdir(lock); }
  }
  await transaction(() => undefined);
  return {
    state: () => transaction(s => ({ limitUsd: s.limitUsd, spentUsd: s.spentUsd,
      reservedUsd: s.calls.filter(c => c.status === 'reserved').reduce((sum, c) => sum + c.reservedUsd, 0), calls: s.calls.length })),
    wrap: send => async (url, init) => {
      const endpoint = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      if (endpoint.origin !== 'https://api.anthropic.com' || endpoint.pathname !== '/v1/messages' || init?.method !== 'POST') throw Error('Unapproved workbook API endpoint');
      const body = JSON.parse(String(init.body));
      const price = typeof body.model === 'string' && Object.hasOwn(rates, body.model) ? rates[body.model] : null;
      if (!price || !Number.isInteger(body.max_tokens) || body.max_tokens <= 0 || body.max_tokens > 16000 || body.fallbacks || body.tools?.length || body.service_tier || body.inference_geo || /"(?:cache_control|image|document)"\s*:/.test(String(init.body))) throw Error('Unpriced workbook API configuration');
      init.signal?.throwIfAborted();
      const headers = new Headers(init.headers); headers.delete('content-length');
      const counted = await countFetch('https://api.anthropic.com/v1/messages/count_tokens', { ...init, headers,
        body: JSON.stringify({ model: body.model, system: body.system, messages: body.messages, thinking: body.thinking, output_config: body.output_config }) });
      if (!counted.ok) throw Error(`Workbook token count unavailable (${counted.status}); no model request sent`);
      const count = await counted.json();
      if (!Number.isSafeInteger(count.input_tokens) || count.input_tokens < 0) throw Error('Invalid workbook token count');
      const reservedUsd = ((Math.ceil(count.input_tokens * 1.1) + 4096) * price.input * 2 + body.max_tokens * price.output) / 1e6;
      const id = randomUUID();
      await transaction(state => {
        init.signal?.throwIfAborted();
        const held = state.calls.filter(c => c.status === 'reserved').reduce((sum, c) => sum + c.reservedUsd, 0);
        if (state.spentUsd + held + reservedUsd > limitUsd) throw Error(`The $${limitUsd} workbook budget cannot fund another request; no request sent`);
        state.calls.push({ id, model: body.model, reservedUsd, status: 'reserved' });
      });
      const response = await send(url, init);
      let result; try { result = await response.clone().json(); } catch { return response; }
      if (response.status === 400 && result?.type === 'error' && result.error?.type === 'invalid_request_error') {
        await transaction(s => { s.calls.find(c => c.id === id).status = 'validation-rejected'; });
        return response;
      }
      if (!response.ok || !object(result?.usage)) return response;
      const u = result.usage;
      const input = u.input_tokens, output = u.output_tokens, read = u.cache_read_input_tokens ?? 0, write = u.cache_creation_input_tokens ?? 0;
      if (![input, output, read, write].every(n => Number.isSafeInteger(n) && n >= 0) || typeof result.model !== 'string' || !result.model.startsWith(body.model)) {
        await transaction(s => { s.halted = 'Unpriced provider usage'; });
        throw Error('Unpriced workbook usage; budget halted and reservation retained');
      }
      // Use the high-context Haiku rate as an upper bound, and the longer cache-write price.
      const upperUsd = (input * price.input + output * price.output + read * price.input + write * price.input * 2) / 1e6;
      const settled = await transaction(s => {
        const call = s.calls.find(c => c.id === id);
        if (upperUsd > call.reservedUsd + 1e-12) { s.halted = 'Usage exceeded reservation'; return false; }
        call.status = 'settled'; call.upperUsd = upperUsd; s.spentUsd += upperUsd;
        return true;
      });
      if (!settled) throw Error('Workbook usage exceeded reservation; budget halted');
      return response;
    },
  };
}
