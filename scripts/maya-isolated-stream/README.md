# Maya isolated streaming test

This local test uses fake responses and synthetic records. It does not need the production 12-hour wait. It does not open a family writer.

Run from this worktree with the repository dependencies installed:

```sh
node scripts/maya-isolated-stream/run.mjs
```

Open `http://127.0.0.1:43125`. If the port is in use, add `--port=43126`. The server refuses a busy port. It never takes over another process. Stop this server with Ctrl-C in its terminal. It also prints its PID for a targeted `kill -TERM <printed-pid>`.

## Visible checks for the lead

1. Select **Spaced reply**. Click **Chat with Maya**.
2. Click **Send stuck sentence**. It sends `I don't get 2 minus 8.` for the synthetic question, 52 minus 28.
3. Check that `We trade 1 ten for 10 ones.` and its drawing arrive while **Reply pending** shows. More checked sentences follow with a delay. The final reply replaces the growing message.
4. Click **Send 2**. The fixed next reply asks for the whole answer.
5. To check a lost connection, click **Reset**. Open the chat. Send the stuck sentence. Click **Cut connection** before the final reply. The server finishes the same turn. The real desk retry reads that turn without taking the child message twice.
6. To check saved delivery, click **Reset**. Select **Hold pending prefix** or **Hold confirmed prefix** before opening the chat. Send the stuck sentence. Open **Private record state**. Wait for `held: true`.
7. Click **Recover: retry**, **Recover: end**, or **Recover: sweep**. Reset between cases. Recovery fences the old request by revision. A new compatible reader uses the same private store with sentence writing off. The sweep advances only the private clock by 20 minutes. A pending prefix does not count as delivered. A confirmed first sentence keeps its words, drawing, and help. The unfinished second sentence does not count. The old request cannot save a successor.

The production desk can take one poll interval to show a recovered result after the old connection settles. The recovery controls are test controls outside the production components.

## Source and isolation

The source pin is `b8d7569bf5c5ea78994ea34befdf1b442a8d2822` (#1125). The harness pin is the PR head commit. Check it with `git rev-parse HEAD`.

Startup builds the local bundles and compares every imported `src/` file with the pinned Git bytes. This includes the Maya protocol, call, text, chat view, stream format/parser, public end/sweep, desk hook/controls/board, board renderer, history, locks, and ink code. Startup also compares the production admission file and avatar with the pin. It checks that production `callSeams.streamChat` remains false. A mismatch stops startup before the server opens.

Only `scripts/maya-isolated-stream/` changes. There is no deployed route, production reader change, family switch, model-policy change, or production UI edit. The harness calls the public `mayaCalls` interface. It uses `memoryCallStore`, `memoryConnectionLog`, `conversationalFake`, fake math/talk reviewers, the stored subtract-52-28 sample, learning-event memory seams, and a synthetic spend reservation ledger. It mounts the actual `useDeskChat`, `ChatControls`, `ChatBoard`, and `OurBoard`. It uses the transcript markup and CSS from the real desk.

The server binds only `127.0.0.1`. It accepts only its exact Host. POST requests need its exact Origin. GET requests can omit Origin, but cannot supply a different Origin. The server serves an explicit asset list. It has no file-path route. Browser CSP restricts requests to this origin. Before core code loads, the launcher clears its inherited environment without reading credential values. It does not load env files. It blocks server fetch, HTTP, HTTPS, TCP connection, and UDP send methods. The dependency check refuses production service adapters and SDKs. No service, credential, email, Stripe, or real provider is used.

All call, message, event, spend, connection, and note records exist only in this process. Reset replaces the private store after old tasks stop. No cron or production worker can read it. Browser board drafts use only this loopback origin. Reset clears that origin's local and session storage. Process loss removes all server records. After a restart, use Reset to remove browser state for the lost call. Recovery here means a replacement in-process reader over retained memory. It does not prove recovery after process loss or hosted database behavior. The local message map is a small request adapter, not the production SQL admission RPC.

The fake model supports the fixed stuck sentence and the next answer `2`. It is not a general tutor. Fake reviews and delays do not measure provider correctness or provider latency. Browser proof and independent focused review belong to the lead.

## Focused verification

Before each check, use these failure conditions: external requests are admitted; changed core bytes pass startup; production sentence writing changes; early words or drawing wait for final; pending delivery counts as confirmed; retry takes a message twice.

```sh
node scripts/maya-isolated-stream/run.mjs --check
bash /Users/savargupta/unica-workbook-samples/customer-first-book-20261106/maya-coverage/gate-slot.sh npx vitest run --config scripts/maya-isolated-stream/vitest.config.mts scripts/maya-isolated-stream/harness.test.ts scripts/maya-isolated-stream/launcher.test.ts --maxWorkers=2 --sequence.shuffle --sequence.seed=1127
node_modules/.bin/tsc --noEmit -p scripts/maya-isolated-stream/tsconfig.json
node_modules/.bin/eslint scripts/maya-isolated-stream/*.{ts,tsx,mjs,mts}
```

These tests have their own explicit Vitest config because the production test config scans only `src/`. They do not change the production test command. No full suite, Next build, browser automation, or paid call is required here.

Verified on 2026-11-16 on `Savars-MacBook-Pro-5.local`:

- Call core: pending and confirmed recovery passed through public retry, end, and sweep. Reviews, spend, notes, and learning events used synthetic memory seams. This does not prove provider or hosted-store behavior.
- HTTP and stream parser: local JSON and NDJSON passed. Three sentence events arrived at 159, 1,281, and 3,504 ms. The final event arrived at 6,047 ms. HTTP 200 carried 1,956 bytes: three sentence events plus one final event. The first sentence carried one drawing batch. These are fake delay measurements.
- Isolation: external Host and Origin checks passed. The live launcher returned HTTP 403 for an external Origin. A changed source fixture failed provenance. The outbound fetch, HTTP, HTTPS, TCP, and UDP guards refused calls before a request.
- Desk and board: the actual components bundled with unchanged source. The public stream parser checked early text and batches. No browser or device was used. Visible drawing, layout, and interaction proof remain for the lead.
- Focused tests: 10 passed in two files with shuffled order, seed 1127. The focused TypeScript and ESLint checks passed. No full suite or Next build ran. The local test server exited before handoff.
