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

## Pending Savar, #698 fix round 2026-11-08

Status: pending Savar. None of these wordings is approved yet. Values in braces come from the checked question package.

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

## Pending Savar, #698 fix round 2026-11-08 (no feeling claims)

Status: pending Savar. D-253 item 18 (#605): Maya claims no feelings of her own. She is an AI. Practice run C24-r2 showed "I had fun working with you." passing the code guards and the review. The free-talk guard (`feelingClaim` in `src/lib/maya/phrases.ts`) now refuses own words that claim a feeling, and the review has the rule `feelings`. These bank phrases claimed a feeling, so each one has a new wording. Ids are the group and the phrase position in `PHRASES`, from 1. A plain acknowledgement ("I'm glad you told me") stays. Carried from PR #624.

| Id or location | Old wording | New wording (pending Savar) |
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

The table above in this file still shows the old `praise.3`, `praise.6` and `praise.11` wordings; this section replaces them, pending Savar.

### New held line (D-304)

Approved in substance by Savar 2026-11-08; exact wording pending his final read. On a held question Maya says `held.hello`, `held.cannot`, `held.next` in that order (after a hello, the last two only).

| Id | Old wording | New wording (approved in substance; wording pending Savar) | Savar's original phrasing |
|---|---|---|---|
| `held.cannot.0` | No line at this id (line set 11 removed the earlier `held.cannot`). | Sorry, I can't teach this question yet. | "Sorry, I don't have the capabilities to teach this question yet." Something like that. |
