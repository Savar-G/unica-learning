# Maya voice: TTS options and tutor research

Read date for all web sources: 2026-11-12. Built on the 2026-11-04 council report (not repeated). Keenable tools used. I could not open artificialanalysis.ai directly; Elo numbers come from pages that copy it (dated). Marked "unverified" where only one secondary source exists.

## A. Text-to-speech

### Comparison table

| Model | AA Elo, own voices / same voice | First audio (streaming) | Hard-text read rate (Cekura, digit input) | Word timestamps | Price | Zero retention and child use | On LiveKit Inference |
|---|---|---|---|---|---|---|---|
| Inworld Realtime TTS-2 | 1267 (rank 8) / 1146 (rank 7), 2026-11-02 | 127 ms Cekura; 168 ms Voice Arena; vendor 100 ms P90 | 93.4% | Yes, WORD, sync or async | USD 25/M chars on demand; LiveKit about USD 0.015/min | Inference ZDR; direct ZDR is Enterprise | Yes |
| Inworld TTS-2 Flash | about 1215 (rank 16, council 11-04) | 45 ms Cekura | 93.2% | Yes | USD 15/M | Same | Yes (added 2026-10-29) |
| Cartesia Sonic 3.6 | 1297 (rank 4) / 1147 (rank 6) | 270 ms Cekura; 278 ms Coval p50; 340 ms Voice Arena; vendor "under 90 ms" is model only | 74.9% (numbers 71%, context 58%) | Yes (add_timestamps); beginning-of-word times changed in 3.6 | USD 37-50/M; LiveKit USD 0.030/min | Inference ZDR; direct ZDR Enterprise | Yes |
| ElevenLabs Eleven v4 Turbo | 1335 (rank 1-2) / 1156 (rank 5) | 69 ms Cekura; vendor 100-150 ms | 79.9% | Only on Text to Dialogue socket; LiveKit bug #7773 (2026-10-13): times restart each chunk | USD 40/M | ZDR "select Enterprise" only; use policy bars apps for under 18 unless approved in writing (secondary source, unverified) | No (plugin) |
| Rime Coda / Mist v3 | no top-10 rank found | vendor 96 ms / 37 ms | not found | Coda yes | about USD 0.04-0.05/min | not checked | Yes |
| AssemblyAI TTS-1 | 1227 | vendor 90 ms; 159 ms Cekura | 81.5% | Yes | USD 15/M | Inference ZDR | Yes |
| Gemini 3.8 Flash TTS | 1283 (rank 5) | not published | not found | not checked | USD 16.5/M | Developer API terms bar apps likely used by under 18 (Google forum, 2026-09/10: even offline use unclear) | Yes |
| OpenAI TTS | strong, no rank found | 0.66 s (gpt-4o-mini-tts, one test) | n/a | no | USD 15-30/M | Shuts off 2027-01-06; the named replacement is a Realtime model, not a TTS endpoint | No |
| Hume Octave 2 | not in top 15 | 573 ms | 87.4% | not checked | USD 100/M | not checked | No |

Sources: AA Elo from models.fru.dev/boards/aa-tts (2026-11-08) and getleadwave.io (2026-11-02); Cekura benchmarks.cekura.ai and cekura.ai/blogs/elevenlabs-vs-cartesia (2026-11-10); Coval benchmarks.coval.ai (2026-11-06); Inworld docs docs.inworld.ai/tts/capabilities/timestamps; LiveKit model list docs.livekit.io/agents/models/tts (read 2026-11-12); issue github.com/livekit/agents/issues/7773; OpenAI deprecation threads (2026-10-01 to 2026-10-23).

### What the numbers mean for Maya

- Quality gap is small where it counts. On the AA same-voice board, Sonic 3.6 (1147) and TTS-2 (1146) tie. ElevenLabs leads by about 10 points there. On the own-voices board the gap is about 30 to 70 points, which is a voice-catalogue effect and roughly 55-60% preference. Your own ears decide.
- Inworld shipped a TTS-2 update on 2026-10-28 (faster, steadier over long sessions, opt-in "reasoning" that writes a delivery direction). The AA score may not include it yet (unverified). Inworld itself says Flash ignores steering, so Flash cannot be made "warmer" by instruction.
- The Cekura read rate uses digit input and a speech-to-text judge (an estimate, not people). Maya writes numbers as words, so this test mostly shows Inworld's robustness. Still test "twenty-seven plus thirty-nine", "carry the one", "three quarters", "thirteen or thirty".
- Sonic 3.6 keeps playing 764 ms after a stop signal (Cekura). For a child who says "wait", this matters. Test it.
- Word timing: Inworld default sync mode delays the first audio a little; async mode sends audio first and times after. Pick async if the board only needs times a moment later (verify in a real call). Cartesia: test the start-of-word times, since 3.6 changed them.
- ElevenLabs v4 Turbo is the top-rated voice but has three blockers for day 2: no Inference route (so no blanket ZDR; ZDR is Enterprise only), a child-app approval clause, and the open timestamp bug (fix status unknown; the report was for the Python plugin, Node untested).

### Verdict

- KEEP Inworld TTS-2 and Cartesia Sonic 3.6 in the blind test. Both are on Inference with ZDR, both give word times.
- KEEP ElevenLabs v4 Turbo only as a listening reference. Do not ship it in 2 days. Switch only if it wins by a wide margin and ElevenLabs approves the child use in writing and alignment works in the Node worker.
- ADD one variant: Inworld TTS-2 with reasoning on (same model id, one request field). Check that the added delay is small. This is the one change that targets "warm and patient".
- ADD (optional, low priority): Rime Coda. It is on Inference and the vendor claims top human-rated naturalness, but I found no independent rank.
- DROP OpenAI TTS (shut off 2027-01-06). DROP Gemini TTS (child terms). DROP Hume Octave 2 (not on Inference, USD 100/M, 573 ms). Keep Flash only as a fallback voice.

## B. What the research says

### Findings that drive the rules

- Structure beats modality. Voice and text gave equal learning in a within-student trial (adult MBA, N=86; arXiv 2609.23958, 2026-09-21), but voice doubled turns per minute (1.34 vs 0.75) and question asking (11.3 vs 4.6), and the structured tutor beat free consumer AI. Caveat: adults.
- Open chat was a non-event. Khanmigo added no measurable gain over practice in a 2-year, 18-school trial (NBER w35620, 2026-08-17); students asked for help in only 17% of sessions where they made a mistake. Guided, step-by-step tutors with a human nearby did better (Harvard 0.63 SD, Nigeria 0.31 SD; summary peabody.kids, 2026-10-16, secondary).
- Pedagogy matters more than the model. Google/Eedi RCT (N=1179, 10 weeks, 2026-10-28): AI tutors matched expert human tutors on near measures but not on the broad Star Maths test. Sierra Leone Guided Learning: +0.258 SD; 76% of tutor messages were scaffolding questions, 2% direct solutions (2026-06-09).
- Tutor CoPilot (N=1,800 students): mastery +4 points, +9 for weaker tutors; effect came from more "prompt the student to explain" and fewer generic "Good job" and answer give-aways (arXiv 2410.03017).

### Design rules for Maya's calls

1. **Maya starts the help after every wrong answer, with one guiding question, never the answer first.** Khanmigo showed children do not ask on their own (NBER w35620). Guiding-question share was 76% in the Sierra Leone trial. Status: Maya already does this (controller teaches every question). Check that the first move after a wrong answer is Maya's, not the child's.
2. **Keep Maya's turns short and give the child the floor.** Tutor talk was 91.5% of time in a control group; a talk-ratio meter raised student talk 13-14% and reasoning (arXiv 2611.07072, 2026-11-06, citing Demszky et al.). A child-AI storytelling study had AI turns twice the child's length (31.9 vs 14.9 words; arXiv 2602.04109, n=10). Status: small change. Cap sentences per turn, end each turn with a question, log the child's share of talk.
3. **Wait longer for children, and never cut off a number.** Children's reply gaps are about 1 s in adult talk, and about 18% of young children's pauses fall mid-phrase vs 7% for adults (IWSDS 2026 paper aclanthology.org/2026.iwsds-1.34; Redford figures via a dev.to blog, 10 pairs, unverified). A cut-off child avoids pauses and says only easy things (blog, weak evidence). Status: small change. Raise end-of-turn silence when a number is expected (about 1.5 to 2.5 s for ages 6-9), shorter for 12-14; extend it again when the transcript ends mid-number.
4. **Stop within about 300 ms when the child speaks, and treat "mm-hm" as not an interruption.** Children kept talking over toys that ignored interruption, and play turned adversarial (arXiv 2604.02629, 2026-04-06, ages 6-11). Status: small change (test on iPad speaker; Sonic 3.6 plays on after a stop, check).
5. **Praise the process and the strategy, specifically.** Process praise raised persistence after failure vs no praise (d = 0.61, N=150, age 7-8; J. Exp. Child Psychology 2024, pubmed 39111151). The same paper cites a risk: teens may read effort praise as "you are not smart". Generic "Good job" is the weak-tutor pattern (Tutor CoPilot). Status: small change. Audit WARM_BANK for "you worked hard on the carry" style lines; use a plainer, strategy-based set for ages 12-14.
6. **Tell the child early that Maya is a computer helper who can make mistakes, and own an error briefly.** A fallibility warning raised hint-seeking in N=252 students without hurting scores (arXiv 2606.03822, 2026-06-02). Children aged 4-7 kept trusting a robot longer when it apologised for an accident (Flanagan et al., Cognition 2024). Six- and eight-year-olds trust AI for facts but not personal matters (Uppsala, 2026-09-16, N=70). Status: later or small change. One child-facing line at call start; one short apology line for a code-found mistake. I did not check whether a spoken disclosure exists today.
7. **Use a warm, named helper with a clear role, and keep every word code-approved.** In a Santa-line field test, children hung up on the low-authority "Helper" persona more in the first minute (65% vs 39%); persuasive framing moved children's choices from 11.6% to 45.7% (arXiv 2609.38782, 2026-09-30, 89 calls, age about 6). Status: Maya already does the code-approved part. Small change: make the greeting introduce Maya by name and job in the first 10 seconds.
8. **Count on voice for engagement, not for extra learning per minute.** Voice raised preference and turns but not mastery, and cost 2.8 times as much (arXiv 2609.23958). Status: later. Track calls per child per week and wrong-answer-to-Maya rate, as the Khanmigo result shows use is the binding limit.

## Not verified

AA numbers read via copies, not the AA page. Cekura reading scores come from a speech-to-text judge. Fix status of LiveKit issue 7773 and whether the Node plugin has the same bug. Whether Inference returns Inworld word times to the Node worker. Inworld ZDR coverage for TTS-2 (docs of 2026-08-15 say all TTS; one review of 2026-10-12 says only TTS-1.5 listed). ElevenLabs child-use clause text (secondary). Child-speech wait-time figures (secondary blog). Rime and Soniox quality, and Inworld's 2026-10-28 update effect on Elo. No study I found tests voice tutors with children aged 6-14 on math learning directly.
