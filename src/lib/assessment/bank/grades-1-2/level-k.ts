// Level K (BC Kindergarten) for the grades 1-2 bank: a Kindergarten test (D-156) and the "down" form for a grade 1 child.
// D-158 added templates so a 24-question Kindergarten test repeats none and siblings share fewer.
// Standards: curriculum map, section 1 (K1-K11). Province tags: see ./index.ts.
import { cap, count, draw, GAP, NAMES, orList, row, SHAPES, shapeQuestion, twoNames, wrong, type Shape, type TaggedTemplate } from "../kit";

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
        readAloud: `${nameA} has ${a} ${item}. ${nameB} has ${b} ${item}. Who has more ${item}?`,
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

  // More level K number templates (D-158): a Kindergarten test of 24 questions repeats none, and siblings share fewer.
  {
    // Count one kind among others (K1): a child who counts every shape gives the whole row.
    id: "k-count-one-kind",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "number", whiteboard: false, standard: "K1",
    fill(rng) {
      const [s, t] = rng.shuffle([0, 1, 2, 3]);
      const shape = SHAPES[s], other = SHAPES[t];
      const n = rng.int(5, 8), m = rng.int(2, 4);
      const items = rng.shuffle([...Array.from({ length: n }, () => shape.glyph), ...Array.from({ length: m }, () => other.glyph)]);
      return {
        values: { n, m, shape: s, other: t },
        prompt: `How many ${shape.word}s? ${items.join(GAP)}`,
        readAloud: `Count only the ${shape.word}s. How many ${shape.word}s are there?`,
        answer: String(n),
        wrong: [wrong(n + m, "count-objects"), wrong(m, "wrong-row")],
      };
    },
  },
  {
    // Match a set to its numeral (K1): the dots are the question, the numbers are the choices.
    id: "k-numeral-match",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K1",
    fill(rng) {
      const n = rng.int(3, 9), shape = rng.int(0, SHAPES.length - 1);
      return {
        values: { n, shape },
        prompt: `Which number tells how many? ${row(n, SHAPES[shape].glyph)}`,
        readAloud: `Count the ${SHAPES[shape].word}s. Which number tells how many there are?`,
        answer: String(n),
        wrong: [wrong(n + 1, "one-to-one"), wrong(n - 1, "one-to-one")],
      };
    },
  },
  {
    // Compare numbers to 10 (K2), asked for the biggest or the smallest. WNCP and Ontario compare numerals in grade 1.
    id: "k-biggest-number",
    strand: "N", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "K2",
    fill(rng) {
      const [a, b, c] = draw(rng, (r) => r.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, 3), (v) => Math.max(...v) - Math.min(...v) > 2);
      const biggest = rng.int(0, 1) === 1;
      const sorted = [a, b, c].sort((x, y) => x - y);
      const answer = biggest ? sorted[2] : sorted[0];
      const ask = `Which is the ${biggest ? "biggest" : "smallest"} number: ${orList(rng, [String(a), String(b), String(c)])}?`;
      return {
        values: { a, b, c, biggest: biggest ? 1 : 0 },
        prompt: ask,
        readAloud: ask,
        answer: String(answer),
        wrong: [wrong(biggest ? sorted[0] : sorted[2], "more-less"), wrong(sorted[1], "number-order")],
      };
    },
  },
  {
    // A five-frame (K2): how many boxes are empty. WNCP Kindergarten shows numbers to 5 in frames; Ontario in grade 1.
    id: "k-five-frame",
    strand: "N", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 1 }, format: "number", whiteboard: true, standard: "K2",
    fill(rng) {
      const dots = rng.int(1, 4);
      const frame = [...Array.from({ length: dots }, () => "●"), ...Array.from({ length: 5 - dots }, () => "○")].join(GAP);
      return {
        values: { dots },
        prompt: `A five-frame has 5 boxes. The dots fill ${count(dots, "box", "boxes")}: ${frame}. How many boxes are empty?`,
        readAloud: `A five-frame has 5 boxes. ${dots === 1 ? "One box has a dot" : `${dots} boxes have a dot`}. How many boxes are empty?`,
        answer: String(5 - dots),
        wrong: [wrong(dots, "count-other"), wrong(5, "difference-whole")].filter((w) => Number(w.value) !== 5 - dots),
      };
    },
  },
  {
    // A ten-frame read as 5 and some more (K3). WNCP and Ontario use ten-frames from grade 1.
    id: "k-ten-frame-count",
    strand: "N", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: false, standard: "K3",
    fill(rng) {
      const extra = rng.int(1, 4);
      const second = [...Array.from({ length: extra }, () => "●"), ...Array.from({ length: 5 - extra }, () => "○")].join(GAP);
      return {
        values: { extra },
        prompt: `How many dots are in the ten-frame? ${row(5)} | ${second}`,
        readAloud: `The top row of the ten-frame is full. The bottom row has ${extra === 1 ? "one dot" : `${extra} dots`}. How many dots are in the ten-frame?`,
        answer: String(5 + extra),
        wrong: [wrong(5 - extra, "count-other"), wrong(extra, "one-part")],
      };
    },
  },
  {
    // The part that makes 10 (K3), on a ten-frame. WNCP and Ontario use ten-frames from grade 1.
    id: "k-ten-frame-fill",
    strand: "N", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K3",
    fill(rng) {
      // Not 5: 5 more would make the dots shown and the answer the same number.
      const dots = rng.pick([4, 6, 7, 8]);
      const cells = Array.from({ length: 10 }, (_, i) => (i < dots ? "●" : "○"));
      const frame = `${cells.slice(0, 5).join(GAP)} | ${cells.slice(5).join(GAP)}`;
      return {
        values: { dots },
        prompt: `A ten-frame has ${dots} dots: ${frame}. How many more dots fill the ten-frame?`,
        readAloud: `A ten-frame has room for 10 dots. It has ${dots} dots. How many more dots fill the ten-frame?`,
        answer: String(10 - dots),
        wrong: [wrong(dots, "count-other"), wrong(10 - dots + 1, "count-start")],
      };
    },
  },
  {
    // Coins by their pictures (K11). WNCP names coins in grade 2; Ontario identifies coins in grade 1.
    id: "k-coin-picture",
    strand: "N", grades: { BC: 0, AB: 2, SK: 2, MB: 2, ON: 1 }, format: "choice", whiteboard: false, standard: "K11",
    fill(rng) {
      const coins = [["a loon", "The loonie"], ["a polar bear", "The toonie"], ["a beaver", "The nickel"], ["a caribou", "The quarter"], ["a sailing ship", "The dime"]] as const;
      const k = rng.int(0, coins.length - 1);
      const [picture, coin] = coins[k];
      const others = rng.shuffle(coins.filter((_, i) => i !== k)).slice(0, 2).map(([, name]) => name);
      const ask = `Which Canadian coin has ${picture} on it?`;
      return {
        values: { k },
        prompt: ask,
        readAloud: ask,
        answer: coin,
        wrong: others.map((o) => wrong(o, "coin-name")),
      };
    },
  },
  {
    // A pretend purchase in whole dollars to 10 (K11). WNCP adds money amounts in grade 2; Ontario in grade 2.
    id: "k-shop-total",
    strand: "N", grades: { BC: 0, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "K11",
    fill(rng) {
      const [a, b] = rng.shuffle([1, 2, 3, 4, 5]).slice(0, 2);
      const [x, y] = rng.shuffle(["a muffin", "a juice", "an apple", "a pencil", "a toy car", "a sticker book"]);
      const dollars = (n: number) => count(n, "dollar");
      return {
        values: { a, b },
        prompt: `At a pretend shop, ${x} costs $${a} and ${y} costs $${b}. How many dollars do both cost together?`,
        readAloud: `At a pretend shop, ${x} costs ${dollars(a)} and ${y} costs ${dollars(b)}. How many dollars do both cost together?`,
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
        readAloud: `A balance has ${left} cubes on the ${a} side and ${right} cubes on the ${b} side. All the cubes are the same. Which side goes down?`,
        answer: down,
        wrong: [wrong(up, "balance-up"), wrong(even, "same-size")],
      };
    },
  },

  // More level K pattern and change templates (D-158).
  {
    // A missing shape inside a repeating pattern (K4). WNCP and Ontario ask for a missing element from grade 1.
    id: "k-pattern-missing",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: true, standard: "K4",
    fill(rng) {
      const [x, y, z] = rng.shuffle([0, 1, 2, 3]);
      const core = rng.pick([[x, y], [x, y, z], [x, x, y]]);
      const length = core.length * 2 + rng.int(0, 1);
      // The gap is never the first item, and the core shows whole once before it or after it.
      const gap = rng.int(1, length - 2);
      const p = shapeQuestion(rng, core, length, gap);
      return { values: { x, y, z, size: core.length, doubled: core[1] === x ? 1 : 0, length, gap }, ...p };
    },
  },
  {
    // The part of a pattern that repeats (K4). WNCP names the core in grade 1; Ontario in grade 1.
    id: "k-pattern-core",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "K4",
    fill(rng) {
      const [x, y, z] = rng.shuffle([0, 1, 2, 3]).map((i) => SHAPES[i]);
      const three = rng.int(0, 1) === 1;
      const core = three ? [x, y, z] : [x, y];
      const glyphs = (shapes: readonly Shape[]) => shapes.map((s) => s.glyph).join(GAP);
      const shown = [...core, ...core, ...core];
      // Wrong cores: one shape too few, or one too many (the core and the next shape).
      const short = core.slice(0, -1).length > 1 ? core.slice(0, -1) : [x, x];
      return {
        values: { x: SHAPES.indexOf(x), y: SHAPES.indexOf(y), z: SHAPES.indexOf(z), three: three ? 1 : 0 },
        prompt: `Which part repeats? ${glyphs(shown)}`,
        readAloud: `Look at the pattern: ${shown.map((s) => s.word).join(", ")}. Which part of the pattern repeats?`,
        answer: glyphs(core),
        wrong: [wrong(glyphs(short), "pattern-core"), wrong(glyphs([...core, core[0]]), "pattern-core")],
      };
    },
  },
  {
    // One more and one less (K5). WNCP and Ontario place the change story in grade 1.
    id: "k-one-more-less",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K5",
    fill(rng) {
      const more = rng.int(0, 1) === 1;
      const n = more ? rng.int(3, 9) : rng.int(3, 10);
      const [thing, one] = rng.pick([["cubes", "cube"], ["beads", "bead"], ["buttons", "button"]] as const);
      const change = more ? `You add 1 more ${one}.` : `You take away 1 ${one}.`;
      return {
        values: { n, more: more ? 1 : 0 },
        prompt: `There are ${n} ${thing}: ${row(n)}. ${change} How many ${thing} are there now?`,
        readAloud: `There are ${n} ${thing}. ${change} How many ${thing} are there now?`,
        answer: String(more ? n + 1 : n - 1),
        wrong: [wrong(more ? n - 1 : n + 1, "operation"), wrong(n, "count-unchanged")],
      };
    },
  },
  {
    // Two more and two less (K5). WNCP and Ontario place it in grade 1.
    id: "k-two-more-less",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K5",
    fill(rng) {
      const more = rng.int(0, 1) === 1;
      const n = more ? rng.int(2, 8) : rng.int(3, 10);
      const ask = `What number is 2 ${more ? "more" : "less"} than ${n}?`;
      return {
        values: { n, more: more ? 1 : 0 },
        prompt: ask,
        readAloud: ask,
        answer: String(more ? n + 2 : n - 2),
        wrong: [wrong(more ? n + 1 : n - 1, "skip-by-one"), wrong(more ? n - 2 : n + 2, "more-less")],
      };
    },
  },
  {
    // Add or take away to change one amount to another (K5). WNCP and Ontario place it in grade 1.
    id: "k-add-or-take",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: true, standard: "K5",
    fill(rng) {
      const [have, want] = draw(rng, (r) => r.shuffle([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2), ([a, b]) => Math.abs(a - b) >= 2 && a !== 2 * b);
      const name = rng.pick(NAMES);
      const step = Math.abs(want - have);
      const right = want > have ? `Add ${step} cubes` : `Take away ${step} cubes`;
      const flip = want > have ? `Take away ${step} cubes` : `Add ${step} cubes`;
      return {
        values: { have, want },
        prompt: `${name} has ${have} cubes: ${row(have, "■")}. ${name} wants ${want} cubes. What should ${name} do?`,
        readAloud: `${name} has ${have} cubes. ${name} wants ${want} cubes. What should ${name} do?`,
        answer: right,
        wrong: [wrong(flip, "operation"), wrong(`${want > have ? "Add" : "Take away"} ${want} cubes`, "start-as-total")],
      };
    },
  },
  {
    // Equal or not equal (K6). WNCP and Ontario place equality in grade 1.
    id: "k-equal-groups",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "K6",
    fill(rng) {
      const a = rng.int(4, 8);
      const kind = rng.int(0, 2);
      const b = kind === 0 ? a : kind === 1 ? a - rng.int(1, 2) : a + rng.int(1, 2);
      const [first, second] = rng.shuffle(["red", "blue", "green", "yellow"]);
      // The two groups are spread differently, so a child must count, not look at the length.
      const spread = (n: number) => Array.from({ length: n }, () => "●").join(`${GAP}${GAP}`);
      const equal = "They are equal";
      const firstMore = `The ${first} group has more`, secondMore = `The ${second} group has more`;
      const answer = a === b ? equal : a > b ? firstMore : secondMore;
      const others = [equal, firstMore, secondMore].filter((c) => c !== answer);
      return {
        values: { a, b },
        prompt: `${cap(first)} group: ${row(a)}. ${cap(second)} group: ${spread(b)}. Are the two groups equal?`,
        readAloud: `The ${first} group has ${a} dots. The ${second} group has ${b} dots. Are the two groups equal?`,
        answer,
        wrong: others.map((o) => wrong(o, o === equal ? "same-size" : a === b ? "looks-different" : "more-less")),
      };
    },
  },
  {
    // Make a balance equal by adding (K6). WNCP and Ontario place the balance in grade 1.
    id: "k-make-balance",
    strand: "A", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "K6",
    fill(rng) {
      const [big, small] = draw(rng, (r) => r.shuffle([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2), ([a, b]) => a - b >= 2);
      const [a, b] = rng.shuffle(["red", "blue", "green", "yellow"]);
      return {
        values: { big, small },
        prompt: `A balance has ${big} cubes on the ${a} side and ${small} cubes on the ${b} side. All the cubes are the same. How many cubes must you add to the ${b} side to make it balance?`,
        readAloud: `A balance has ${big} cubes on the ${a} side and ${small} cubes on the ${b} side. All the cubes are the same. How many cubes must you add to the ${b} side to make it balance?`,
        answer: String(big - small),
        wrong: [wrong(big, "difference-whole"), wrong(big + small, "operation")],
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
        readAloud: `Which line is ${word}?`,
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
        prompt: `${cap(first)} and ${second} are on a balance. The side with ${heavy} is lower. Which object is heavier?`,
        readAloud: `${cap(first)} and ${second} are on a balance. The side with ${heavy} is lower. Which object is heavier?`,
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
        readAloud: `${story} Which is heavier?`,
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
      // "Can roll" or "can stack", never "cannot": young listeners often miss a "not" (#187: the ask varies).
      const rollers = ["A ball", "An orange", "A marble"], flats = ["A box", "A book", "A block"];
      const stack = rng.int(0, 1) === 1;
      const answer = rng.pick(stack ? flats : rollers);
      const others = rng.shuffle(stack ? rollers : flats).slice(0, 2);
      const ask = stack ? "Which one can you stack to make a tall tower?" : "Which one can roll?";
      return {
        values: { stack: stack ? 1 : 0, pick: (stack ? flats : rollers).indexOf(answer) },
        prompt: ask,
        readAloud: ask,
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
        readAloud: `Children chose a favourite ${kind}. Look at the dots. Which did more children choose?`,
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
    // AB current K-6 first names likelihood in grade 6 (MAT6-OI8-GQ1-LO1-KO2-SP).
    id: "k-likely-event",
    strand: "DP", grades: { BC: 0, AB: 6, SK: 5, MB: 5, ON: 1 }, format: "choice", whiteboard: false, standard: "K10",
    fill(rng) {
      const likely = ["You will eat lunch today", "You will see the sky today", "You will hear a car today"];
      const unlikely = ["A cow will fly over your house today", "A dinosaur will visit your school today", "A fish will talk to you today"];
      // Most likely or least likely (K10 comparative language; #187: the ask varies).
      const most = rng.int(0, 1) === 1;
      const answer = rng.pick(most ? likely : unlikely);
      const others = rng.shuffle(most ? unlikely : likely).slice(0, 2);
      const ask = `Which of these is ${most ? "most" : "least"} likely to happen?`;
      return {
        values: { most: most ? 1 : 0, pick: (most ? likely : unlikely).indexOf(answer) },
        prompt: ask,
        // Each choice is its own sentence, so the three do not run together when spoken.
        readAloud: ask,
        answer,
        wrong: others.map((o) => wrong(o, most ? "chance-reversed" : "likelihood-reversed")),
      };
    },
  },
  // More level K measurement, shape and data templates (D-158).
  {
    // Taller and shorter (K7), asked either way, so the answer is not always the child named second.
    id: "k-who-taller",
    strand: "MG", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K7",
    fill(rng) {
      const [a, b] = twoNames(rng);
      const askTaller = rng.int(0, 1) === 1;
      const ask = `${a} is taller than ${b}. Who is ${askTaller ? "taller" : "shorter"}?`;
      return {
        values: { taller: askTaller ? 1 : 0 },
        prompt: ask,
        readAloud: ask,
        answer: askTaller ? a : b,
        wrong: [wrong(askTaller ? b : a, "more-less"), wrong("They are the same height", "same-size")],
      };
    },
  },
  {
    // Which container holds more, by pouring (K7).
    id: "k-holds-more",
    strand: "MG", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K7",
    fill(rng) {
      const [x, y] = rng.shuffle(["jug", "bowl", "bottle", "cup", "glass", "mug"]).slice(0, 2);
      const spills = rng.int(0, 1) === 1;
      // Pour from the full x into the empty y: water spills over y, so x holds more; or y is not full, so y holds more.
      const story = spills
        ? `You fill a ${x} with water and pour it all into an empty ${y}. The water spills over the top of the ${y}.`
        : `You fill a ${x} with water and pour it all into an empty ${y}. The ${y} is not full yet.`;
      return {
        values: { x: ["jug", "bowl", "bottle", "cup", "glass", "mug"].indexOf(x), y: ["jug", "bowl", "bottle", "cup", "glass", "mug"].indexOf(y), spills: spills ? 1 : 0 },
        prompt: `${story} Which holds more?`,
        readAloud: `${story} Which holds more?`,
        answer: `The ${spills ? x : y}`,
        wrong: [wrong(`The ${spills ? y : x}`, "more-less"), wrong("They hold the same", "same-size")],
      };
    },
  },
  {
    // The word for what is compared: length, mass or capacity (K7).
    id: "k-which-word",
    strand: "MG", grades: { BC: 0, AB: 0, SK: 0, MB: 0, ON: 0 }, format: "choice", whiteboard: false, standard: "K7",
    fill(rng) {
      const words = ["Longer", "Heavier", "Holds more"] as const;
      const asks = [
        ["Two pencils lie side by side. Which word tells how they compare from end to end?", 0],
        ["Two ribbons start at the same line. Which word tells how they compare?", 0],
        ["Two bags sit on a balance. Which word tells how they compare?", 1],
        ["You hold a rock in one hand and a feather in the other. Which word tells how they compare?", 1],
        ["Two jugs are filled with water. Which word tells how much water each jug can take?", 2],
        ["You pour water from a bottle into a cup. Which word tells how the bottle and the cup compare?", 2],
      ] as const;
      const k = rng.int(0, asks.length - 1);
      const [ask, w] = asks[k];
      const answer = words[w];
      const others = words.filter((_, i) => i !== w);
      return {
        values: { k },
        prompt: ask,
        readAloud: ask,
        answer,
        wrong: others.map((o) => wrong(o, "unit-kind")),
      };
    },
  },
  {
    // Where an object is: on top of, under, in front of, behind (K8). WNCP has no outcome for position words; Ontario
    // describes locations in grade 1.
    id: "k-where-is",
    strand: "MG", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "K8",
    fill(rng) {
      const [thing, place] = rng.pick([["cat", "table"], ["ball", "chair"], ["dog", "bed"], ["book", "box"]] as const);
      const k = rng.int(0, 3);
      const [where, ask, yes, no] = [
        ["on top of", "Which is higher up?", thing, place],
        ["under", "Which is higher up?", place, thing],
        ["in front of", "You stand in front of them both. Which is closer to you?", thing, place],
        ["behind", "You stand in front of them both. Which is closer to you?", place, thing],
      ][k];
      const story = `The ${thing} is ${where} the ${place}.`;
      return {
        values: { k, pair: ["cat", "ball", "dog", "book"].indexOf(thing) },
        prompt: `${story} ${ask}`,
        readAloud: `${story} ${ask}`,
        answer: `The ${yes}`,
        wrong: [wrong(`The ${no}`, "position-words"), wrong("They are in the same place", "same-size")],
      };
    },
  },
  {
    // The same shape when turned (K8). WNCP sorts 2D shapes in any orientation in grade 1; Ontario in grade 1.
    id: "k-same-shape-turned",
    strand: "MG", grades: { BC: 0, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "K8",
    fill(rng) {
      const square = rng.int(0, 1) === 1;
      const [shown, word, turned] = square ? ["■", "square", "◆"] : ["▲", "triangle", "▼"];
      const others = rng.shuffle(square ? ["●", "▲", "▼"] : ["●", "■", "◆"]).slice(0, 2);
      return {
        values: { square: square ? 1 : 0, first: ["●", "▲", "▼", "■", "◆"].indexOf(others[0]), second: ["●", "▲", "▼", "■", "◆"].indexOf(others[1]) },
        prompt: `Which one is the same shape as ${shown}, only turned?`,
        readAloud: `Here is a ${word}. Which one is the same shape, only turned?`,
        answer: turned,
        wrong: others.map((o) => wrong(o, "shape-name")),
      };
    },
  },
  {
    // A picture graph, asked for the group with fewer (K9). WNCP starts graphs in grade 2; Ontario in grade 1.
    id: "k-graph-fewer",
    strand: "DP", grades: { BC: 0, AB: 2, SK: 2, MB: 2, ON: 1 }, format: "choice", whiteboard: false, standard: "K9",
    fill(rng) {
      const [a, b] = rng.shuffle([2, 3, 4, 5, 6, 7, 8]).slice(0, 2);
      const [kind, x, y] = rng.pick([["snack", "grapes", "crackers"], ["toy", "balls", "dolls"], ["game", "tag", "hopscotch"]] as const);
      return {
        values: { a, b },
        prompt: `Children chose a favourite ${kind}. ${cap(x)}: ${row(a, "■")}. ${cap(y)}: ${row(b, "■")}. Which did fewer children choose?`,
        readAloud: `Children chose a favourite ${kind}. Each square is one child. Which did fewer children choose?`,
        answer: cap(a < b ? x : y),
        wrong: [wrong(cap(a < b ? y : x), "more-less"), wrong("The same number", "same-size")],
      };
    },
  },
  {
    // More likely in a season (K10). AB names likelihood in grade 6, SK and MB in grade 5, Ontario in grade 1.
    id: "k-season-likely",
    strand: "DP", grades: { BC: 0, AB: 6, SK: 5, MB: 5, ON: 1 }, format: "choice", whiteboard: false, standard: "K10",
    fill(rng) {
      const winter = rng.int(0, 1) === 1;
      const likely = winter ? ["You wear a warm coat outside", "You see snow on the ground"] : ["You wear shorts outside", "You see green leaves on the trees"];
      const unlikely = winter ? ["You swim in a lake outside", "You pick ripe strawberries outside", "You wear shorts outside"] : ["You build a snowman outside", "You wear a warm hat and mittens outside", "You see snow falling"];
      const answer = rng.pick(likely);
      const others = rng.shuffle(unlikely).slice(0, 2);
      const ask = `It is a ${winter ? "cold, snowy winter day" : "hot summer day"}. Which is most likely to happen?`;
      return {
        values: { winter: winter ? 1 : 0, pick: likely.indexOf(answer), first: unlikely.indexOf(others[0]) },
        prompt: ask,
        readAloud: ask,
        answer,
        wrong: others.map((o) => wrong(o, "chance-reversed")),
      };
    },
  },
];
