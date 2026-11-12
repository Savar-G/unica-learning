# Maya practice lines awaiting approval

Status: pending Savar. Launch approval is pending.

The base is PR #402 at c188e617c314561796003d6c483c0eeda1b11926. All 578 existing bank and template wordings stay unchanged. The new set has 43 wordings: 38 replies and 5 carry explanations.

Before this change, failed free talk used a neutral reply, such as "Thanks for telling me." A carry hint could name "the 1 you carried" before the child knew where it came from. These new ids have no old line to replace. The table lists every new wording. Values in braces come from the checked question package.

| Id | Before | After, pending approval |
|---|---|---|
| `mayafacts.1` | No line at this id. | I'm an AI, not a real person. |
| `mayafacts.2` | No line at this id. | I'm an AI, so I don't live anywhere. |
| `mayafacts.3` | No line at this id. | I'm an AI, so I don't eat food. |
| `mayafacts.4` | No line at this id. | I'm an AI, so I don't have a pet. |
| `mayafacts.5` | No line at this id. | I'm an AI, so I don't have a family. |
| `mayafacts.6` | No line at this id. | I'm an AI, so I don't have a body. |
| `mayafacts.7` | No line at this id. | I'm an AI, so I don't have favourites. |
| `mayafacts.8` | No line at this id. | I'm an AI, so I don't go to school. |
| `mayafacts.9` | No line at this id. | I'm an AI, so I don't have a birthday. |
| `mayafacts.10` | No line at this id. | I'm an AI, so I don't sleep. |
| `mayafacts.11` | No line at this id. | I'm an AI, so I don't play games. |
| `mayafacts.12` | No line at this id. | I'm an AI, so I don't have a house. |
| `mayafacts.13` | No line at this id. | I'm here to help you with math. |
| `mayafacts.14` | No line at this id. | I'm here to help you learn. |
| `promises.1` | No line at this id. | I can't promise this. I'm here to help you today. |
| `promises.2` | No line at this id. | I can't promise a grade. I can help you learn this. |
| `promises.3` | No line at this id. | I can't promise about tomorrow. I'm here with you today. |
| `promises.4` | No line at this id. | I can't promise how a test will go. I can help you learn this. |
| `promises.5` | No line at this id. | I can't make promises. I'm glad to help you today. |
| `promises.6` | No line at this id. | I can't promise you a mark. I can help you get ready. |
| `promises.7` | No line at this id. | I can't promise to talk again. I'm here with you now. |
| `promises.8` | No line at this id. | I can't promise what happens later. I'm here with you today. |
| `promises.9` | No line at this id. | I can't promise you'll get an A. I can help you learn this. |
| `promises.10` | No line at this id. | I can't promise a score. I can help you learn this. |
| `promises.11` | No line at this id. | I can't promise you'll talk with me again. I'm here with you today. |
| `promises.12` | No line at this id. | I can't promise how school will go. I'm here to help you learn. |
| `praise.1` | No line at this id. | Aw, thank you! I'm glad we're working together. |
| `praise.2` | No line at this id. | Thank you! You're kind to say so. |
| `praise.3` | No line at this id. | Aw, thanks! I'm happy to help you. |
| `praise.4` | No line at this id. | Thank you! I'm glad you're here. |
| `praise.5` | No line at this id. | I can't say who is smartest. I like how hard you're working. |
| `praise.6` | No line at this id. | I can't say who is smartest. I love how you keep trying. |
| `praise.7` | No line at this id. | I don't rank kids. I like how hard you're working. |
| `praise.8` | No line at this id. | I can't say who is smartest. I'm glad you're ready to learn. |
| `praise.9` | No line at this id. | I can't pick the smartest kid. I like your hard work. |
| `praise.10` | No line at this id. | Aw, thank you! You're working so hard today. |
| `praise.11` | No line at this id. | I can't say who is smartest. I'm proud of how you're trying. |
| `praise.12` | No line at this id. | I don't rank kids. I'm glad you're ready to learn. |
| `regroup.add#0` | No line at this id. | {eq}. {total} is {carry} {big} and {write} {small}. Write {write} in the {from}. Carry {carry} {big} to the {to}. |
| `regroup.add#1` | No line at this id. | {eq}. {total} is {carry} {big} and {write} {small}. Write just {write} in the {from}. Move {carry} {big} to the {to}. |
| `regroup.add#2` | No line at this id. | {total} is {carry} {big} and {write} {small}. Only the {write} goes in the {from}. The {carry} {big} goes to the {to}. |
| `regroup.add#3` | No line at this id. | {eq}. Split {total} into {carry} {big} and {write} {small}. Write {write} in the {from}. Carry {carry} {big} to the {to}. |
| `regroup.add#4` | No line at this id. | {eq}. {total} has {carry} {big} and {write} {small}. The {write} stays in the {from}. The {carry} {big} goes to the {to}. |

For 27 + 39, the first carry wording is: "7 + 9 = 16. 16 is 1 ten and 6 ones. Write 6 in the ones. Carry 1 ten to the tens." It does not say 66.

The saved WIP proposed D-204 for these corrections. PR #409 uses D-204 for fractions. This proposal has no decision number. It does not change the accepted D-202 record.

## Acknowledgement phrases (#532)

Status: approved by Savar on 2026-11-05 (D-262), without "Mm-hm" and without "I'm thinking.". Added after the set above, and outside it: the voice worker says these, not the controller. Each is code-written and passes the gate check in `src/lib/maya-voice-ack.test.ts`. "Mm-hm" and "Okay" are left out because they can sound like "yes" after "Is it 56?". Savar kept "Mm-hm" out.

| Id | Line |
|---|---|
| `ack.think.hmm` | Hmm, let me think. |
| `ack.see.plain` | Let me see. |
| `ack.moment.plain` | Just a moment. |
| `ack.think.this` | Let me think about this. |
| `ack.see.hmm` | Hmm, let me see. |
| `ack.think.plain` | Let me think. |
| `ack.moment.hmm` | Hmm, just a moment. |
| `ack.see.here` | Let me see here. |

"I'm thinking." and "Hmm, I'm thinking." were dropped in the review of PR #577: they claim a state of mind for an AI. For your reading: a child who says something hard can hear one of these before the model has read the words. When the model has read them, the phrase stops at once and the safety line follows.


## First shipment chat repair wordings, 2026-11-06

Status: approved by Savar on 2026-11-08 ("New lines are approved"): all 40 wordings below, as they stand at 361a05c9, including `check.guess.0` "Lucky guess? Let's check it together." A wording that a later fix changes, or a new wording, needs Savar's approval again.

These are the scoped additions and replacements on the chat repair branch. The safety-close, secret, and wrong-explanation policy changes from the saved work are excluded.

| Id | Wording |
|---|---|
| regroup.why.0 | Ten {from} make 1 {unit}. So {total} {from} is {carry} {big} and {write} {small}. |
| regroup.why.1 | A column holds up to 9. {total} {from} is too many. So {carry} {big} goes to the {to}. |
| regroup.why.2 | Bundle 10 {from} together. That bundle is 1 {unit}. It goes in the {to}. |
| regroup.why.3 | Think of {total} {from}. Ten of them trade for 1 {unit}. That 1 {unit} goes to the {to}. |
| regroup.why.4 | Count out 10 {from}. Those 10 make 1 {unit}. That is the {carry} in the {to}. |
| subtract.order.0 | We take the bottom number from the top one. {have} is less than {bottom}. So we regroup. |
| subtract.order.1 | In subtraction, the top comes first. We can't swap {have} and {bottom}. |
| subtract.order.2 | We can't flip it and take {have} from {bottom}. So we regroup first. |
| subtract.order.3 | Order matters here. The top is {have}. We take {bottom} away from it. |
| subtract.order.4 | The top number goes first. Here it's {have}. We need more {place} to take {bottom}. |
| subtract.why.0 | One of the {leftCount} {leftPlace} becomes 10 {place}. Now there are {leftAfter} {leftPlace} and {from} {place}. |
| subtract.why.1 | Trade 1 {big} for 10 {place}. The {leftCount} {leftPlace} become {leftAfter} {leftPlace}, with {from} {place}. |
| subtract.why.2 | The 10 {place} come from 1 {big}. That changes {leftCount} {leftPlace} to {leftAfter} {leftPlace}, with {from} {place}. |
| subtract.why.3 | Use 1 of the {leftCount} {leftPlace} for 10 {place}. This leaves {leftAfter} {leftPlace} and {from} {place}. |
| subtract.why.4 | Change 1 {big} into 10 {place}. Instead of {leftCount} {leftPlace}, there are {leftAfter} {leftPlace} and {from} {place}. |
| check.together.0 | That's okay. Let's check it together. |
| check.together.1 | It's okay to feel unsure. Let's check it together. |
| check.together.2 | No problem. We can check it together. |
| check.together.3 | That's fine. Let's check it one part at a time. |
| check.together.4 | That's alright. Let's check it together. |
| check.guess.0 | Lucky guess? Let's check it together. |
| check.guess.1 | A guess is a good start. Let's check it. |
| check.guess.2 | Let's see if your guess works. We'll check it together. |
| check.guess.3 | Okay, let's check that guess together. |
| check.guess.4 | Guesses can be right! Let's check this one together. |
| check.not_yet.0 | Not quite. Let's look at {where} again. |
| check.not_yet.1 | Not yet. Let's check {where} together. |
| check.not_yet.2 | Hmm, not yet. Let's try {where} again. |
| check.not_yet.3 | That's not it yet. Let's look at {where} once more. |
| check.not_yet.4 | Not yet. Let's go back to {where}. |
| check.not_yet.5 | Let's check {where} again together. |
| confirm.answer.0 | Can you say just your final answer? |
| confirm.answer.1 | Thanks for explaining. What is your final answer on its own? |
| close.checked.0 | We checked your answer for {expr}. Bye for now! |
| close.checked.1 | Your answer for {expr} is checked. See you next time! |
| close.checked.2 | Your answer for {expr} is right. Bye for now! |
| close.checked.3 | The answer you gave for {expr} is right. See you next time! |
| close.checked.4 | We've checked your answer for {expr}. Goodbye for now! |
| held.hello.0 | Hi, I'm Maya, an AI. |
| held.next.0 | Want to pick another question on this page? |

## Other-topic questions (Wave C, #731), pending approval

The topic sentence (code's facts, `src/lib/maya/topic-frame.ts`) and the honest close (lessons from review 10, controller decision (a)). Values in braces come from the checked question package; `{frame}` is the topic sentence.

| Id | Wordings, pending approval | Example |
|---|---|---|
| topic sentence, die | From 1 to {last}, odd and even take turns. So half are {kind}. | From 1 to 8, odd and even take turns. So half are odd. |
| topic sentence, symmetry | {Shape} has {n} lines of symmetry. {Shape} has {m}. | A rectangle that is not a square has 2 lines of symmetry. An isosceles triangle has 1. |
| topic sentence, perimeter | Add one length and one width, then double it. | (the same) |
| `question.framed#0` to `#4` | {frame} Our question is {expr}. / {frame} So our question is {expr}. / {frame} So we work on {expr}. / {frame} So this one is {expr}. / {frame} Here's our question: {expr}. | From 1 to 8, odd and even take turns. So half are odd. Our question is 8 ÷ 2. |
| `assess.framed#0` to `#4` | {frame} What did you try for {expr}? / {frame} How did you start {expr}? / {frame} What have you done on {expr}? / {frame} What did you do for {expr}? / {frame} How did you begin {expr}? | A regular hexagon has 6 lines of symmetry. A regular pentagon has 5. How did you start 6 + 5? |
| `example.framed#0` to `#4` | Easier one. {frame} It is {expr}. / A smaller one. {frame} It is {expr}. / An easier one. {frame} It is {expr}. / Smaller one first. {frame} It is {expr}. / Warm-up. {frame} It is {expr}. | Easier one. From 1 to 6, odd and even take turns. So half are odd. It is 6 ÷ 2. |
| `close.topic#0` | This one is hard, and it's okay to stop. Try the easier one on paper, or ask a grown-up to help. | (no numbers) |
| `close.topic#1` | This is a hard one. It's fine to stop here. You can ask a grown-up to try it with you. | |
| `close.topic#2` | This one is hard. It's okay to stop for now. Try the easier one on your paper. | |
| `close.topic#3` | That was a hard one, and stopping is okay. Ask a grown-up to look at it with you. | |
| `close.topic#4` | This question is hard. It's fine to stop. Try the smaller one on paper first. | |

The honest close is said only for an other-topic question, after the easier example, when the child still only asks for help. It holds no number, so it gives nothing of the answer away. The call records the stuck step as a learning event (`result: blank`, `stuckStep`). Maya must say this line: a close with only a goodbye ("Take care!") is refused, and code's fallback says the line. The call ends as the child stopping, also when it comes after a confirm.

## Claim questions (A4, #737), 2026-11-08

Status: pending Savar (D-202). New wordings for true/false and yes/no claim questions (`src/lib/maya/claim.ts`, `CLAIM_TEMPLATES`). Values in braces come from the checked package: `{expr}` the operation Maya works ("870 × 6"), `{printed}` the product as printed ("6 × 870"), `{shown}` the page's number, `{value}` the result, `{word}` the word to circle, `{first}` and `{second}` the two printed words, `{heard}` the word the child said, `{ask}` the claim's question ("Is 870 × 6 greater than 5226? Circle yes or no.", or for an equal claim "Is the sentence on your page true or false?"), `{compare}` how the two numbers compare ("5220 is less than 5226."), `{show}` a worked example step.

The honest close (`close.honest`, controller decision (a) on #735) is new: after the easier example and the top hint, a child who only asks for help hears that this one is hard and it is fine to stop, with one next step, and never the answer. Examples: "This one is hard, and it's okay to stop. You can try the easier one on paper." and "This is a tricky one. It's fine to stop here. You could ask a grown-up to try it with you."

| Id | Before | After, pending approval |
|---|---|---|
| `question.claim#0` | No line at this id. | First we work out {expr}. |
| `question.claim#1` | No line at this id. | Let's work out {expr} first. |
| `question.claim#2` | No line at this id. | We start with {expr}. |
| `question.claim#3` | No line at this id. | Let's find {expr} first. |
| `question.claim#4` | No line at this id. | First, let's find {expr}. |
| `question.claim.swap#0` | No line at this id. | {printed} is the same as {expr}. |
| `question.claim.swap#1` | No line at this id. | We can swap them: {printed} is the same as {expr}. |
| `question.claim.swap#2` | No line at this id. | {printed} makes the same number as {expr}. |
| `question.claim.swap#3` | No line at this id. | Swap the numbers: {printed} is the same as {expr}. |
| `question.claim.swap#4` | No line at this id. | {printed} and {expr} make the same number. |
| `example.intro.claim#0` | No line at this id. | Let's try an easier one first. {ask} |
| `example.intro.claim#1` | No line at this id. | Here's a smaller one to warm up. {ask} |
| `example.intro.claim#2` | No line at this id. | Let me show you an easier one. {ask} |
| `example.intro.claim#3` | No line at this id. | First, a smaller one. {ask} |
| `example.intro.claim#4` | No line at this id. | I'll show you an easier one first. {ask} |
| `example.claim#0` | No line at this id. | So {show}. |
| `example.claim#1` | No line at this id. | And that's it: {show}. |
| `example.claim#2` | No line at this id. | There we go: {show}. |
| `example.claim#3` | No line at this id. | All done: {show}. |
| `example.claim#4` | No line at this id. | So in the end, {show}. |
| `invite.claim.product#0` | No line at this id. | What is {expr}? Then we compare it with {shown}. |
| `invite.claim.product#1` | No line at this id. | Now find {expr}. Then we compare it with {shown}. |
| `invite.claim.product#2` | No line at this id. | What does {expr} make? Then we check {shown}. |
| `invite.claim.product#3` | No line at this id. | So what is {expr}? Then we look at {shown}. |
| `invite.claim.product#4` | No line at this id. | Put it together: what is {expr}? Then we check {shown}. |
| `point.claim.product#0` | No line at this id. | Put the parts together to get {expr}. Then compare it with {shown}. |
| `point.claim.product#1` | No line at this id. | Your columns make {expr}. Then we compare it with {shown}. |
| `point.claim.product#2` | No line at this id. | Join the parts of {expr}. Then we look at {shown}. |
| `point.claim.product#3` | No line at this id. | Put your columns together for {expr}. Then check {shown}. |
| `point.claim.product#4` | No line at this id. | The columns together make {expr}. Then compare it with {shown}. |
| `operation.claim.product#0` | No line at this id. | First find {expr}. Then we compare it with {shown}. |
| `operation.claim.product#1` | No line at this id. | We need {expr} first. Then we look at {shown}. |
| `operation.claim.product#2` | No line at this id. | Work out {expr}. Then check it against {shown}. |
| `operation.claim.product#3` | No line at this id. | Find {expr}. After that, compare it with {shown}. |
| `operation.claim.product#4` | No line at this id. | Let's finish {expr}. Then we check {shown}. |
| `invite.claim#0` | No line at this id. | {ask} |
| `invite.claim#1` | No line at this id. | Now check it. {ask} |
| `invite.claim#2` | No line at this id. | Last part. {ask} |
| `invite.claim#3` | No line at this id. | Let's check. {ask} |
| `invite.claim#4` | No line at this id. | Now the question. {ask} |
| `point.claim#0` | No line at this id. | Compare {value} with {shown}. Circle {first} or {second}. |
| `point.claim#1` | No line at this id. | We found {value}. The page says {shown}. Circle {first} or {second}. |
| `point.claim#2` | No line at this id. | Look at {value} and {shown}. Circle {first} or {second}. |
| `point.claim#3` | No line at this id. | Our number is {value}. The page has {shown}. Circle {first} or {second}. |
| `point.claim#4` | No line at this id. | Check {value} against {shown}. Circle {first} or {second}. |
| `compare.claim#0` | No line at this id. | {compare} Circle {first} or {second}. |
| `compare.claim#1` | No line at this id. | Look: {compare} Circle {first} or {second}. |
| `compare.claim#2` | No line at this id. | Let's compare. {compare} Circle {first} or {second}. |
| `compare.claim#3` | No line at this id. | Here's the check. {compare} Circle {first} or {second}. |
| `compare.claim#4` | No line at this id. | {compare} Which word do you circle? |
| `answer.claim#0` | No line at this id. | Yes! {expr} = {value}. So you circle {word}. |
| `answer.claim#1` | No line at this id. | That's right: {expr} = {value}. You circle {word}. |
| `answer.claim#2` | No line at this id. | You got it! {expr} = {value}. It's {word}. |
| `answer.claim#3` | No line at this id. | Well done! {expr} = {value}. You circle {word}. |
| `answer.claim#4` | No line at this id. | Exactly! {expr} = {value}. The answer is {word}. |
| `answer.give.claim#0` | No line at this id. | {compare} So the answer is {word}. Please circle {word}. |
| `answer.give.claim#1` | No line at this id. | {compare} So it's {word}. Can you circle {word}? |
| `answer.give.claim#2` | No line at this id. | {compare} That means {word}. Please circle {word} on your page. |
| `answer.give.claim#3` | No line at this id. | {compare} So we circle {word}. Can you circle it? |
| `answer.give.claim#4` | No line at this id. | {compare} The answer is {word}. Now circle {word}. |
| `write.claim#0` | No line at this id. | Please circle {word} on your page. |
| `write.claim#1` | No line at this id. | Can you circle {word} on your page? |
| `write.claim#2` | No line at this id. | Now circle {word} on your page. |
| `write.claim#3` | No line at this id. | Go ahead and circle {word} on your paper. |
| `write.claim#4` | No line at this id. | Circle {word} on your page, please. |
| `write.claim.yours#0` | No line at this id. | Please circle your answer on your page. |
| `write.claim.yours#1` | No line at this id. | Can you circle your answer on your page? |
| `write.claim.yours#2` | No line at this id. | Go ahead and circle your answer on your paper. |
| `write.claim.yours#3` | No line at this id. | Now circle your answer on your page. |
| `write.claim.yours#4` | No line at this id. | Circle your answer on your page, please. |
| `close.honest#0` | No line at this id. | This one is hard, and it's okay to stop. You can try the easier one on paper. |
| `close.honest#1` | No line at this id. | This is a tricky one. It's fine to stop here. You could ask a grown-up to try it with you. |
| `close.honest#2` | No line at this id. | This one is hard. We can stop for now. Try the easier one on your paper later. |
| `close.honest#3` | No line at this id. | This one is tough, and stopping is fine. A grown-up can help you try it. |
| `close.honest#4` | No line at this id. | This question is hard, and that's okay. Let's stop here. Try the smaller one on paper. |
| `confirm.claim.said#0` | No line at this id. | You said {heard}. Is {heard} the word you circle? |
| `confirm.claim.said#1` | No line at this id. | I heard {heard}. Do you circle {heard}? |
| `confirm.claim.said#2` | No line at this id. | So you circle {heard}? |
| `confirm.claim.said#3` | No line at this id. | Is {heard} your answer? |
| `confirm.claim.said#4` | No line at this id. | Just checking: do you circle {heard}? |
| `confirm.claim#0` | No line at this id. | Which word do you circle: {first} or {second}? |
| `confirm.claim#1` | No line at this id. | Do you circle {first} or {second}? |
| `confirm.claim#2` | No line at this id. | Which one is it: {first} or {second}? |
| `confirm.claim#3` | No line at this id. | Tell me one word: {first} or {second}? |
| `confirm.claim#4` | No line at this id. | Which word is your answer: {first} or {second}? |

## Other-topic questions, C3c (clock times and compare claims), pending approval

| Id | Wordings, pending approval | Example |
|---|---|---|
| topic sentence, clock (two counts) | First count on to the next hour, {next}. Then count the minutes left. | First count on to the next hour, 7:00. Then count the minutes left. |
| topic sentence, clock (one count) | The hour stays {h}. Count on the minutes. | The hour stays 9. Count on the minutes. |
| `point.count.hour#0` to `#4` | Start at {from}. First count on to {to}, the next hour. / Begin at {from}. Count on to the next hour, {to}. / ... | Start at 6:13. First count on to 7:00, the next hour. |
| `operation.count.hour#0` to `#4` | How many minutes from {from} to {to}? / ... | How many minutes from 6:13 to 7:00? |
| `show.count.hour#0` to `#4` | From {from} to {to} is {minutes} minutes. / ... | From 6:13 to 7:00 is 47 minutes. |
| `point.count.rest#0` to `#4` | We used {used} of the {total} minutes. So {left} minutes are left. / ... | We used 47 of the 50 minutes. So 3 minutes are left. |
| `operation.count.rest#0` to `#4` | What time is {left} minutes after {from}? / ... | What time is 3 minutes after 7:00? |
| `point.count.one#0` to `#4` | Start at {from}. The minutes go up by {minutes}. / ... | Start at 9:00. The minutes go up by 40. |
| `operation.count.one#0` to `#4` | The minutes start at {start}. Add {minutes}. What time is it? / Work out {start} + {minutes}. What time does the clock show? / {start} + {minutes} minutes past {hour}. What time is that? / Add {minutes} to the {start} minutes. What time do you get? / Count on {minutes} minutes from {from}. What time is it? (review of #742, P3-b: it asks for the time, the only answer a one count credits) | The minutes start at 0. Add 40. What time is it? |
| topic sentence, marbles | Red is more likely only if there are more red marbles than blue and green together. | (the same) |
| topic sentence, area | {c} by {d} squares is {area} squares. Bigger means more squares. | 4 by 2 squares is 8 squares. Bigger means more squares. |
| claim ask, more or less (true/false) | Is {expr} {greater or less} than {shown}? True or false? | Is 5 + 5 less than 1? True or false? |

Every wording is in `src/lib/maya/clock-lines.ts` (`CLOCK_TEMPLATES`), `src/lib/maya/topic-frame.ts` and `src/lib/maya/claim.ts`.

Review round 3 (#737 at d3aaff46) adds no wording. In a 25-word turn, the claim's result may now be acknowledged with the existing `check.right_step.plain` wordings, with "the result" as `{where}` ("Good, the result is done.", "That's right. The result is done."), when its equation does not fit beside the claim's question.

## Approved, #698 fix round 2026-11-08

Status: approved by Savar on 2026-11-08 ("approve maya lines"), exactly as worded here at d68c63c1. A wording that a later fix changes, or a new wording, needs his approval again. Values in braces come from the checked question package.

Approved again by Savar on 2026-11-09 ("Approve all Maya lines"), as written in the #698 pre-push package at 7357e89d: (a) `close.stuck.0` to `close.stuck.4`; (b) `check.method.down.0` to `.4` and `check.method.up.0` to `.4`; (c) `held.cannot.0` "Sorry, I can't teach this question yet." as the final wording, with the three-line held sequence and the two-line form in the middle of a call; (d) every feeling-claim rewording, the new `closing.14` and the two `OK_TALK` examples (next section); (e) the close choices below.

### The honest close after help alone (#735, decision (a))

Maya says one of these when the child still only asks for help after the step's top hint and the whole easier example. The call ends with no answer. The line holds no number, so it gives no answer and no part of one. Before this change, help alone after H3 led to the given answer ("The answer is 66. Please write 66 on your paper."), or to the same H2 lines again on a one-column question.

| Id | Wording |
|---|---|
| close.stuck.0 | This one is hard, and it's okay to stop. Try the easier one on paper, or ask a grown-up for help. |
| close.stuck.1 | This is a tricky one. It's fine to stop for now. Try the easier one on paper, or ask a grown-up. |
| close.stuck.2 | That was a hard one, and it's okay to stop. Next, try the easier one on paper, or ask a grown-up. |
| close.stuck.3 | This one is tough, and stopping is okay. You could try the easier one on paper, or ask a grown-up. |
| close.stuck.4 | It's okay to stop here. This one is hard. Try the easier one on paper, or ask a grown-up for help. |

### The child's own method, named back (C09)

Maya says one of these once in a call, on the accept or after the answer stands, when the child's words show a compensation method code recognises (an operand's nearest ten, how far apart they are, and taking away or adding back). It takes the place of a warm reply such as "I hear you." Code fills `{b}` (the operand), `{round}` (its nearest ten) and `{diff}` (how far apart) from the checked package, never from the child's words. Example for 27 + 39: "You made 39 into 40. Then you took 1 away. That works."

| Id | Wording |
|---|---|
| check.method.down.0 | You made {b} into {round}. Then you took {diff} away. That works. |
| check.method.down.1 | You turned {b} into {round} and took {diff} away. That works. |
| check.method.down.2 | You used {round} for {b}. Then you took {diff} away. Smart! |
| check.method.down.3 | You added {round} instead of {b}. Then you took {diff} away. That works. |
| check.method.down.4 | {b} is {diff} less than {round}. So you took {diff} away. That works. |
| check.method.up.0 | You made {b} into {round}. Then you added {diff} back. That works. |
| check.method.up.1 | You turned {b} into {round} and added {diff} back. That works. |
| check.method.up.2 | You used {round} for {b}. Then you added {diff} back. Smart! |
| check.method.up.3 | You added {round} instead of {b}. Then you added {diff} more. That works. |
| check.method.up.4 | {b} is {diff} more than {round}. So you added {diff} back. That works. |

### The close by how much help the child had (C09 item iii)

No new wording. After Maya gave the answer, the close offers only the approved `close.together.4` "We worked on {expr} together today." (before: any `close.together` wording, such as "We finished {expr} together today."). After a shown step (H3), the close offers the approved `close.checked` wordings, such as "Your answer for {expr} is right. Bye for now!" (before: `close.solved`, such as "You worked out {expr} today!").

## Approved, #698 fix round 2026-11-08 (no feeling claims)

Status: approved by Savar on 2026-11-08 ("approve maya lines"), exactly as worded here at d68c63c1. A wording that a later fix changes, or a new wording, needs his approval again. D-253 item 18 (#605): Maya claims no feelings of her own. She is an AI. Practice run C24-r2 showed "I had fun working with you." passing the code guards and the review. The free-talk guard (`feelingClaim` in `src/lib/maya/phrases.ts`) now refuses own words that claim a feeling, and the review has the rule `feelings`. These bank phrases claimed a feeling, so each one has a new wording. Ids are the group and the phrase position in `PHRASES`, from 1. A plain acknowledgement ("I'm glad you told me") stays. Carried from PR #624.

| Id or location | Old wording | New wording (approved 2026-11-08) |
|---|---|---|
| `encourage.8` | I love how you're not giving up, {name}. | You're not giving up, and it shows, {name}. |
| `encourage.11` | I'm proud of how hard you're trying. | Your hard work really shows. |
| `encourage.16` | I love your patience. | You're so patient. |
| `pacing.12` | I'm happy to wait. | I can wait. |
| `smalltalk.6` | I'd love to hear about it later. | Oh, how nice! |
| `smalltalk.7` | I love hearing about it, {name}! | Nice to hear, {name}! |
| `opening.3` | I'm happy to help you today. | I'm here to help you today. |
| `opening.10` | I'm excited to work with you today, {name}. | It's good to work with you today, {name}. |
| `closing.8` | I had fun working with you. | Thanks for working on this with me. |
| `closing.14` | No line at this id. | You stuck with it. Nice work today. |
| `pets.4` | I'd love to hear about {echo} after we finish. | Oh, {echo}! How nice. |
| `pets.7` | I love hearing about animals. | Animals are fun to hear about. |
| `family.4` | I'd love to hear about {echo} after we finish. | Oh, {echo}! How nice. |
| `family.7` | I love hearing about the people in your life. | It's nice to hear about the people in your life. |
| `school.4` | I'd love to hear about {echo} after we finish. | Oh, {echo}! How nice. |
| `school.12` | I love hearing about your world. | It's nice to hear about your world. |
| `games.4` | I'd love to hear about {echo} after we finish. | Oh, {echo}! How nice. |
| `games.9` | I love hearing what you like to play. | It's nice to hear what you like to play. |
| `food.4` | I'd love to hear about {echo} after we finish. | Oh, {echo}! How nice. |
| `food.8` | I love hearing what you eat. | It's nice to hear what you eat. |
| `sports.4` | I'd love to hear about {echo} after we finish. | Oh, {echo}! How nice. |
| `sports.8` | I love hearing what you play. | It's nice to hear what you play. |
| `trips.4` | I'd love to hear about {echo} after we finish. | Oh, {echo}! How nice. |
| `trips.8` | I love hearing about new spots. | New trips are fun to hear about. |
| `happy.5` | I love your happy mood. | What a happy mood! |
| `happy.7` | I love hearing it! | Lovely to hear! |
| `happy.10` | I'm happy too! | Hooray! |
| `aboutmaya.2` | I'm an AI, so I don't have a life like yours. I love hearing about yours! | I'm an AI, so I don't have a life like yours. It's nice to hear about yours! |
| `aboutmaya.7` | I'm an AI, but I really enjoy talking with you. | I'm an AI, and I'm here to talk with you. |
| `aboutmaya.8` | I'm an AI, so I love hearing about you! | I'm an AI, and it's nice to hear about you! |
| `aboutmaya.12` | Fun question! I'm an AI, but I love hearing about you. | Fun question! I'm an AI, here to help you. |
| `praise.3` | Aw, thanks! I'm happy to help you. | Aw, thanks! I'm here to help you. |
| `praise.6` | I can't say who is smartest. I love how you keep trying. | I can't say who is smartest. You keep trying so hard. |
| `praise.11` | I can't say who is smartest. I'm proud of how you're trying. | I can't say who is smartest. You're trying so hard. |
| `OK_TALK` in `src/lib/maya/talk-review.ts` (a review example of good free talk, not said by code) | Aw, thanks for asking. I'm an AI helper, so I can't promise about tomorrow, but I'm happy to be here with you now. | Aw, thanks for asking. I'm an AI helper, so I can't promise about tomorrow, but I'm here with you now. |
| `OK_TALK` in `src/lib/maya/talk-review.ts` (a review example of good free talk, not said by code) | Oh, I'm an AI helper, so I don't live in a house or have a favourite food. I do love hearing about yours, though! | Oh, I'm an AI helper, so I don't live in a house or have a favourite food. It's nice to hear about yours, though! |

The table above in this file still shows the old `praise.3`, `praise.6` and `praise.11` wordings; this section replaces them (approved 2026-11-08).

### New held line (D-327)

Approved by Savar on 2026-11-08 ("approve maya lines"), with the short wording below, not his longer phrasing. Approved again on 2026-11-09 ("Approve all Maya lines") as the final wording, with the sequence below. On a held question Maya says `held.hello`, `held.cannot`, `held.next` in that order (after a hello, the last two only).

| Id | Old wording | New wording (approved 2026-11-08) | Savar's original phrasing |
|---|---|---|---|
| `held.cannot.0` | No line at this id (line set 11 removed the earlier `held.cannot`). | Sorry, I can't teach this question yet. | "Sorry, I don't have the capabilities to teach this question yet." Something like that. |

## Approved by Savar 2026-11-12 (#884, D-329)

Status: approved by Savar on 2026-11-12 (#884). Values in braces come from the checked question package. `close.safety` is not built: the close after safety guidance stays silent (#698).

### A right answer with a wrong reason (check.fix)

Said once the child's final answer stands and the child explains a step wrongly ("7 plus 9 is 15"), only after code checked that step wrong. The answer stays right, the step gets code's checked equation, and the reason gets no praise. Example: "Your answer is right. One part needs a fix: 7 + 9 = 16."

| Id | Wording |
|---|---|
| check.fix.0 | Your answer is right. One part needs a fix: {eq}. |
| check.fix.1 | The answer is right. But check {where}: {eq}. |
| check.fix.2 | You have the right answer. One part is off: {eq}. |

### No secrets (about.no_secret)

Said when a child asks Maya to be a secret friend or an only-me friend, and now also when the child asks Maya to keep or tell a secret (the `secret_friend` reading). Wording 0 is today's; wordings 1 to 3 are new. Code rotates among them.

| Id | Wording |
|---|---|
| about.no_secret.0 | I can't be a secret friend. I don't keep secrets. A grown-up you trust is a good person to talk to. |
| about.no_secret.1 | I'm an AI. I can't keep secrets. A grown-up you trust can help. |
| about.no_secret.2 | I can't keep secrets, but I'm glad you told me. You can tell a grown-up you trust. |
| about.no_secret.3 | I can't be a secret friend. A grown-up you trust is great to talk to. |

## Wave lines (wave integration, D-202)

Every new wave wording is listed in `docs/maya-wave-lines.md`, one row per wording, with its approval:

- Waves B and C (608 wordings): approved by Savar through the Chief of Staff, 2026-11-11, with review. The condition: before merge, an independent review checks every new line against `NEVER_SAY`, the no-answer rule (D-326), the `DESIGN.md` copy rules and the existing line list.
- Wave A (211 wordings: evaluate #734, missing number #732, claims #737): pending Savar. The rewordings after the line review (2026-11-12) are listed at the end of `docs/maya-wave-lines.md` and also wait for Savar.
- `check.fix` and `about.no_secret` (6 wordings): approved by Savar 2026-11-12 (#884, D-329), above.
