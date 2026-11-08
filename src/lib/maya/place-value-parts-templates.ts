// Maya's wordings for B1b's place-value asks (design: .design/research/maya-place-value-design.md, section 4.3), pending
// Savar's approval (D-202). Every slot is filled by code from the checked package (place-value-parts-lines.ts). The rules
// the wording keeps:
// - A compare never points at a column and asks for its digit: the two digits decide the word. Its chart has no digits
//   until the child's word stands; then both columns are striped and code writes "8 > 2" (screen c, approved).
// - No line before the answer says the answer: the word, the sum, or the decimal.
// - Every first line on a step carries its framing, and every line fits 25 spoken words with the book's longest places.
// - Each key has wordings with no seeing word (look, chart, color, circle, write ...) for a call with no board.
// No imports: place-value-lines.ts takes these into its template set. Pure TypeScript.

export const PLACE_PARTS_TEMPLATES = {
  // What the child tried, with no number: the opening (hello and this) fits a 25-word turn with any six-digit number.
  "assess.parts": ["What did you try so far?", "How did you start?", "Tell me what you did so far.", "What have you done so far?", "How far did you get?"],
  // ---------- Compare: "the digit in the P1 place is bigger than the digit in the P2 place" ----------
  "question.compare": [
    "Our question is about the {pa} digit and the {pb} digit of {number}.", "We're comparing two digits of {number}: the {pa} and the {pb}.",
    "This question compares the {pa} digit and the {pb} digit of {number}.", "Let's compare the {pa} digit with the {pb} digit of {number}.",
    "Today we compare two digits of {number}, the {pa} and the {pb}.",
  ],
  "example.intro.compare": [
    "Let's try an easier one first. {ask}", "Here's a smaller one to warm up. {ask}", "Let me show you an easier one. {ask}",
    "First, a smaller one. {ask}", "I'll show you an easier one first. {ask}",
  ],
  // H2 of a compare's digit step: no stripe and no circle; the child counts on their own page.
  "operation.place.count": [
    "Find the {ordinal} place from the right in {number}. Which digit is there?",
    "Start at the right of {number} and count to the {ordinal} digit. What is it?",
    "Count the digits of {number} from the right, up to the {ordinal} digit. Which digit is it?",
    "Start at the last digit of {number}. Move left to the {ordinal} digit. Which digit is it?",
    "In {number}, the {place} digit is the {ordinal} digit from the right. Which digit is it?",
  ],
  // H3 of a compare's digit step: the digit said, with no circle on the board.
  "show.place": ["{show}", "Here it is. {show}", "Let me show you. {show}", "Like this. {show}", "I'll do this part. {show}"],
  // Which digit is bigger (only when they differ). H0 says why: the statement is about the bigger digit.
  "invite.bigger": [
    "So we have {a} and {b}. Which digit is bigger?", "The statement is about the bigger digit. Which is bigger, {a} or {b}?",
    "Now compare the two digits. Which is bigger, {a} or {b}?", "We have {a} and {b}. Which one is bigger?", "{a} or {b}: which digit is bigger?",
  ],
  "point.bigger": [
    "Count up from 0: 0, 1, 2 and so on. Which do we reach later, {a} or {b}?", "Think of counting up. Which one comes later, {a} or {b}?",
    "The digit that comes later when we count up is the bigger one. Which is it, {a} or {b}?", "Bigger means more. Which is more, {a} or {b}?",
    "Picture the digits 0 to 9 in a row. Which is farther along, {a} or {b}?",
  ],
  "operation.bigger": [
    "If you had {a} apples or {b} apples, which is more?", "Which is more stickers, {a} stickers or {b} stickers?",
    "Picture {a} dots and {b} dots. Which group has more?", "On a number line, {a} and {b}: which is farther from 0?",
    "Hold up {a} fingers, then {b} fingers. Which is more?",
  ],
  "show.bigger": ["{show}", "Here it is. {show}", "Let me show you. {show}", "Like this. {show}", "I'll do this part. {show}"],
  "right.bigger": [
    "Yes! {hi} is bigger than {lo}.", "That's right: {hi} is bigger than {lo}.", "You got it, {hi} is bigger.", "Yes, {hi} is the bigger digit.",
    "Exactly! {hi} is more than {lo}.",
  ],
  "notyet.bigger": [
    "Not quite. Let's compare {a} and {b} again.", "Not yet. Let's think about {a} and {b} together.", "Hmm, not yet. Which is more, {a} or {b}?",
    "That's not it yet. Let's look at {a} and {b} once more.", "Not yet. Let's go back to {a} and {b}.",
  ],
  // "Why is 8 bigger?" (J06): an answer that does not say which digit.
  "why.bigger": [
    "Good question. Bigger means more. When we count up, the bigger digit comes later.", "A digit that comes later when we count up is bigger.",
    "We count 0, 1, 2, 3 and on. Each digit is one more than the one before.", "Bigger means more. A later counting number is always more.",
    "Each step when we count up adds one more, so later digits are bigger.",
  ],
  // The circled word. H0 is the statement's own question, ending with its two words.
  "invite.compare": [
    "The statement says the {pa} digit is bigger than the {pb} digit. Is that true or false?",
    "Is it true or false? The {pa} digit is bigger than the {pb} digit.", "Let's check the statement: the {pa} digit is bigger than the {pb} digit. True or false?",
    "So, is the {pa} digit bigger than the {pb} digit? True or false?", "Think about the statement. Is the {pa} digit bigger than the {pb} digit, true or false?",
  ],
  "point.compare": [
    "The {pa} digit is {a}. The {pb} digit is {b}. Is {a} bigger than {b}? True or false?",
    "We found {a} in the {pa} place and {b} in the {pb} place. Is {a} bigger than {b}? True or false?",
    "The statement says {a} is bigger than {b}. Is that true or false?", "Compare {a} and {b}. Is {a} the bigger one? True or false?",
    "Check the digits: {a} and {b}. Does the statement say it right? True or false?",
  ],
  "operation.compare": [
    "{cmp} So is the statement true or false?", "Here's the check: {cmp} Is the statement true or false?", "{cmp} Which word do you circle, true or false?",
    "Remember, {cmp} So, true or false?", "{cmp} Now, is the statement true or false?",
  ],
  "why.compare": [
    "We check if the {pa} digit is bigger than the {pb} digit. That decides the word.", "We compare the two digits. The statement says the first one is bigger.",
    "The statement says one digit is bigger. We check if that is so.", "True means the statement is right. False means it is not right.",
    "We find both digits, then check if the {pa} digit is bigger.",
  ],
  "answer.compare": [
    "Yes, it's {word}. {cmp}", "That's right. It's {word}, because {cmpLower}", "You got it! It's {word}. {cmp}", "Yes, {word}. {cmp}",
    "Exactly! The statement is {word}. {cmp}",
  ],
  "example.bigger": ["So {show}", "And {show}", "Then compare: {show}", "Now compare them: {show}", "Next, {show}"],
  "example.compare": [
    "So the statement is {word}. We circle {word}.", "That makes the statement {word}, so we circle {word}.", "So we circle {word}.",
    "The statement is {word}. We circle {word}.", "So the answer is {word}.",
  ],

  // ---------- Sum: "the value of the P1 digit plus the value of the P2 digit" ----------
  "question.sum": [
    "Our question adds two values from {number}: the {pa} digit's and the {pb} digit's.",
    "We're adding two values from {number}: the {pa} digit's and the {pb} digit's.",
    "This question adds the values of two digits of {number}, the {pa} and the {pb}.",
    "Let's add two values from {number}: the {pa} digit's and the {pb} digit's.",
    "Today we add two values from {number}, the {pa} digit's and the {pb} digit's.",
  ],
  "example.intro.sum": [
    "Let's try an easier one first: {ask}.", "Here's a smaller one to warm up: {ask}.", "Let me show you an easier one: {ask}.",
    "First, a smaller one: {ask}.", "I'll show you an easier one first: {ask}.",
  ],
  // H0 of a digit's value, with the framing: what each of the place is worth (for a 1, what the place is worth).
  "invite.worth": [
    "What is the {digit} in the {place} place worth? Each {unit} is {perOne}.", "Each {unit} is worth {perOne}. What is the value of the {digit} in the {place} place?",
    "The {digit} is in the {place} place, and each {unit} is {perOne}. What is it worth?", "Let's find the value of the {digit} in the {place} place. Each {unit} is {perOne}.",
    "Each {unit} is {perOne}. How much is the {digit} in the {place} place worth?",
  ],
  "invite.worth.one": [
    "What is the 1 in the {place} place worth? Its value comes from its place.", "A 1 in the {place} place is worth what that place is worth. What is it?",
    "The value of a digit depends on its place. What is the 1 in the {place} place worth?", "Let's find the value of the 1 in the {place} place.",
    "How much is the 1 in the {place} place worth?",
  ],
  "point.worth": [
    "I colored the {place} place. Each {unit} is worth {perOne}, and there are {digit}.", "The colored column is the {place} place. We have {digit} {place}. Each is {perOne}.",
    "Think of {digit} {place}. Each one is worth {perOne}.", "We have {digit} {place}, and each is worth {perOne}.",
    "The {place} place counts in {perOne}s. There are {digit} of them.",
  ],
  "point.worth.one": [
    "I colored the {place} place. The 1 there is worth what that place is worth.", "There is one digit 1 in the {place} place. What is that place worth?",
    "With a 1 there, the value is the {place} place's own value.", "Think about what the {place} place is worth. The 1 is worth that much.",
    "A 1 in a place is worth just that place.",
  ],
  "operation.worth": [
    "I circled the {digit}. What is {digit} × {perOne}?", "Look at the circled {digit}. Multiply {digit} × {perOne}. What do you get?",
    "What do you get for {digit} × {perOne}?", "Can you work out {digit} × {perOne}?", "What is {digit} times {perOne}?",
  ],
  "operation.worth.one": [
    "I circled the 1. How do you write the {place} place as a number?", "Look at the circled 1. What number is the {place} place worth?",
    "Say the {place} place as a number.", "What number does the {place} place stand for?", "How do you write one {unit} as a number?",
  ],
  "show.worth": ["{show}", "Here it is. {show}", "Let me show you. {show}", "Like this. {show}", "I'll do this part. {show}"],
  "right.worth": [
    "Yes! The {digit} in the {place} place is worth {value}.", "That's right: {digit} {place} is {value}.", "You got it, that {digit} is worth {value}.",
    "Yes, {value}. That's the value of the {digit}.", "Exactly! The {digit} has a value of {value}.",
  ],
  "notyet.worth": [
    "Not quite. Let's look at the {place} place again.", "Not yet. Let's check the {digit} in the {place} place together.",
    "Hmm, not yet. Let's try the {place} place again.", "That's not it yet. Let's think about the {digit} in the {place} place once more.",
    "Not yet. Let's go back to the {place} place.",
  ],
  "why.worth": [
    "A digit's value is the digit times its place. Each {unit} is {perOne}.", "The {place} place counts in {perOne}s. The digit tells how many of them.",
    "Each place has its own value. The digit says how many of that value we have.", "We multiply because each {unit} is worth {perOne}.",
    "The digit tells how many. The place tells what each one is worth.",
  ],
  "why.worth.one": [
    "A 1 in a place is worth just that place.", "The digit says how many of the place there are. Here there is just 1.",
    "Each place has its own value. The 1 takes the value of its place.", "The value of a digit depends on its place.",
    "The digit tells how many. With a 1, you count that place just once.",
  ],
  // The last step: the two values added. They sit in different places, so nothing carries.
  "invite.sum": [
    "Now add the two values, {va} and {vb}. What do you get?", "We have {va} and {vb}. What is {va} plus {vb}?",
    "The question asks for one value plus the other. What is {va} plus {vb}?", "Let's put {va} and {vb} together. What number is that?",
    "Add the values: {va} and {vb}. What is the number?",
  ],
  "point.sum": [
    "{va} has its digit in the {pa} place. {vb} has its digit in the {pb} place.",
    "The two values use different places, so nothing carries. Each digit stays in its place.",
    "Start with {va}. Then put the digit of {vb} in the {pb} place.", "Each value fills its own place. The other places get a 0.",
    "No carrying here: {va} and {vb} use different places.",
  ],
  "operation.sum": [
    "What is {va} + {vb}?", "Add them: {va} + {vb}. What do you get?", "Let's add {va} + {vb}.", "What do you get for {va} + {vb}?",
    "Can you work out {va} + {vb}?",
  ],
  "why.sum": [
    "The question asks for one value plus the other, so we add them.", "Plus means add. We add the value of the {pa} digit and the value of the {pb} digit.",
    "We found each digit's value. The question says plus, so we add.", "Each digit has a value. The question wants the two values added.",
    "Plus tells us to add. We add the two values we found.",
  ],
  "fix.sum.digits": [
    "That adds the digits. We need to add their values: {va} and {vb}.", "Careful, that is the two digits added. Add their values instead: {va} and {vb}.",
    "Those are the digits. The question adds their values, {va} and {vb}.", "We add the values, not the digits. What is {va} plus {vb}?",
    "Not the digits, their values. Add {va} and {vb}.",
  ],
  "answer.sum": [
    "Yes! {va} + {vb} = {answer}.", "That's right. {va} plus {vb} is {answer}.", "You got it! The two values make {answer}.",
    "Yes, {answer}. That's {va} plus {vb}.", "Exactly! {va} + {vb} = {answer}.",
  ],
  "example.worth": [
    "The {digit} in the {place} place is worth {value}: {digit} × {perOne} = {value}.", "Each {unit} is {perOne}, so the {digit} is worth {value}.",
    "{digit} {place} is {value}.", "The value of the {digit} in the {place} place is {value}.", "So the {digit} in the {place} place is worth {value}.",
  ],
  "example.sum": [
    "So {va} + {vb} = {answer}.", "Add them: {va} + {vb} = {answer}.", "Together, {va} and {vb} make {answer}.", "Then {va} plus {vb} is {answer}.",
    "So the answer is {va} + {vb} = {answer}.",
  ],

  // ---------- Build: "W wholes and T tenths is ? as a decimal" ----------
  "chart.open.parts": [
    "I drew a chart with a ones place and a tenths place.", "Here is a place-value chart for wholes and tenths.", "Let's put the wholes and the tenths in a chart.",
    "Let's think about the wholes and the tenths.", "Wholes and tenths each have their own place.",
  ],
  // H0, with the framing: the wholes before the point, the tenths after it.
  "invite.build": [
    "Wholes go before the decimal point, tenths after it. What is {wp} and {tp} as a decimal?",
    "The decimal point sits between the wholes and the tenths. What decimal is {wp} and {tp}?",
    "Let's write {wp} and {tp} as a decimal. The wholes come first, then the point.",
    "{wp} and {tp}: the wholes go before the point. What decimal is that?", "How would you say {wp} and {tp} as a decimal? The point comes after the wholes.",
  ],
  "point.build": [
    "I colored the ones place and the tenths place. The wholes go in the ones place.", "The colored columns are the ones and the tenths. The point sits between them.",
    "Wholes go in the ones place, and tenths go in the tenths place. The decimal point sits between them.",
    "Put the wholes first, then the decimal point, then the tenths.", "Start with the wholes, then the point, then the tenths.",
  ],
  // H2 narrows the order without saying the decimal's digits in a row (lesson 9: no hint reads the answer out).
  "operation.build": [
    "How many wholes? That number goes before the point. How many tenths? That number goes after it.",
    "Say the number of wholes, then the word point, then the number of tenths.",
    "The number of wholes comes first. Then the point. Then the number of tenths. What decimal is it?",
    "Before the point: the wholes. After the point: the tenths. What decimal is that?",
    "Put the wholes before the decimal point and the tenths after it. What do you get?",
  ],
  "why.build": [
    "The point shows where the wholes end. The digit after it counts tenths.", "The decimal point keeps the wholes and the tenths apart.",
    "Wholes are bigger than tenths, so they come first, before the point.", "The place right after the point is the tenths place.",
    "Ten tenths make one whole. The point separates the wholes from the tenths.",
  ],
  "fix.build.point": [
    "Careful, we need the decimal point. The wholes go before the point, and the tenths after it.", "That leaves out the point. The wholes go before it and the tenths after it.",
    "The point is missing. Where does the decimal point go?", "We need a point between the wholes and the tenths. Can you say it with the point?",
    "Remember the decimal point. It goes after the wholes.",
  ],
  "notyet.build": [
    "Not quite. Let's look at the wholes and the tenths again.", "Not yet. Let's check where the wholes and the tenths go.",
    "Hmm, not yet. Wholes first, then the point, then the tenths.", "That's not it yet. Let's think about the wholes and the tenths once more.",
    "Not yet. Let's go back to the wholes and the tenths.",
  ],
  "answer.build": [
    "Yes! {wp} and {tp} is {answer}.", "That's right. {wp} and {tp} make {answer}.", "You got it! As a decimal, that is {answer}.",
    "Yes, {answer}. The point sits between the wholes and the tenths.", "Exactly! {answer} is {wp} and {tp}.",
  ],
  "example.build": [
    "{wp} and {tp}: {w} goes before the point and {t} after it. That makes {answer}.", "The {w} wholes go first, then the point, then the {t} tenths: {answer}.",
    "So {wp} and {tp} is {answer}.", "Wholes, point, tenths: {answer}.", "{w}, then the point, then {t}. That is {answer}.",
  ],

  // ---------- The honest close (brief lesson 10, controller decision (a), 2026-11-08; pending Savar's approval, D-202) ----------
  // After the easier example, a child who still only asks for help: this one is hard, it is fine to stop, and one next step.
  // No number and no word of the answer.
  "close.hard": [
    "This one is hard, and it's fine to stop here. You can try the easier one on paper.",
    "This is a tricky one. It's okay to stop now. You can ask a grown-up to try it with you.",
    "This question is hard, and that's okay. Let's stop here. Try the easier one on your paper.",
    "That was a hard one. It's fine to stop. You could try it with a grown-up later.",
    "This one is tough, and stopping is fine. Try the easier one on paper first.",
  ],
} as const satisfies Record<string, readonly string[]>;
export type PlacePartsTemplateKey = keyof typeof PLACE_PARTS_TEMPLATES;

/** The keys whose line says Maya colored a column (placeAutoDraw draws the stripe), circled a digit, or drew the chart. */
export const PARTS_BAND_KEYS: readonly string[] = ["point.worth", "point.worth.one", "point.build"];
export const PARTS_CIRCLE_KEYS: readonly string[] = ["operation.worth", "operation.worth.one"];
export const PARTS_CHART_KEYS: readonly string[] = ["chart.open.parts"];
/** The answers to a child's question about the step (J06), said before going on. */
export const PARTS_WHY_KEYS: readonly string[] = ["why.bigger", "why.compare", "why.worth", "why.worth.one", "why.sum", "why.build"];
