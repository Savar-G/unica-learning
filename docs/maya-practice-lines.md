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


## Count-up teaching (#526)

Status: pending Savar's reading and model-driven practice. NO MERGE.

These 30 new wordings teach the checked `count-up` step of a `missing-addend` operation. Code fills every slot. `{from}` is the known part. `{to}` is the number to reach. `{more}` is the checked hop count. `{sequence}` is the checked list of numbers after the start. `{expr}` is the checked easier question. Existing template ids and wordings stay in place. The line-set version is 9.

Target hints do not supply `{more}`. The example and H4 answer can supply it. The example uses a compact count when a spoken list exceeds the limit or contains the unreleased target answer. The example introduction says "question" so the generic word "one" cannot conflict with a missing amount of 1.

| Wording id | New sentence, pending reading |
|---|---|
| `point.count#0` | We have {from}. We need {to}. |
| `point.count#1` | Start with {from}. We want to reach {to}. |
| `point.count#2` | The number we have is {from}. We need {to}. |
| `point.count#3` | We start at {from}. We want to get to {to}. |
| `point.count#4` | We know {from}. We want to make {to}. |
| `intro.count#0` | Let's try an easier question first: {expr}. |
| `intro.count#1` | Here's an easier question: {expr}. |
| `intro.count#2` | First, an easier question: {expr}. |
| `intro.count#3` | Let's start with an easier question: {expr}. |
| `intro.count#4` | I'll help with an easier question first: {expr}. |
| `operation.count#0` | Start at {from}. Count on to {to}. How many more? |
| `operation.count#1` | Count on from {from} to {to}. How many more do you need? |
| `operation.count#2` | Begin at {from}. Count on until you reach {to}. How many more? |
| `operation.count#3` | Start with {from}. Count up to {to}. How many more? |
| `operation.count#4` | How many more do you need to count from {from} to {to}? |
| `show.count#0` | Start at {from}. Count each number after {from}. Stop at {to}. How many numbers did you say? |
| `show.count#1` | Start at {from}. Count on until {to}. Count the numbers you say after {from}. How many did you say? |
| `show.count#2` | Begin at {from}. Count on to {to}. Count each number after {from}. How many numbers did you say? |
| `show.count#3` | Count on from {from}. Stop at {to}. Count each number you say after {from}. How many did you say? |
| `show.count#4` | Begin at {from}. Stop when you reach {to}. Count the numbers you say after {from}. How many did you say? |
| `example.count#0` | Start at {from}. Count {more} more to reach {to}. |
| `example.count#1` | Count {more} more from {from}. You reach {to}. |
| `example.count#2` | Begin at {from}. Count on {more}. You reach {to}. |
| `example.count#3` | From {from}, count {more} more. You reach {to}. |
| `example.count#4` | Start with {from}. Count on {more} to reach {to}. |
| `example.count.sequence#0` | Start at {from}. Count on to {to}: {sequence}. That is {more} more. |
| `example.count.sequence#1` | From {from}, count on: {sequence}. You count {more} numbers to reach {to}. |
| `example.count.sequence#2` | Begin at {from}. Count on: {sequence}. That is {more} more to reach {to}. |
| `example.count.sequence#3` | Count on from {from} to {to}: {sequence}. You count {more} numbers. |
| `example.count.sequence#4` | Start with {from}. Count on: {sequence}. You reach {to} with {more} more. |

The existing invitation, step acknowledgement, wrong-step reply and explanation request now use "the missing part" in their checked location slot. The existing answer acknowledgement fills the blank: `7 + 3 = 10`. It does not append the answer to the open equation. The existing example-result line uses the same completed equation. The original wording templates still supply these frames.

The dedicated test writes all expanded lines for the generated synthetic missing-part packages to `/tmp/unica-526-expanded-lines.txt`. It writes the new templates to `/tmp/unica-526-new-wording.json`. These are local reading records. They do not establish wording approval or a model-driven practice pass.
