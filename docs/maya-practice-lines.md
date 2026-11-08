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

These are the scoped additions and replacements on the chat repair branch. Review and API practice remain required. The safety-close, secret, and wrong-explanation policy changes from the saved work are excluded.

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

The honest close is said only for an other-topic question, after the easier example, when the child still only asks for help. It holds no number, so it gives nothing of the answer away. The call records the stuck step as a learning event (`result: blank`, `stuckStep`).

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

Review round 3 (#737 at d3aaff46) adds no wording. In a 25-word turn, the claim's result may now be acknowledged with the existing `check.right_step.plain` wordings, with "the result" as `{where}` ("Good, the result is done.", "That's right. The result is done."), when its equation does not fit beside the claim's question.
