# Maya desk chat

Issue #358 adds the Chat tab to the child's desk at `/tutor`.

Set `MAYA_CHAT_ENABLED=on` on the server to open chat to families with a Stripe plan in `trialing` or `active` status. Leave it unset to keep chat off for real families. Families marked in `test_accounts` can use chat while the switch is off. The server checks the switch, plan and desk child on every request. The desk reads only the child's shipped workbook questions.

A chat uses `mayaCalls`, `createTextSession` and the existing trace format. Its stored kind and channel are `chat`; its mode is `text`. Every Maya line comes from code. Chat has free talk off. An off-topic reading uses the existing decline line without a safety flag. The existing safety interrupt, flag and alert still apply.

The server counts 60 child messages per child per family day. `family-time.ts` computes the day boundaries, including its dated time zone rules. The database locks the child before it counts and claims a message. Different tabs and sessions share this lock. A request id identifies one message. A retry cannot use another message. The call revision prevents an old writer from saving after a replacement. Voice minutes use their existing separate ledger.

The message claim stores the text before it asks the model. A pending request holds a two-minute lease. Any chat request can recover an expired turn for the child, including a turn in another call or on a prior family day. Recovery retains the original request ID, text and receipt. A replacement takes a new call revision before it runs, so an old worker cannot save. The browser keeps only the session id. A definite refusal releases its pending request. An unknown result keeps the same ID and text for a retry. Recovery reads continue after temporary errors with a delay capped at 30 seconds. The enabled "Try again" control can request recovery sooner. It keeps no transcript or message text in browser storage. At the cap, the ordinary call end path writes the outcome, event and note. At the cap, the desk hides the composer, chat buttons and question picker. Maya says, "You used all your messages for today. We can chat again tomorrow." Parent home keeps the exact reset time and date beside the voice minutes under "Maya this week".

`NOTE_CALL_KINDS` now includes `chat`. The database weekly claim accepts that kind too. The existing weekly recap rules apply, including test-family exclusion, note availability, time windows, unsubscribe and prior coverage. Test families get no parent note or recap.

The four migration files are additive. The new message table has row-level security. A parent reads only their own family's rows. Only the server can write or call the claim functions. Its foreign keys cascade through the parent, child and call. The family deletion and retention worker already delete the Auth user and parent row, so those paths also delete chat messages. The family write fence also covers the new table.

The local checks and screenshots use only fake or scripted models. The hosted probes use a marked test family. No paid AI call or email is needed.

The screenshots and probe results are in `.design/experiments/r358/`. Savar must approve the look before merge.

The shared controller keeps the easier example and its steps together above the target question, with space between them. Calls, chat and replay use the same board positions. The chat route reads the child profile grade and passes it into the saved session as `grade`. PR #443 is merged into this branch. Its 25-word limit applies to grades 1-3, including resumed chats.
