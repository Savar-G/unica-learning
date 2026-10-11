// Level K (BC Kindergarten) for the grades 1-2 bank: the "down" form for a grade 1 child.
// Standards: curriculum map, section 1 (K1-K11). Province tags: see ./index.ts.
import { cap, draw, NAMES, orList, row, SHAPES, shapeQuestion, twoNames, wrong, type TaggedTemplate } from "../kit";

const ITEMS = ["shells", "apples", "stickers", "blocks", "crayons"] as const;

export const LEVEL_K: readonly TaggedTemplate[] = [
  // ---------- Number ----------
  {
    id: "k-count-shapes",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "number", whiteboard: false, standard: "K1",
    fill(rng) {
      const n = rng.int(4, 10), s = rng.int(0, SHAPES.length - 1);
      const shape = SHAPES[s];
      return {
        values: { n, shape: s },
        prompt: `How many ${shape.word}s? ${row(n, shape.glyph)}`,
        readAloud: `How many ${shape.word}s are there? Count them.`,
        answer: String(n),
        wrong: [wrong(n + 1, "one-to-one"), wrong(n - 1, "one-to-one")],
      };
    },
  },
  {
    id: "k-number-after",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "number", whiteboard: false, standard: "K1",
    fill(rng) {
      const n = rng.int(1, 9);
      return {
        values: { n },
        prompt: `What number comes just after ${n}?`,
        readAloud: `What number comes just after ${n}?`,
        answer: String(n + 1),
        wrong: [wrong(n - 1, "before-after")],
      };
    },
  },
  {
    id: "k-number-before",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "number", whiteboard: false, standard: "K1",
    fill(rng) {
      const n = rng.int(2, 10);
      return {
        values: { n },
        prompt: `What number comes just before ${n}?`,
        readAloud: `What number comes just before ${n}?`,
        answer: String(n - 1),
        wrong: [wrong(n + 1, "before-after")],
      };
    },
  },
  {
    id: "k-missing-number",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "number", whiteboard: false, standard: "K1",
    fill(rng) {
      const start = rng.int(1, 5), gap = rng.int(1, 3);
      const seq = [0, 1, 2, 3, 4].map((i) => start + i);
      const show = (blank: string) => seq.map((v, i) => (i === gap ? blank : String(v))).join(", ");
      return {
        values: { start, gap },
        prompt: `What number is missing? ${show("?")}`,
        readAloud: `What number is missing? ${show("what number")}.`,
        answer: String(start + gap),
        wrong: [wrong(start + 5, "next-not-asked")],
      };
    },
  },
  {
    id: "k-who-has-more",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: true, standard: "K2",
    fill(rng) {
      const [a, b] = rng.shuffle([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
      const [nameA, nameB] = twoNames(rng);
      const item = rng.pick(ITEMS);
      const more = a > b ? nameA : nameB, less = a > b ? nameB : nameA;
      const same = "They have the same number";
      return {
        values: { a, b },
        prompt: `${nameA} has ${a} ${item}: ${row(a)}. ${nameB} has ${b} ${item}: ${row(b)}. Who has more ${item}?`,
        readAloud: `${nameA} has ${a} ${item}. ${nameB} has ${b} ${item}. Who has more ${item}: ${orList(rng, [nameA, nameB, "they have the same number"])}?`,
        answer: more,
        wrong: [wrong(less, "more-less"), wrong(same, "same-size")],
      };
    },
  },
  {
    id: "k-make-five",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "number", whiteboard: true, standard: "K2",
    fill(rng) {
      const a = rng.int(1, 4);
      return {
        values: { a },
        prompt: `${a} and how many more make 5?`,
        readAloud: `${a} and how many more make 5?`,
        answer: String(5 - a),
        wrong: [wrong(5 + a, "operation"), wrong(6 - a, "count-start")],
      };
    },
  },
  {
    // Ways to split a number to 10 (K3), with the dots to count or draw.
    id: "k-split-number",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "number", whiteboard: true, standard: "K3",
    fill(rng) {
      const total = rng.int(6, 10), part = rng.int(1, total - 2);
      return {
        values: { total, part },
        // The dots show only the part the child has, so counting them never gives the whole.
        prompt: `${part} and how many more make ${total}? ${row(part)}`,
        readAloud: `${part} and how many more make ${total}?`,
        answer: String(total - part),
        wrong: [wrong(total + part, "operation"), wrong(total - part + 1, "count-start")],
      };
    },
  },
  {
    // Part-whole with one part missing. WNCP Kindergarten splits numbers into parts with objects; the story form is grade 1 there.
    id: "k-rest-are",
    strand: "N", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K3",
    fill(rng) {
      const total = rng.int(6, 10), part = rng.int(2, total - 2);
      const [thing, first, second] = rng.pick([
        ["apples", "red", "green"],
        ["balloons", "blue", "yellow"],
        ["fish", "orange", "grey"],
        ["cars", "red", "white"],
      ] as const);
      return {
        values: { total, part },
        prompt: `There are ${total} ${thing}. ${part} are ${first}. The rest are ${second}. How many ${thing} are ${second}?`,
        readAloud: `There are ${total} ${thing}. ${part} are ${first}. The rest are ${second}. How many ${thing} are ${second}?`,
        answer: String(total - part),
        wrong: [wrong(total + part, "operation"), wrong(total - part + 1, "count-start")],
      };
    },
  },
  {
    id: "k-in-all",
    strand: "N", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K3",
    fill(rng) {
      // Parts of 2 or more, so every noun stays plural.
      const [a, b] = rng.shuffle([2, 3, 4, 5]).slice(0, 2);
      const name = rng.pick(NAMES);
      const [first, second, thing] = rng.pick([
        ["red", "blue", "fish"],
        ["big", "small", "dogs"],
        ["green", "yellow", "frogs"],
      ] as const);
      return {
        values: { a, b },
        prompt: `${name} has ${a} ${first} ${thing} and ${b} ${second} ${thing}. How many ${thing} does ${name} have in all?`,
        readAloud: `${name} has ${a} ${first} ${thing} and ${b} ${second} ${thing}. How many ${thing} does ${name} have in all?`,
        answer: String(a + b),
        wrong: [wrong(Math.abs(a - b), "operation"), wrong(a + b - 1, "count-start")],
      };
    },
  },

  // ---------- Patterns and algebra ----------
  // Shape patterns allow the whiteboard: a child can draw the next shape.
  {
    id: "k-pattern-ab",
    strand: "A", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: true, standard: "K4",
    fill(rng) {
      const [x, y] = rng.shuffle([0, 1, 2, 3]);
      const length = rng.int(4, 6);
      const p = shapeQuestion(rng, [x, y], length);
      return { values: { x, y, length }, ...p };
    },
  },
  {
    id: "k-pattern-abc",
    strand: "A", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: true, standard: "K4",
    fill(rng) {
      const [x, y, z] = rng.shuffle([0, 1, 2, 3]);
      // The core shows at least twice before the gap, so the repeat is there to see.
      const length = rng.int(6, 8);
      const p = shapeQuestion(rng, [x, y, z], length);
      return { values: { x, y, z, length }, ...p };
    },
  },
  {
    id: "k-pattern-aab",
    strand: "A", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: true, standard: "K4",
    fill(rng) {
      const [x, y] = rng.shuffle([0, 1, 2, 3]);
      const core = rng.pick([[x, x, y], [x, y, y]]);
      // The core shows at least twice before the gap.
      const length = rng.int(6, 8);
      const p = shapeQuestion(rng, core, length);
      return { values: { x, y, length, doubled: core[1] === x ? 1 : 2 }, ...p };
    },
  },
  {
    id: "k-number-pattern",
    strand: "A", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K4",
    fill(rng) {
      // The two numbers are not neighbours, so "keeps growing" (the last number plus 1) is never the answer.
      const [x, y] = draw(rng, (r) => r.shuffle([1, 2, 3, 4, 5, 6]).slice(0, 2), ([x, y]) => Math.abs(x - y) > 1);
      const length = rng.int(5, 6);
      const seq = Array.from({ length }, (_, i) => (i % 2 === 0 ? x : y));
      const next = length % 2 === 0 ? x : y;
      const last = seq[length - 1];
      return {
        values: { x, y, length },
        prompt: `What comes next? ${seq.join(", ")}, ?`,
        readAloud: `What number comes next? ${seq.join(", ")}.`,
        answer: String(next),
        wrong: [wrong(last, "A2"), wrong(last + 1, "pattern-growing")],
      };
    },
  },
  {
    // Change in quantity (K5). WNCP Kindergarten has no adding or taking away; Ontario's grade 1 starts it.
    id: "k-how-many-more",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K5",
    fill(rng) {
      const have = rng.int(2, 7), want = rng.int(have + 2, 10);
      const name = rng.pick(NAMES);
      return {
        values: { have, want },
        prompt: `${name} has ${have} blocks and wants to have ${want} blocks in all. How many more blocks does ${name} need?`,
        readAloud: `${name} has ${have} blocks and wants to have ${want} blocks in all. How many more blocks does ${name} need?`,
        answer: String(want - have),
        wrong: [wrong(have + want, "operation"), wrong(want - have + 1, "count-start")],
      };
    },
  },
  {
    id: "k-take-away",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K5",
    fill(rng) {
      const total = rng.int(4, 10), gone = rng.int(2, total - 2);
      const [thing, verb] = rng.pick([
        ["birds", "fly away"],
        ["frogs", "hop away"],
        ["ducks", "swim away"],
      ] as const);
      return {
        values: { total, gone },
        prompt: `There are ${total} ${thing}. ${gone} ${thing} ${verb}. How many ${thing} are left?`,
        readAloud: `There are ${total} ${thing}. ${gone} ${thing} ${verb}. How many ${thing} are left?`,
        answer: String(total - gone),
        wrong: [wrong(total + gone, "operation"), wrong(total - gone + 1, "count-start")],
      };
    },
  },
  {
    // Equality as a balance (K6). WNCP and Ontario place the balance in grade 1.
    id: "k-balance-match",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K6",
    fill(rng) {
      const [red, blue] = rng.shuffle([2, 3, 4, 5]).slice(0, 2);
      return {
        values: { red, blue },
        prompt: `One side of a balance has ${red} red cubes and ${blue} blue cubes. The other side is empty. All the cubes weigh the same. How many cubes must go on the other side to make it balance?`,
        readAloud: `One side of a balance has ${red} red cubes and ${blue} blue cubes. The other side is empty. All the cubes weigh the same. How many cubes must go on the other side to make it balance?`,
        answer: String(red + blue),
        wrong: [wrong(red, "one-part"), wrong(blue, "one-part")],
      };
    },
  },
  {
    id: "k-balance-tips",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "K6",
    fill(rng) {
      const [left, right] = rng.shuffle([2, 3, 4, 5, 6, 7]).slice(0, 2);
      // Sides named by colour, not left and right, which many young children still mix up.
      const [a, b] = rng.shuffle(["red", "blue", "green", "yellow"]);
      const down = `The ${left > right ? a : b} side`, up = `The ${left > right ? b : a} side`;
      const even = "Neither side, it balances";
      return {
        values: { left, right },
        prompt: `A balance has ${left} cubes on the ${a} side and ${right} cubes on the ${b} side. All the cubes are the same. Which side goes down?`,
        readAloud: `A balance has ${left} cubes on the ${a} side and ${right} cubes on the ${b} side. All the cubes are the same. Which side goes down: ${orList(rng, [`the ${a} side`, `the ${b} side`])}, or neither side?`,
        answer: down,
        wrong: [wrong(up, "balance-up"), wrong(even, "same-size")],
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    id: "k-longer-line",
    strand: "MG", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K7",
    fill(rng) {
      const [a, b] = rng.shuffle([2, 4, 6, 8, 10]).slice(0, 2);
      const longer = rng.int(0, 1) === 1;
      const line = (n: number) => "▬".repeat(n);
      const [win, lose] = (a > b) === longer ? [a, b] : [b, a];
      const word = longer ? "longer" : "shorter";
      return {
        values: { a, b, longer: longer ? 1 : 0 },
        prompt: `Which line is ${word}?`,
        readAloud: `Which line is ${word}? Or are they the same length?`,
        answer: line(win),
        wrong: [wrong(line(lose), "more-less"), wrong("They are the same length", "same-size")],
      };
    },
  },
  {
    id: "k-heavier-object",
    strand: "MG", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K7",
    fill(rng) {
      const pairs = [
        ["a big balloon full of air", "a small apple"],
        ["a big feather", "a small rock"],
        ["a big leaf", "a small potato"],
        ["a big sheet of paper", "a small stone"],
      ] as const;
      const i = rng.int(0, pairs.length - 1);
      const [light, heavy] = pairs[i];
      const same = "They weigh the same";
      // Either object may come first, so the heavy one is not always named second.
      const [first, second] = rng.shuffle([light, heavy]);
      return {
        values: { pair: i, heavyFirst: first === heavy ? 1 : 0 },
        prompt: `Which is heavier: ${first} or ${second}?`,
        readAloud: `Which is heavier: ${first} or ${second}? Or do they weigh the same?`,
        answer: cap(heavy),
        wrong: [wrong(cap(light), "bigger-heavier"), wrong(same, "same-size")],
      };
    },
  },
  {
    id: "k-balance-heavier",
    strand: "MG", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K7",
    fill(rng) {
      const objects = ["apple", "orange", "book", "shoe", "toy car", "banana"] as const;
      const [down, up] = rng.shuffle(objects);
      // Either side may be described first, so the heavy object is not always named first.
      const sides = rng.shuffle([`the side with the ${down} goes down`, `the side with the ${up} goes up`]);
      const story = `On a balance, ${sides[0]} and ${sides[1]}.`;
      return {
        values: { down: objects.indexOf(down), up: objects.indexOf(up) },
        prompt: `${story} Which is heavier?`,
        readAloud: `${story} Which is heavier: ${orList(rng, [`the ${down}`, `the ${up}`])}, or do they weigh the same?`,
        answer: `The ${down}`,
        wrong: [wrong(`The ${up}`, "balance-up"), wrong("They weigh the same", "same-size")],
      };
    },
  },
  {
    // One attribute of a flat shape (K8: single attributes; math terminology is not expected, so no shape names).
    // WNCP starts 2D shapes in grade 1 (Kindergarten sorts 3D objects).
    id: "k-shape-attribute",
    strand: "MG", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 0 }, format: "choice", whiteboard: false, standard: "K8",
    fill(rng) {
      // Glyphs only, so the child looks at the shapes: circle, square, triangle.
      const [circle, square, triangle] = SHAPES.slice(0, 3);
      const shapes = [circle, square, triangle];
      const questions = [
        ["Which shape is round?", circle],
        ["Which shape has no corners?", circle],
        ["Which shape has 3 corners?", triangle],
        ["Which shape has 4 corners?", square],
      ] as const;
      const k = rng.int(0, questions.length - 1);
      const [ask, target] = questions[k];
      return {
        values: { k },
        prompt: ask,
        readAloud: ask,
        answer: target.glyph,
        wrong: shapes.filter((s) => s !== target).map((s) => wrong(s.glyph, "shape-name")),
      };
    },
  },
  {
    id: "k-can-roll",
    strand: "MG", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K8",
    fill(rng) {
      // Always "can roll": young listeners often miss a "not".
      const rollers = ["A ball", "An orange", "A marble"], flats = ["A box", "A book", "A block"];
      const answer = rng.pick(rollers);
      const others = rng.shuffle(flats).slice(0, 2);
      const ask = "Which one can roll?";
      return {
        values: { roller: rollers.indexOf(answer) },
        prompt: ask,
        readAloud: `${ask} ${orList(rng, [answer, ...others].map((s) => s.toLowerCase()))}?`,
        answer,
        wrong: others.map((o) => wrong(o, "roll-slide")),
      };
    },
  },
  {
    // Picture graphs (K9). WNCP starts graphs in grade 2; Ontario in grade 1.
    id: "k-graph-which-more",
    strand: "DP", grades: { BC: 0, AB: 2, SK: 2, MB: 2, ON: 1 }, format: "choice", whiteboard: false, standard: "K9",
    fill(rng) {
      const [a, b] = rng.shuffle([2, 3, 4, 5, 6, 7, 8]).slice(0, 2);
      const [kind, x, y] = rng.pick([["fruit", "apples", "bananas"], ["pet", "cats", "dogs"], ["colour", "red", "blue"]] as const);
      return {
        values: { a, b },
        prompt: `Children chose a favourite ${kind}. ${cap(x)}: ${row(a)}. ${cap(y)}: ${row(b)}. Which did more children choose?`,
        readAloud: `Children chose a favourite ${kind}. Look at the dots for ${x} and the dots for ${y}. Which did more children choose: ${x}, ${y}, or the same number?`,
        answer: cap(a > b ? x : y),
        wrong: [wrong(cap(a > b ? y : x), "more-less"), wrong("The same number", "same-size")],
      };
    },
  },
  {
    id: "k-graph-count",
    strand: "DP", grades: { BC: 0, AB: 2, SK: 2, MB: 2, ON: 1 }, format: "number", whiteboard: false, standard: "K9",
    fill(rng) {
      const [a, b] = rng.shuffle([2, 3, 4, 5, 6, 7, 8]).slice(0, 2);
      const [kind, x, y] = rng.pick([["fruit", "apples", "bananas"], ["pet", "cats", "dogs"], ["colour", "red", "blue"]] as const);
      return {
        values: { a, b },
        prompt: `Children chose a favourite ${kind}. ${cap(x)}: ${row(a)}. ${cap(y)}: ${row(b)}. Each ● is 1 child. How many children chose ${x}?`,
        readAloud: `Children chose a favourite ${kind}. Each dot is one child. How many children chose ${x}? Count the dots beside ${x}.`,
        answer: String(a),
        wrong: [wrong(b, "wrong-row")],
      };
    },
  },
  {
    // Likelihood words (K10). WNCP starts likelihood in grade 5; Ontario in grade 1.
    id: "k-likely-event",
    strand: "DP", grades: { BC: 0, AB: 5, SK: 5, MB: 5, ON: 1 }, format: "choice", whiteboard: false, standard: "K10",
    fill(rng) {
      const likely = ["You will eat lunch today", "You will see the sky today", "You will hear a car today"];
      const unlikely = ["A cow will fly over your house today", "A dinosaur will visit your school today", "A fish will talk to you today"];
      const answer = rng.pick(likely);
      const others = rng.shuffle(unlikely).slice(0, 2);
      return {
        values: { likely: likely.indexOf(answer) },
        prompt: "Which of these is most likely to happen?",
        // Each choice is its own sentence, so the three do not run together when spoken.
        readAloud: `Which of these is most likely to happen? Choose one. ${rng.shuffle([answer, ...others]).join(". ")}.`,
        answer,
        wrong: others.map((o) => wrong(o, "chance-reversed")),
      };
    },
  },
];
