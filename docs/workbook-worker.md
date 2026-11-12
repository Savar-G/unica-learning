# The workbook worker (D-200)

Workbooks are made on Savar's Mac, on his Claude subscription, by default. The paid API (OpenRouter) is the fallback.
Set `WORKBOOK_SUBSCRIPTION_PROVIDER=codex` to use an explicitly selected ChatGPT subscription. Codex mode has no API fallback.

When you press **Prepare next workbook** on the live site, the site only queues the run (`workbook_runs.runner = 'mac'`). The workbook worker on the Mac takes the run, makes it with the selected subscription CLI, and stores the draft. The admin pages show whether the worker is online.

## How it works

| Part | File |
|---|---|
| The worker process | `scripts/workbook-worker.ts` (`npm run workbooks:worker`) |
| Its loop: heartbeat, take a run, keep the Mac awake | `src/lib/workbook-worker.ts` |
| The `claude -p` adapter | `src/lib/ai-claude-cli.ts` |
| The Codex subscription adapter and local availability check | `src/lib/ai-codex-cli.ts` |
| The subscription first, then the API | `src/lib/ai-fallback.ts` |
| All settings | `src/lib/workbook-ai.ts` |
| The job, shared with the server | `src/lib/workbook-job.ts`, `src/lib/workbook-job-deps.ts` |
| The launcher (pulls `origin/main`, then starts the worker) | `scripts/workbook-worker.sh` |
| The installer (checkout, settings file, LaunchAgent) | `scripts/install-workbook-worker.sh` |

Each turn, the worker:

1. Writes its heartbeat to `public.workbook_workers` (every 30 seconds, also while it makes a run).
2. Takes the oldest run for the Mac: a queued run, or a running run with no holder or no progress for 6 minutes. The claim and resume check the selected runner in the same database operation. If another process took the run first, the worker goes to the next run.
3. Renews the run lease every 30 seconds and before each AI call. If renewal fails, it stops AI calls under that lease. Makes the whole run in one job call. There is no Vercel time limit. `caffeinate -i -s` keeps the Mac awake until the run ends.
4. Between runs and when it has nothing to do, it checks `origin/main` every 5 minutes. When `origin/main` has moved, the worker exits between runs. launchd then starts the launcher again, and the launcher pulls the new code.

A run continues only on the code it started on (R379-8-2). The worker's build is its commit when the checkout is clean, else a value of its own. A run that started on other code fails with "the site's code changed". Start a new run when this occurs.

### The Claude default

- Each AI call goes to the subscription first: `claude -p --output-format json --json-schema <schema> --safe-mode --tools "" --no-session-persistence`. Claude Code checks the output against the schema. The generator then checks the output again, as it does on the API path.
- The child process gets no API key. It gets only `PATH`, `HOME` and a few other variables. `WORKBOOK_CLAUDE_CONFIG_DIR` is passed as `CLAUDE_CONFIG_DIR`, so you can choose which Claude account runs it.
- The subscription can be unable to take a call. These are the causes: a usage limit, no `claude` on `PATH`, `claude` not logged in, a crash, or an image in the request (`claude -p` reads only text). Then that call goes to the API.
- After a usage limit, a missing CLI or a lost login, the worker uses the API for the rest of that run. The run stores this exclusion. A worker restart or a resume restores it before the next AI call.
- A bad answer (not JSON, or not to the schema) is not sent to the API. The generator's own retry handles it, as before.
- The generator and the solve check send text only today. No call goes to the API because of images.
- Each call is logged in `public.workbook_run_ai_calls`, with the provider, the model, the outcome, the time and the cost (USD 0 on the subscription). A durable call ID is saved before the request. Each API dispatch increments its counter immediately before `fetch`, after the intent save and a cancellation check. A failed or cancelled intent adds no dispatch. Replayed intents therefore cannot raise the stored count for a request that did not start. The result and cost are saved before the workbook result checkpoint. Failed saves keep their records for retry. A crash leaves an unfinished call with an unknown final cost and request count; its saved dispatch count is a lower bound. The admin run page labels counts as logical calls and shows recorded API retries separately. These count adapter dispatch attempts, not confirmed network delivery or billable provider requests. Older saved counts are not rewritten.

### Explicit Codex selection

Set these values in the worker settings file before installation:

```dotenv
WORKBOOK_SUBSCRIPTION_PROVIDER=codex
WORKBOOK_CODEX_HOME=/Users/savargupta/.codex-t3/unify
```

The home must be an explicit absolute directory. `CODEX_HOME` alone does not select an account. The selected directory must contain `auth.json` with a ChatGPT file login. API-key logins and keychain-only logins fail the local check. Keep this file private. The worker does not copy or print credentials.

Both the page writer and the independent solve request use `gpt-6.1-sol` at high effort. These are separate requests to the same model. They do not provide a second-model check. `WORKBOOK_CLAUDE_MODEL`, `WORKBOOK_CLAUDE_SOLVE_MODEL`, `AI_MODEL`, and `AI_SOLVE_MODEL` do not change these Codex models. The request timeout is 300,000 ms.

Codex mode disables the API even when API keys, `WORKBOOK_AI_PRIMARY=api`, or an API-first caller override are present. It does not switch to Claude. A server process that cannot run a subscription refuses this mode. An unknown or empty provider setting also fails closed. Omit the setting to retain the Claude default.

Before service access at startup, and again before each generation or edit job claim, the worker checks the selected file login, required CLI options, and `codex login status`. These checks make no model request. A missing CLI, an incompatible CLI, or a lost login prevents the claim. They do not prove remote model access, token validity, or remaining subscription quota. An expired token or a usage limit can still fail the first model request.

Requests use an isolated temporary working directory. They ignore the account's `config.toml` and disable tools, apps, plugins, hooks, web search, project instructions, and session persistence. The child environment contains the explicit `CODEX_HOME` and a small set of system variables. It contains no API keys. Cancellation stops the CLI through the same process adapter as Claude. A cancelled result is not recorded as an answer.

Writer, solver, draft, frame fingerprints, and call records use `codex/gpt-6.1-sol;reasoning=high;auth=chatgpt`. A saved Claude frame cannot resume with Codex. The normal build and model checks still apply. A lasting usage-limit, missing-CLI, or login failure excludes the subscription for the rest of that run. The existing durable provider gate retains this exclusion across a restart or resume. There is no API fallback when this gate is closed.

## Install (once)

Before you install, make sure these are true:

- `node` (22 or later), `git`, `gh` (logged in as `Savar-G`) and the selected CLI are on `PATH`.
- For Claude, you are logged in to `claude` with the account that must do the work. Run `claude` once and use `/login`.
- For Codex, create the settings file with the two explicit values above first. The selected account must already have a ChatGPT file login. The installer reads the saved provider setting and includes that CLI in the LaunchAgent path. It does not require Claude for a Codex worker.
- Google Chrome is installed, or `CHROMIUM_PATH` is set in the settings file.
- The Keychain item `supabase-pagewise` holds a Supabase access token (as for `npm run db:types`), or `SUPABASE_SECRET_KEY` is in the settings file.

Then run, from any checkout of the repo:

```sh
bash scripts/install-workbook-worker.sh
```

The script does these steps:

1. It stops the old LaunchAgent and waits for its process tree to exit before it changes files. If a process does not stop within 60 seconds, the install stops. It clones the repo to `~/.unica-workbook-worker` (set `WORKER_DIR` to change it) and moves the clone to `origin/main`.
2. It writes the settings file `~/.config/unica/workbook-worker.env` (chmod 600), if there is none.
3. It writes the LaunchAgent `~/Library/LaunchAgents/com.unicalearning.workbook-worker.plist` and loads it. The LaunchAgent has `RunAtLoad`, `KeepAlive` (it starts the worker again when the worker exits or crashes), `ProcessType Interactive`, and the log at `~/Library/Logs/unica-workbook-worker.log`.

In Claude mode, add `OPENROUTER_API_KEY` to the settings file to turn on the API fallback. Without it, a call that the subscription cannot take fails. The generator then marks that question as failed. Codex mode ignores the API key.

Do not change files in `~/.unica-workbook-worker`. The launcher moves it to `origin/main` at each start.

## Settings

Put these in `~/.config/unica/workbook-worker.env`. The worker reads the file at start. To use another file, set `WORKBOOK_WORKER_ENV`.

| Setting | Default | What it does |
|---|---|---|
| `WORKBOOK_SUBSCRIPTION_PROVIDER` | `claude` | `claude` or `codex`. Codex always disables the API fallback. |
| `WORKBOOK_CODEX_HOME` | none | Required for Codex: an absolute account directory with a stored ChatGPT file login. |
| `WORKBOOK_AI_PRIMARY` | `subscription` | Set `api` to put the API first, for example when there are many more customers. |
| `OPENROUTER_API_KEY` | none | The API fallback. |
| `AI_MODEL`, `AI_SOLVE_MODEL` | `anthropic/claude-sonnet-5.5`, `anthropic/claude-haiku-5.5` | The API models. |
| `WORKBOOK_CLAUDE_MODEL`, `WORKBOOK_CLAUDE_SOLVE_MODEL` | `claude-sonnet-5-5`, `claude-haiku-5-5` | The subscription models. Keep them the same as the API models, so a run that changes provider keeps the same model name. |
| `WORKBOOK_CLAUDE_CONFIG_DIR` | the normal `~/.claude` login | Which Claude account runs `claude -p`. |
| `WORKBOOK_CLAUDE_TIMEOUT_MS` | `300000` | The time limit of one `claude -p` call. |
| `WORKBOOK_CLAUDE_COMMAND` | `claude` | The `claude` command, as a full path if it is not on the LaunchAgent's `PATH`. |
| `WORKBOOK_WORKER_ID` | the Mac's host name | The worker's name in the heartbeat. |
| `SUPABASE_SECRET_KEY` | through the Keychain | The Supabase secret key. |
| `CHROMIUM_PATH` | Google Chrome | The Chromium that prints the pages. |

On Vercel, `WORKBOOK_RUNNER` sets where runs are made. With `mac` (the default), the site only queues the run. With `server`, the site makes the run itself with the API, as before D-200.

## Daily use

- **See the log:** `tail -f ~/Library/Logs/unica-workbook-worker.log`. The log does not rotate. Clear it with `: > ~/Library/Logs/unica-workbook-worker.log` when it is too large.
- **Restart:** `launchctl kickstart -k gui/$(id -u)/com.unicalearning.workbook-worker`.
- **Stop until the next login:** `launchctl bootout gui/$(id -u)/com.unicalearning.workbook-worker`. To start it again: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.unicalearning.workbook-worker.plist`.
- **After you edit the plist** (or after you run the installer again): `bootout`, then `bootstrap`. `kickstart -k` keeps the old configuration.
- **One turn by hand,** from any checkout: `npm run workbooks:worker -- --once`. It makes the oldest waiting run, if there is one, and stops.

## Stop a run

Press **Stop this run** on the run page, the child page or the Workbooks list, then **Yes, stop it**. The button shows while a run is queued or running. The stop is written at once (`stop_workbook_run`): the run has status `stale`, no lease and `stopped_by_email`, and the audit log has `run-stopped-by-admin`. The finished pages are not used. "Prepare next workbook" starts a new run at once.

The job asks every 10 seconds whether its run ended (`STOP_CHECK_MS`, `src/lib/workbook-job.ts`), and the 30-second lease renewal is the second check. It then aborts its AI calls and prints. The selected CLI gets SIGTERM, then SIGKILL after 5 seconds. A print closes its browser, and a browser that is still starting is closed when it starts. So the longest delay in normal work is about 15 seconds. If the database does not answer, the renewal's 10-second limit ends the work at about 40 seconds. The worker then goes on to the next run. Every write with the old lease changes nothing. Only the AI cost log (`workbook_run_ai_calls`) can still get a row, so that a paid call stays recorded.

## When the Mac is off

When the Mac is asleep, off or offline, a run waits ("Waiting for the Mac"). The run page and the child page show "Mac worker offline" and the time the worker was last seen. When the Mac comes back, the worker makes the run.

To make the run now, press **Run on the server with the API** on the run page. The run moves to the server (`runner = 'server'`), so the Mac does not take it. The server then makes it with the API, within Vercel's time limit, with hand-overs to the resume route. This costs API money.

A run that stopped part-way on the Mac (for example, the Mac went to sleep with the lid closed) continues where it stopped. The worker takes it up again after 6 minutes with no progress. You can also run it on the server, but only if the server runs the same commit (the build rule above).

`caffeinate` cannot keep a MacBook awake with the lid closed, except with power, an external display and a keyboard connected. Leave the lid open while the worker makes a run.

## Switch back to the API

When there are many more customers, the API becomes the default again (D-200):

1. In `~/.config/unica/workbook-worker.env`, set `WORKBOOK_SUBSCRIPTION_PROVIDER=claude` and `WORKBOOK_AI_PRIMARY=api`. Then restart the worker. This keeps the Mac worker, with the API first.
2. Or, to make every run on the server: set `WORKBOOK_RUNNER=server` in Vercel (Production) and redeploy. Then stop the worker.

## What stays on the API

The work review, the report text, the learner and child profiles and Maya run live for parents and children. They always use the API (`src/lib/ai-client.ts`). Only workbook generation uses the subscription.


## Book 1 baseline recovery (#870)

After an admin approves a Book 1 draft, the site saves its starting record (the Book 1 baseline) from the plan input that the run frame keeps. The site cannot save it in two cases, and the admin run page then says "Not saved" and names the recovery script:

- The run was made before #472, so its frame kept no plan input (`planning-capture-missing`).
- The curriculum changed in a deploy after the book was planned (`curriculum-version-changed`). The record must copy the skills and steps of the version the book was planned on.

Both need the frame's own build: the original planner and its curriculum, built from this repository's Git objects. On the Mac, from a checkout that has the frame's build commit:

1. Run `npm run workbooks:book1-recover -- --run <run id>`. It saves nothing. It runs every step of the save: the planning proof or recovery, the record, and the database save in a transaction that is always rolled back. It prints each result, whether book 2 can be planned on today's curriculum (#812), and the verdict.
2. If the verdict says the save would store it, run it again with `--save`. It never replaces a baseline that exists.

Do this before any page of the book is marked: after the first mark, the save refuses (`activity-before-boundary`). Recovery also refuses when the child's profile was rebuilt after the run's frame.

## Draft review comments (#313)

The draft page has a comment reviewer. Click a question or a place on the page. You can also select a question from the list. Enter saves a comment. Esc cancels it. Saved comments survive a reload and do not change the workbook. Use **Edit myself** inside a question comment to change its exact fields. Code calculates its answer and worked steps.

**Send all comments** queues one batch in `workbook_edits`. The saved comments are in `workbook_comments`. A batch uses the configured `WORKBOOK_RUNNER`, with `mac` as the default. The same Mac worker reads these batches as well as generation runs. On the Mac it uses the selected subscription. Only the Claude selection permits an API fallback. Server batches use the API. `WORKBOOK_AI_FAKE=on` or `slow` substitutes the fake writer and solve checker in development only.

The batch groups comments by page. A page comment covers the page. Other comments change only their selected questions. Each group uses one request per changed page, plus at most 5 retries on failure. This upper bound includes one writer-helper retry, the subscription-to-API fallback and the API transport retry: at most 2 helper calls, each with at most 3 provider requests. Each completed writer response is saved before code checks, solve checks and rendering. A resume uses the saved response. An expired lease can resume on the same build and models. A different build or model fails the batch and returns its comments to pending. Code checks the changed questions, then the solve checker reads them. Only changed pages enter the print engine. The PDF assembler embeds the saved PNGs in page order, including the new page images. It runs once per batch. The assembled PDF is an image PDF; it has no selectable text.

A successful batch stores one new revision and resets approval to draft. Printed and shipped workbooks refuse comments and changes. The database checks the base revision and the batch lease when it commits. A late render cannot replace a newer revision. Each comment retains its before and after data. A failed page keeps its previous content and image. Its comments stay available to send again. Comments saved during a batch move to the new revision; a missing question location is flagged.

A lost commit response has an unknown outcome. The job keeps its files because the database may already reference them. Reload the draft to read the stored result. Do not delete those files based only on the lost response.


Each finished review page is checkpointed under the batch lease before the next page starts. A server call lets go after two minutes, then uses the existing protected resume route. The next call reuses those pages and their images. A worker restart can also read them. It does not ask the writer or render those pages again. Failed pages are checkpointed too; their comments can be edited and submitted in a later batch.

The review schema was applied through the Management API in this order: `workbook_edit`, `workbook_comments`, `workbook_comment_checks`, `workbook_comment_results`, `workbook_comment_resume`, `workbook_comment_send`. The matching SQL files are under `supabase/migrations/`. Keep this order when setting up another database. The repository uses date-only migration filenames; alphabetical filename order is not the dependency order.

## First pages

The worker also makes the first pages of Workbook 1 that wait for the Mac (`public.workbook_first_pages` with runner `mac`, docs/first-pages.md), after the runs and edits of its queue. They use the same AI settings. Nothing queues them while `FIRST_PAGES_ENABLED` is off, except an admin's one test.
