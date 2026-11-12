# Deploying Maya's voice worker (#533)

Maya's voice worker (`worker/maya-voice`, [Maya voice calls](maya-voice.md)) runs on LiveKit Cloud as a container. This page lists every step Savar or an agent runs once the LiveKit account exists, and the listening test that picks the voice (D-238). No step here has run against a real account yet.

## What is in the repository

| File | What it is |
|---|---|
| `worker/maya-voice/Dockerfile` | The image. Stage 1 bundles `worker/maya-voice/src/main.ts` with `src/lib` into `dist/main.mjs` (esbuild). Stage 2 holds only that file and the npm packages it leaves outside, on `node:22-bookworm-slim` (glibc: LiveKit's native module has no musl build, and LiveKit Cloud does not support Alpine). It runs `node dist/main.mjs start` as a non-root user, with `NODE_OPTIONS=--conditions=react-server`, so `server-only` is the empty module in the worker and in each job process. |
| `worker/maya-voice/Dockerfile.dockerignore` | Lets in only `src/lib` and the worker's own files. No `.env` file, test or build output. |
| `worker/maya-voice/package.json`, `package-lock.json` | The image's packages: the five npm packages the bundle imports, plus `server-only`. The lockfile is the root lockfile's own tree for them, transitive packages included, with the same paths, versions and integrity, made by `npm run voice:lock` (`scripts/voice-lockfile.mjs`). `worker/maya-voice/src/packaging.test.ts` fails when the bundle imports a package that is not listed, when any package in the image's tree differs from the root lockfile, or when the committed lockfile is not what `npm run voice:lock` makes. After a LiveKit or Supabase version changes in the root, set it in the worker's `package.json` and run `npm run voice:lock`. Never run `npm install` in `worker/maya-voice`: it resolves a newer tree than the one the tests ran with. |
| `worker/maya-voice/livekit.toml` | LiveKit Cloud's agent file: the project subdomain and the agent id. Both are empty until the first `lk agent create` writes them. |
| `scripts/voice-deploy-context.mjs` (`npm run voice:stage`) | Stages the folder LiveKit builds from (below). |
| `scripts/voice-listening-test.mjs` (`npm run voice:listen`) | The listening-test kit (below). |

LiveKit Cloud uploads the folder `lk agent create` or `lk agent deploy` runs in and builds the `Dockerfile` at its top ([Builds and Dockerfiles](https://docs.livekit.io/deploy/agents/builds.md), read 2026-11-05). The worker needs `src/lib` from the site, so `npm run voice:stage` copies the committed `src/lib` and `worker/maya-voice` of one git ref into a folder outside the repository, with the `Dockerfile` and `.dockerignore` at its top and `livekit.toml` when it has an agent id. Only committed files are staged: commit first.

## Build the image locally

```sh
docker build -f worker/maya-voice/Dockerfile -t maya-voice .
docker run --rm -e LIVEKIT_URL=ws://host.docker.internal:7880 -e LIVEKIT_API_KEY=devkey -e LIVEKIT_API_SECRET=secret maya-voice
```

The second command needs `livekit-server --dev` running on the laptop. The worker logs `registered worker` with `agentName: maya-voice`. With no other settings it uses the fake speech-to-text and voice.

## First deploy (once the LiveKit account exists)

Savar creates the LiveKit Cloud project (see [Accounts and settings](maya-voice.md#accounts-and-settings-savar-must-create)). Then:

1. Install the LiveKit CLI (`brew install livekit-cli`) and link the project: `lk cloud auth`.
2. In the project settings, turn off agent observability (session recording and audio). LiveKit says observability is separate from its zero data retention ([LiveKit Inference](https://docs.livekit.io/agents/models/inference/), read 2026-11-04).
3. Write the secrets file outside the repository, for example `~/.config/unica/maya-voice.env`. LiveKit Cloud injects `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` itself; never put them in the file ([Secrets](https://docs.livekit.io/deploy/agents/secrets.md)).

   ```sh
   SUPABASE_URL=https://cdjobwsyzndtltzfpyqa.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...        # the worker's own key, maya_voice_worker
   OPENROUTER_API_KEY=...
   AI_MODEL=anthropic/claude-sonnet-5.5
   MAYA_STT=fake                            # inference only after the privacy gate
   MAYA_TTS=fake                            # inference only after the privacy gate
   ```

4. Stage and create the agent:

   ```sh
   npm run voice:stage -- --out ~/unica-maya-voice-deploy
   cd ~/unica-maya-voice-deploy
   lk agent create --secrets-file ~/.config/unica/maya-voice.env
   lk agent status
   lk agent logs
   ```

   `lk agent create` registers the agent, writes `livekit.toml` with its id, builds the image and deploys it ([Deploy quickstart](https://docs.livekit.io/deploy/agents/quickstart.md)). If it asks for a region, choose the one nearest `us-west-1` (Supabase) and Vercel's `sfo1`.
5. Copy `~/unica-maya-voice-deploy/livekit.toml` to `worker/maya-voice/livekit.toml` and commit it in a pull request. The staging script refuses to restage over a written `livekit.toml` until this is done, so the agent id is never lost.
6. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in Vercel (Production). The **Speak** option on `/admin/maya` appears, and a test call runs with the fake speech-to-text and voice in LiveKit Cloud.

On the free Build plan an idle agent can scale to zero, and a new call then waits 10 to 20 seconds for the agent to join ([Managing deployments](https://docs.livekit.io/deploy/agents/managing-deployments.md)). Paid plans keep production agents warm.

## The deployed worker (2026-11-12)

- Project `unica-ai-teacher` (`p_5mqxinwgdis`), agent `CA_rHki6Tp8jjzn` (`worker/maya-voice/livekit.toml`), region `us-east` (Ashburn). LiveKit lists only `us-east`, `eu-central` and `ap-south` for agent hosting, so there is no US West region.
- First created with `lk agent create --project unica-ai-teacher --region us-east --secrets-file ~/.config/unica/maya-voice.env --no-default-attributes -y .` in the staged folder. LiveKit CLI 2.19 refuses a folder with no project file at its top, so `npm run voice:stage` also writes the worker's `package.json` there (the `.dockerignore` keeps it out of the image).
- The image built on LiveKit Cloud, and the worker registered as `maya-voice`. A desk voice call of a test family from a local site with the Cloud keys ran end to end with the fake speech-to-text and voice (outcome solved, learning event written).
- The secrets file holds the worker's Supabase key (`maya_voice_worker`), Maya's OpenRouter key, `RESEND_API_KEY` (the worker's own sending-only key `maya_voice_worker`, for safety alerts), `EMAIL_FROM`, `SIGNUP_NOTIFY_EMAIL` and `MAYA_STT`/`MAYA_TTS` (`fake` until the privacy gate). The values are in the Mac Keychain (`unica-maya-voice-worker-supabase`, `unica-maya-voice-worker-resend`, `unica-maya-openrouter`), never in git.
- Vercel: `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set in Preview only (Keychain `unica-livekit-url`, `unica-livekit-api-key`, `unica-livekit-api-secret`). Production waits for Savar's approval.

## Later deploys

```sh
npm run voice:stage -- --out ~/unica-maya-voice-deploy
cd ~/unica-maya-voice-deploy && lk agent deploy
```

Change one setting with `lk agent update-secrets --secrets "MAYA_TTS=inference"`; settings you do not name stay. `lk agent rollback` returns to the previous version.

## Turn on LiveKit Inference

The worker sends speech-to-text and the voice through LiveKit Inference with `MAYA_STT=inference` and `MAYA_TTS=inference` (D-238). It uses the project's own key, which LiveKit Cloud injects, so no other account is needed. Only after every check of the [privacy gate](maya-voice.md#privacy-gate):

```sh
lk agent update-secrets \
  --secrets "MAYA_STT=inference" --secrets "MAYA_STT_MODEL=assemblyai/universal-3-6-pro" \
  --secrets "MAYA_TTS=inference" --secrets "MAYA_TTS_MODEL=cartesia/sonic-3.6" --secrets "MAYA_VOICE=f786b574-daa5-4673-aa0c-cbe3e8534c02" \
  --secrets "MAYA_VOICE_PRIVACY_CONFIRMED=livekit-inference-zdr,child-use-approved"
```

Then run one admin test call and read `lk agent logs`: the `call running` line shows the provider ids and `wordTimings: "requested"`, and each `board cue` line shows `source` `word` (word timings came back) or `sentence` (they did not, and the board followed sentence ends).

## Listening test

The kit picks the voice by ear (D-238): Inworld TTS-2 and Cartesia Sonic 3.6 through LiveKit Inference, and ElevenLabs v4 Turbo through its direct plugin (it is not on LiveKit Inference). The design is part A of section 12 of `.design/research/maya-voice-council-2026-11/council-voice-claude.md`, with the sentences taken from Maya's code instead of written for the test.

**The sentences.** 12 of Maya's real lines (`worker/maya-voice/src/listening-test.ts`): a hello, an acknowledgement, a carry step, the pairs "Was it 13 or 30?" and "Did you say 14 or 40?", a subtraction with 13, a whole answer, three fraction lines (3/4 = 6/8, 14/16) and a goodbye. A test checks that each one is a text Maya's own code writes (`allLineTexts` of the sample questions, `PHRASES`, `ACK_PHRASES`), and that its words-only form says the same words by Maya's own normalisation (`speechKey`, and `writtenFractions` for the fraction words). Part 1 plays them with numbers as words ("three quarters equals six eighths"). Part 2 plays the 9 math lines as the worker sends them today, with digits and signs, to hear how each voice reads math.

**What it sends.** Only these fixed sentences, no child data. The ElevenLabs plugin keeps ElevenLabs' default request logging on.

**Run it with the fake voice** (no key, silent files, made-up word timings; it proves the kit, nothing about a voice):

```sh
npm run voice:listen -- make --dir ~/maya-listening-fake --fake
```

**Run it for real.** It refuses to start while any chosen candidate lacks a key or its two voice ids, and sends nothing then.

```sh
export LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...     # the LiveKit project (Inworld and Cartesia through Inference)
export ELEVEN_API_KEY=...                             # ElevenLabs, direct
export LISTEN_INWORLD_VOICES=<id>,<id> LISTEN_CARTESIA_VOICES=<id>,<id> LISTEN_ELEVENLABS_VOICES=<id>,<id>
npm run voice:listen -- make --dir ~/maya-listening-1
```

`--candidates inworld,cartesia` runs a subset. It writes:

- `listener/`: the only folder listeners get.
  - `audio/` holds `s01-A.wav` and so on. Each sentence has its own random order of the 6 voices, so a letter never means the same voice twice.
  - Every file is resampled to 24,000 Hz mono, 16-bit, so a vendor's own sample rate (16,000 Hz through Inference, 22,050 Hz for ElevenLabs) does not show.
  - The files are written in a shuffled order and all get one timestamp, so sorting by date does not group a voice.
  - Also in the folder: `answer-sheet.md`, `answers-template.csv`, `letters.json` (each sentence's letters, not their voices) and an empty `answers/`. None of them names a vendor.
- `operator/`: never for listeners.
  - `key-do-not-open.json` holds the letters' voices and the seed.
  - `measures.json` and `operator-report.md` give, per voice: whether word timings came back, how many words the worker's board alignment matched (all words of `s04` is the check), the first audio time, and the timed words returned for each math line. They name the vendors and give each file's length.

Copy only `listener/` to each listener. Three listeners (Savar, one parent, one child aged 6 to 12) each record their choices there; `record` needs no key:

```sh
npm run voice:listen -- record --dir ~/maya-listening-1/listener --listener Savar
npm run voice:listen -- score --dir ~/maya-listening-1
```

`score` reads `listener/answers/` (or `--answers <folder>`) and writes `operator/results.md`. It refuses to score until every listener has answered every sentence of both parts exactly once, with a favourite for each sentence of part 1. A missing math row would otherwise count as no misread. A voice passes when at least 2 of 3 listeners chose it most often, no listener marked a misread on its math lines (in either part), and its word timings matched every word of `s04`. With fewer than 3 listeners no voice passes. If no voice passes on word timings, the board follows sentence ends with that voice; say so before choosing it.

A listener can still tell voices apart by ear and by length, which a blind test allows. The kit hides only which vendor made which file.

**What the kit cannot tell.** The timed words a provider returns can be its copy of the text sent, not what it said, so only listeners judge how a voice reads math. It measures first audio from a laptop, not from LiveKit Cloud. It does not test speech-to-text, a child's voice, or the whole call (parts B and C of the design).

## Not verified

- The image has not been built with Docker in #533: Docker Desktop on the build machine was waiting for an administrator password. The two stages were replayed in plain folders with the same files and `npm ci` commands on macOS, and the resulting bundle registered as `maya-voice` with a local `livekit-server --dev`. The Linux build is unproven until `docker build` runs.
- No `lk` command has run: there is no LiveKit account yet. The commands come from LiveKit's docs (read 2026-11-05).
- That LiveKit Inference returns word timings for Inworld or Cartesia to the Node worker. LiveKit Agents for Node 1.9.5 asks for them and reads them when the gateway sends `output_alignment` events; the Inference page does not mention them. The listening test answers it.
