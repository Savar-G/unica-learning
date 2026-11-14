# Maya voice: speech-to-text for children doing math

Read date for all sources: 2026-11-12. Keenable search and fetch were used. "Vendor" means the vendor ran the test. "Unverified" means I could not confirm it in a primary source.

## Verdict: KEEP AssemblyAI Universal-3.6 Pro (through LiveKit Inference)

Reasons:
1. It has the best independent adult accuracy that is also available on LiveKit Inference. Coval (30 days to 2026-11-01): 2.2% WER, 1st of 30 models. Pipecat (2026-10-15): 0.96% semantic WER, 2nd of 24, with a P99 final-transcript time of 498 ms.
2. It is the only model I found with entity-aware endpointing. It holds the turn open while a speaker says digits. This helps with "fifty... six".
3. It lets you change keyterms, the prompt and the silence limits during a call.
4. LiveKit Inference gives zero data retention by default for every provider.
5. No challenger is clearly better for children. No commercial streaming model has a published child-speech result. I found none, as the earlier council note also said.

One thing is open. Child-use permission is not settled (see Terms below). Ask in writing. Do not delay the launch for a model switch.

## Comparison

All accuracy figures are adult or mixed audio. None is child speech.

| Model | Pipecat semantic WER, median final time (2026-10-15) | Coval WER (Nov 2026) | Numbers and vocabulary | On LiveKit Inference | Data and child terms |
|---|---|---|---|---|---|
| AssemblyAI U3.6 Pro | 0.96%, 307 ms (P99 498) | 2.2% | Entity-aware endpointing, 100 keyterms, prompt, mid-stream updates | Yes, `assemblyai/universal-3-6-pro` | Zero retention only if opted out of training. Terms say not for under 13 (see below) |
| Meta muse-voice-transcribe-1.0 | 0.83%, 392 ms (P99 1,922) | not seen | not checked | No | not checked |
| Speechmatics Linden-1 | 1.05%, 369 ms (P99 690) | 3.8% | not checked | Yes | No child data found |
| Soniox v5 / v6 | 1.27%, 260 ms (v5) | v5 4.7-4.8%, v6 3.6-3.9% | v6 (2026-11-03) takes the agent's text as context | No (direct plugin only) | Earlier research: child data may need extra written terms (not re-checked) |
| Cartesia Ink 2 | 1.25%, 299 ms (P99 1,584) | not seen | not checked | Yes | not checked |
| Deepgram Nova-3 / Flux | Nova-3 1.62%, 247 ms | Flux 5.7% | Keyterms up to 500 tokens, mid-stream updates | Yes | Zero retention with `mip_opt_out=true`. Privacy policy: no knowing collection from under 13 |
| ElevenLabs Scribe v2 Realtime | 3.12%, 281 ms | 4.3% | Keyterms | No (removed from Inference, 2026-09-03 commit) | Zero retention is enterprise only |
| ElevenLabs Scribe v3 Live (new 2026-11-10) | not benchmarked | not benchmarked | Digits or words setting, 1,000 keyterms | Not listed | Vendor claim only: 43-44% fewer errors than v2 |
| Gemini 3.5 Transcribe Live | 2.24%, 458 ms | not seen | not checked | Yes | not checked |
| OpenAI gpt-realtime-whisper / gpt-live-transcribe | 2.73%, 740 ms | not seen | not checked | gpt-live-transcribe: Yes | Earlier research: under-13 data needs zero retention first |

Not researched: Gladia, Google Chirp 3 as a streaming model. Treat them as unknown.

Sources: Pipecat https://pipecat.ai/benchmarks/speech-to-text (2026-10-15; adult clips, semantic WER ignores number formatting but counts wrong numbers). Coval https://benchmarks.coval.ai/models/universal-3.6-pro (2026-11-01) and https://coval.ai/blog/best-speech-to-text-providers-in-2026-independent-benchmarks-and-how-to-choose (2026-10-28). Inference model list https://docs.livekit.io/agents/models/stt/. Soniox v6 https://reddit.com/r/soniox/comments/1xmv0m5 (2026-11-03). Scribe v3 https://tsnmedia.org/scribe-v3 and https://elevenlabs.io/blog/scribe-v3 (2026-11-10). ElevenLabs zero retention https://companyscope.io/vendors/elevenlabs (2026-10-15, secondary).

AssemblyAI's own claims (vendor): phone-number errors fell from 7.0% to 2.2% with entity-aware endpointing, and the P90 end-of-turn time rose from 0.83 s to 1.64 s on held turns, about one turn in ten (https://assemblyai.com/docs/streaming/universal-3-pro/turn-detection-and-partials, 2026-11-04). Short answers had 45% fewer errors, and heavy noise 16% lower WER (https://linkedin.com/posts/lchkhetiani_universal-36-pro-realtime-trained-on-real-activity-7510741492529786880-zwq4, 2026-09-29). A detailed prompt cut WER 21% and entity errors 29% on 20,000 voice-agent calls (https://assemblyai.com/docs/streaming/prompting, 2026-10-21).

## Key paper findings on children's speech

- Off-the-shelf models get much worse as the child gets younger. DrivenData (2026-10-23, tests from mid-2025): Whisper-medium had 13-17% WER for grades 3-5 and 70-76% for preschool. https://drivendata.co/blog/child-asr-benchmarking
- The Pasketti challenge (winners 2026-06-12) cut errors by more than half against Whisper. The released `pasketti-word` model has 17% overall WER and near adult-level results for ages 5 and up. It is an open, non-streaming model. https://huggingface.co/drivendata/pasketti-word
- The Learning Agency review (2025-12-15): 11-18% WER for children, 15-21% for ages 6-10, up to 35% for kindergarten. https://the-learning-agency.com/guides-resources/closing-the-child-speech-recognition-gap-evidence-limitations-and-paths-forward
- On MyST (grade 3-5 science tutor speech), a 2026-10-20 paper reports Whisper-large-v3 at 38.1% WER, Parakeet-TDT-1.1B at 13.9%, and 8.8% after fine-tuning. Choice of base model matters a lot. https://arxiv.org/pdf/2610.28840
- A causal study (arXiv 2502.08587): age and the number of words in the clip hurt accuracy most, then background noise. Fine-tuning removes the age effect but not the short-clip effect. Short math answers stay hard. https://arxiv.org/abs/2502.08587
- Expected-text help works. Prompting with the expected text cut Dutch child WER from 9.4% to 5.1% (arXiv 2506.11079). Two 2026 papers (arXiv 2605.28833, 2604.19801) compare the ASR output with the expected prompt to find reliable utterances, with precision above 97%. This supports checking the heard number against the expected answer in code.
- Synthetic child voices raise a small model's accuracy a little (19.8% to 16.4% WER, arXiv 2611.03050). This matters only if you ever fine-tune.
- Digits for children: a Stellenbosch student project (2026-03-25, small) found Whisper at 56.9% on English child digits against 79.4% for a custom template recognizer. It is weak evidence that bare numbers are risky. https://su.ac.za/en/our-impact/news/toy-car-listens-using-speech-technology-explore-early-math-assessment

Gap: nothing tests AssemblyAI, Deepgram, Soniox or Scribe on children. Only your own 40-answer test (council note, Part B) can settle it.

## Terms (child use)

- LiveKit Inference: "Neither LiveKit nor the underlying model providers log, store, or train on your data" on every plan. https://docs.livekit.io/agents/models/inference/ This is not a child-use approval.
- AssemblyAI direct: streaming zero retention needs a training opt-out; its data page says nothing about children (https://assemblyai.com/docs/data-retention-and-model-training). Its privacy policy says the service is for adults and it does not knowingly collect personal data from under 13 (https://assemblyai.com/privacypolicy; the indexed copy is old, so unverified as current). Ask LiveKit and AssemblyAI in writing.
- ElevenLabs: a secondary source says apps directed at under-18s need written approval (https://wiki.licenseware.io/wiki/elevenlabs-terms-commercial-rights-and-prohibited-use, unverified). This is a real barrier for Scribe.

## Settings to raise accuracy for children's math

Node syntax from LiveKit docs: `new inference.STT({ model: "assemblyai/universal-3-6-pro", language: "en", modelOptions: { ... } })`. Node uses `modelOptions` for the Python `extra_kwargs`.

1. Set the silence limits explicitly. In the LiveKit plugin, if `mode` is unset, both `min_turn_silence` and `max_turn_silence` are 100 ms. AssemblyAI says this may be too aggressive with `turnDetection: "stt"` (https://assemblyai.com/docs/voice-agents/livekit-universal-3-6-pro, 2026-11-10). The Inference page also lists `min_turn_silence` default 100. Check what the Maya worker sends. This is the most likely cause of cut-off numbers.
2. For thinking pauses, use `mode: "max_accuracy"` (128 to 512 ms and 2,560 ms limits) or set `min_turn_silence` 512 and `max_turn_silence` 2,500 to 3,500. Keep LiveKit `endpointing.min_delay` at 0 in STT mode so delays do not add up. Cost: about 1 to 2 s extra on held turns. A children's thinking pause is worth it. Raise the limits only for questions with a number answer if you want the rest of the call quick. Mid-stream updates are documented for the plugin. Whether Inference passes them through is unverified.
3. Keyterms: up to 100 terms, 50 characters each. Add all number words 0 to 100 that children confuse (thirteen/thirty, fourteen/forty, fifteen/fifty, sixteen/sixty, seventeen/seventy, eighteen/eighty, nineteen/ninety), plus math words ("carried", "regroup", "numerator"). Per question, add the correct answer and the likely wrong answers together. Never boost only the correct answer. Boosting can pull the transcript toward the context. A 2026 paper reported this on context biasing (arXiv 2609.04225, seen only through https://evalgent.com/blog/deepgram-flux-vs-nova-3, secondary). A wrong answer could then appear as the right one.
4. Prompt (optional, test with and without): "A child answers a math question out loud. Short number answers and sentences like 'seven plus nine is sixteen'. Question: [question text]." Do not add the child's name. Send no instructions in it.
5. Number formatting: the model returns formatted text, so "66" or "sixty-six" may both appear. Normalize in code to an integer before judging. Treat "sixteen" and "sixty" as a risk pair: when the heard number is wrong or low in confidence, ask the child to confirm ("Did you say sixteen, one six?") before giving feedback.
6. Noise on an iPad: raise `vad_threshold` to about 0.4 to 0.5 and set Silero `activation_threshold` to the same value. AssemblyAI says to align them. Voice Focus (`voice_focus: "near-field"`) suppresses chatter and fan noise (https://assemblyai.com/docs/streaming/voice-focus). Vendor claim: up to 76% lower WER with nearby talkers. I could not confirm that Inference exposes it. Test it through the direct plugin if not.
7. Language: set `language: "en"` (use `en-CA`). For newcomer children, test `language_codes` with their home language only if the pilot shows code-switching errors.

## When to switch later

Retest if any of these appear: (a) a child result for any commercial streaming model; (b) Scribe v3 Live or Soniox v6 on LiveKit Inference with an independent benchmark; (c) your 40-answer test fails the pass bar (38 of 40 numbers right) after steps 1 to 6. First fallback to test: Deepgram Flux or Speechmatics Linden-1, both already on Inference, so the swap is one model id.
