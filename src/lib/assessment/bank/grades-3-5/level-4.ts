// Level 4 (BC grade 4) for the grades 3-5 bank: stage 1 for grade 4, the "up" form for grade 3 and the "down" form
// for grade 5. Standards: curriculum map, section 1 (4.1-4.18); example items: section 3, grade 4.
// Province tags: see ./index.ts.
import { cap, count, draw, NAMES, wrong, type TaggedTemplate } from "../kit";
import { dec, drawChoices, fmt, frac, money, moneyAnswer, plain, sayFrac, sayMoney, time, typedWrong } from "./say";

const digitsOf = (n: number, places: number) => Array.from({ length: places }, (_, i) => Math.floor(n / 10 ** (places - 1 - i)) % 10);
const fromDigits = (ds: number[]) => ds.reduce((s, d) => s * 10 + d, 0);
/** The O1 bug: in each column, the smaller digit from the larger. */
const smallerFromLarger = (a: number, b: number, places: number) => {
  const [x, y] = [digitsOf(a, places), digitsOf(b, places)];
  return fromDigits(x.map((d, i) => Math.abs(d - y[i])));
};
/** Adds column by column and drops every carry (O3). */
const noCarry = (a: number, b: number, places: number) => {
  const [x, y] = [digitsOf(a, places), digitsOf(b, places)];
  return fromDigits(x.map((d, i) => (d + y[i]) % 10));
};

export const LEVEL_4: readonly TaggedTemplate[] = [
  // ---------- Number ----------
  {
    // Place value to 10 000 (map, grade 4: the 7 in 3,742; misconception N2).
    id: "g35-4-digit-value",
    strand: "N", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: false, standard: "4.1",
    fill(rng) {
      const ds = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
      const n = fromDigits(ds);
      const at = rng.int(0, 1); // the thousands or the hundreds digit
      const place = at === 0 ? 1000 : 100;
      const answer = ds[at] * place;
      return {
        values: { n, at },
        prompt: `What is the value of the ${ds[at]} in ${fmt(n)}?`,
        readAloud: `What is the value of the digit ${ds[at]} in the number ${fmt(n)}?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[ds[at], "N2"], [answer / 10, "N2"], [answer * 10, "N2"]]),
      };
    },
  },
  {
    // Compare and order to 10 000 (map, grade 4: 5,306 / 5,360 / 5,063).
    id: "g35-4-order-numbers",
    strand: "N", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "4.1",
    fill(rng) {
      const { v, answer, wrong: w } = drawChoices(
        rng,
        (r) => {
          const th = r.int(1, 9);
          const rest = [0, ...r.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2)];
          const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((p) => p.map((i) => rest[i]));
          return r.shuffle(perms).slice(0, 3).map(([h, t, o]) => th * 1000 + h * 100 + t * 10 + o);
        },
        (nums) => {
          const list = (order: number[]) => order.map(fmt).join("; ");
          const by = (key: (n: number) => number) => [...nums].sort((a, b) => key(a) - key(b) || a - b);
          return {
            answer: list(by((n) => n)),
            candidates: [
              wrong(list(by((n) => n % 10)), "digit-compare"),
              wrong(list(by((n) => -n)), "more-less"),
              wrong(list(by((n) => Math.floor(n / 10) % 10)), "digit-compare"),
            ],
          };
        },
      );
      return {
        values: { a: v[0], b: v[1], c: v[2] },
        prompt: "Which list goes from least to greatest?",
        readAloud: "Which list of numbers goes from least to greatest?",
        answer,
        wrong: w,
      };
    },
  },
  {
    // Expanded form with a zero that holds a place (4.1).
    id: "g35-4-expanded-form",
    strand: "N", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.1",
    fill(rng) {
      const ds = [rng.int(1, 9), rng.int(1, 9), rng.int(1, 9), rng.int(1, 9)];
      ds[rng.int(1, 2)] = 0;
      const n = fromDigits(ds);
      const terms = ds.map((d, i) => d * 10 ** (3 - i)).filter((t) => t > 0);
      const dropped = Number(ds.filter((d) => d > 0).join(""));
      return {
        values: { n },
        prompt: `What number is ${terms.map(fmt).join(" + ")}?`,
        readAloud: `What number is ${terms.map(fmt).join(" plus ")}?`,
        answer: String(n),
        wrong: typedWrong(n, [[dropped, "zero-placeholder"], [Number(terms.join("")), "N1"]]),
      };
    },
  },
  {
    // 100 or 1000 more or less, across a thousand (4.1: "flexible counting").
    id: "g35-4-hundred-more",
    strand: "N", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: false, standard: "4.1",
    fill(rng) {
      const more = rng.int(0, 1) === 1, step = rng.pick([100, 1000]);
      // 100 more than 4,9__ crosses into the next thousand; 100 less than 5,0__ crosses back.
      const n = step === 100
        ? (more ? rng.int(1, 8) * 1000 + 900 + rng.int(0, 99) : rng.int(2, 9) * 1000 + rng.int(0, 99))
        : (more ? rng.int(1000, 8999) : rng.int(2000, 9999));
      const answer = more ? n + step : n - step;
      return {
        values: { n, step, more: more ? 1 : 0 },
        prompt: `What number is ${fmt(step)} ${more ? "more" : "less"} than ${fmt(n)}?`,
        readAloud: `What number is ${fmt(step)} ${more ? "more" : "less"} than ${fmt(n)}?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[more ? n + step / 10 : n - step / 10, "N2"], ...(step === 100 ? [[more ? n + 1000 : n - 1000, "N2"] as [number, "N2"]] : [])]),
      };
    },
  },
  {
    // Subtracting to 10 000 with regrouping (map, grade 4: 4,206 - 1,879; misconception O1).
    id: "g35-4-subtract",
    strand: "O", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.4",
    fill(rng) {
      const [a, b] = draw(
        rng,
        (r) => [r.int(3000, 9800), r.int(1100, 2999)],
        ([a, b]) => a % 10 < b % 10 && Math.floor(a / 10) % 10 <= Math.floor(b / 10) % 10,
      );
      const answer = a - b;
      return {
        values: { a, b },
        prompt: `${fmt(a)} − ${fmt(b)} = ?`,
        readAloud: `What is ${fmt(a)} minus ${fmt(b)}?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[smallerFromLarger(a, b, 4), "O1"], [answer + 10, "regroup-forget"]]),
      };
    },
  },
  {
    // Adding to 10 000 with two carries (4.4).
    id: "g35-4-add",
    strand: "O", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.4",
    fill(rng) {
      const [a, b] = draw(
        rng,
        (r) => [r.int(1200, 6999), r.int(1200, 2999)],
        ([a, b]) => (a % 10) + (b % 10) >= 10 && (Math.floor(a / 100) % 10) + (Math.floor(b / 100) % 10) >= 9 && a + b <= 9999,
      );
      const answer = a + b;
      return {
        values: { a, b },
        prompt: `${fmt(a)} + ${fmt(b)} = ?`,
        readAloud: `What is ${fmt(a)} plus ${fmt(b)}?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[noCarry(a, b, 4), "O3"], [answer - 10, "O3"]]),
      };
    },
  },
  {
    // Two-digit by one-digit (map, grade 4: 34 x 6; misconceptions O5 and O3).
    id: "g35-4-multiply",
    strand: "O", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.5",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(13, 89), r.int(3, 9)], ([a, b]) => (a % 10) * b >= 10 && a % 10 !== 0);
      const t = Math.floor(a / 10), o = a % 10;
      const answer = a * b;
      return {
        values: { a, b },
        prompt: `${a} × ${b} = ?`,
        readAloud: `What is ${a} times ${b}?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[Number(`${t * b}${o * b}`), "O5"], [t * b * 10 + ((o * b) % 10), "O3"]]),
      };
    },
  },
  {
    // Three-digit by one-digit division (map, grade 4: 156 / 4). WNCP and ON divide a 3-digit number in grade 5.
    id: "g35-4-divide",
    strand: "O", grades: { BC: 4, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "4.5",
    fill(rng) {
      const [d, q] = draw(rng, (r) => [r.int(3, 9), r.int(12, 99)], ([d, q]) => d * q >= 100 && d * q <= 999 && q % 10 !== 0);
      const n = d * q;
      // Dividing each digit on its own and dropping the remainders.
      const digitwise = Number(String(n).split("").map((c) => Math.floor(Number(c) / d)).join(""));
      return {
        values: { n, d },
        prompt: `${n} ÷ ${d} = ?`,
        readAloud: `What is ${n} divided by ${d}?`,
        answer: String(q),
        wrong: typedWrong(q, [[digitwise, "division-digitwise"], [n - d, "operation"]]),
      };
    },
  },
  {
    // Sharing a two-digit number (4.5), with a ten to regroup.
    id: "g35-4-share",
    strand: "O", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.5",
    fill(rng) {
      const [d, q] = draw(rng, (r) => [r.int(2, 6), r.int(12, 29)], ([d, q]) => d * q <= 99 && Math.floor((d * q) / 10) % d !== 0);
      const n = d * q;
      const name = rng.pick(NAMES), thing = rng.pick(["stickers", "marbles", "cards", "beads"]);
      const digitwise = Number(String(n).split("").map((c) => Math.floor(Number(c) / d)).join(""));
      return {
        values: { n, d },
        prompt: `${name} shares ${n} ${thing} equally among ${d} friends. How many ${thing} does each friend get?`,
        readAloud: `${name} shares ${n} ${thing} equally among ${d} friends. How many ${thing} does each friend get?`,
        answer: String(q),
        wrong: typedWrong(q, [[digitwise, "division-digitwise"], [n - d, "operation"]]),
      };
    },
  },
  {
    // Making change to 100 dollars (4.18: "count up, count back ... make change").
    id: "g35-4-make-change",
    strand: "O", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.18",
    fill(rng) {
      const pay = rng.pick([1000, 2000, 5000]);
      const price = draw(rng, (r) => r.int(pay / 2, pay - 101), (p) => p % 100 !== 0 && p % 5 === 0);
      const change = pay - price;
      const name = rng.pick(NAMES), item = rng.pick(["a book", "a puzzle", "a hat", "a ball", "a game"]);
      return {
        values: { pay, price },
        prompt: `${cap(item)} costs ${money(price)}. ${name} pays with a ${money(pay).replace(".00", "")} bill. How much change should ${name} get, in dollars?`,
        readAloud: `${cap(item)} costs ${sayMoney(price)}. ${name} pays with a ${pay / 100} dollar bill. How much change should ${name} get, in dollars?`,
        answer: moneyAnswer(change),
        wrong: typedWrong(change / 100, [[(change + 100) / 100, "regroup-forget"], [(pay + price) / 100, "operation"]]),
      };
    },
  },
  {
    // Adding decimals to hundredths (map, grade 4: 3.45 + 2.8; misconception O8). ON adds hundredths in grade 5, and
    // Alberta also introduces these operations in grade 4.
    id: "g35-4-add-decimals",
    strand: "O", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "number", whiteboard: true, standard: "4.6",
    fill(rng) {
      const a = draw(rng, (r) => r.int(110, 899), (a) => a % 10 !== 0); // hundredths
      const b = draw(rng, (r) => r.int(11, 89), (b) => b % 10 !== 0); // tenths
      const answer = a + b * 10;
      return {
        values: { a, b },
        prompt: `${dec(a, 2)} + ${dec(b, 1)} = ?`,
        readAloud: `What is ${dec(a, 2)} plus ${dec(b, 1)}?`,
        answer: plain(answer / 100),
        wrong: typedWrong(answer / 100, [[(a + b) / 100, "O8"]]),
      };
    },
  },
  {
    // Subtracting decimals to hundredths, with a missing zero (4.6).
    id: "g35-4-subtract-decimals",
    strand: "O", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "number", whiteboard: true, standard: "4.6",
    fill(rng) {
      const a = draw(rng, (r) => r.int(31, 98), (a) => a % 10 <= 7); // tenths, like 5.2
      const b = draw(rng, (r) => r.int(101, a * 10 - 20), (b) => b % 10 !== 0 && Math.floor(b / 10) % 10 > a % 10);
      const answer = a * 10 - b;
      return {
        values: { a, b },
        prompt: `${dec(a, 1)} − ${dec(b, 2)} = ?`,
        readAloud: `What is ${dec(a, 1)} minus ${dec(b, 2)}?`,
        answer: plain(answer / 100),
        wrong: typedWrong(answer / 100, [[smallerFromLarger(a * 10, b, 3) / 100, "O1"]]),
      };
    },
  },
  {
    // Multiplying in a story (4.5).
    id: "g35-4-story-multiply",
    strand: "O", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.5",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(12, 48), r.int(3, 9)], ([a, b]) => (a % 10) * b >= 10);
      const [box, things] = rng.pick([["box", "crayons"], ["pack", "stickers"], ["bag", "apples"], ["row", "seats"], ["shelf", "books"]] as const);
      const t = Math.floor(a / 10), o = a % 10;
      const answer = a * b;
      return {
        values: { a, b },
        prompt: `Each ${box} has ${a} ${things}. How many ${things} are in ${b} ${box === "box" ? "boxes" : box === "shelf" ? "shelves" : `${box}s`}?`,
        readAloud: `Each ${box} has ${a} ${things}. How many ${things} are in ${b} ${box === "box" ? "boxes" : box === "shelf" ? "shelves" : `${box}s`}?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[a + b, "operation"], [t * b * 10 + ((o * b) % 10), "O3"], [Number(`${t * b}${o * b}`), "O5"]]),
      };
    },
  },
  {
    // Multiples (4.1). WNCP teaches multiples in grade 6, and AB and ON are unsure, so the others get 6.
    id: "g35-4-multiple",
    strand: "N", grades: { BC: 4, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "4.1",
    fill(rng) {
      const { v: [k, answer], answer: a, wrong: w } = drawChoices(
        rng,
        (r) => {
          const k = r.pick([4, 6, 7, 8, 9]);
          return [k, k * r.int(3, 11), draw(r, (q) => q.int(1, 9) * 10 + k, (x) => x % k !== 0)] as const;
        },
        ([k, answer, endsInK]) => {
          const near = answer + (answer % 2 === 0 ? 1 : 2);
          return {
            answer: String(answer),
            candidates: [
              wrong(endsInK, "multiple-last-digit"),
              wrong(k === 9 ? 3 : k / 2 === Math.floor(k / 2) ? k / 2 : 1, "factor-multiple"),
              ...(near % k !== 0 ? [wrong(near, "skip-by-one")] : []),
            ],
          };
        },
      );
      return {
        values: { k, answer },
        prompt: `Which number is a multiple of ${k}?`,
        readAloud: `Which number is a multiple of ${k}?`,
        answer: a,
        wrong: w,
      };
    },
  },
  {
    // A number between two others (4.1: "compare and order").
    id: "g35-4-between",
    strand: "N", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "4.1",
    fill(rng) {
      const { v: [th, h, t, o], answer, wrong: w } = drawChoices(
        rng,
        (r) => [r.int(1, 8), r.int(1, 8), r.int(1, 9), r.int(1, 9)] as const,
        ([th, h, t, o]) => {
          const inRange = (n: number) => n >= th * 1000 + h * 100 && n < th * 1000 + (h + 1) * 100;
          const cands = [
            [th * 1000 + t * 100 + h * 10 + o, "digit-compare"],
            [th * 1000 + h * 10 + t, "N2"],
            [(th + 1) * 1000 + h * 100 + t * 10 + o, "digit-compare"],
          ] as const;
          return {
            answer: fmt(th * 1000 + h * 100 + t * 10 + o),
            candidates: cands.filter(([n]) => !inRange(n)).map(([n, m]) => wrong(fmt(n), m)),
          };
        },
      );
      const lo = th * 1000 + h * 100;
      return {
        values: { th, h, t, o },
        prompt: `Which number is between ${fmt(lo)} and ${fmt(lo + 100)}?`,
        readAloud: `Which number is between ${fmt(lo)} and ${fmt(lo + 100)}?`,
        answer,
        wrong: w,
      };
    },
  },

  // ---------- Fractions and decimals ----------
  ...["region", "left", "order", "value", "fraction"].map((task): TaggedTemplate => ({
    id: `g35-4-tenths-${task}`, strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 },
    format: "choice", whiteboard: true, standard: "4.2",
    fill(rng) {
      const n = draw(rng, (r) => r.int(1, 9), (n) => n !== 5);
      const whole = rng.int(2, 8);
      if (task === "order") {
        const ns = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4).sort((a, b) => a - b);
        return { values: { n: ns[0], whole }, prompt: "Which decimal is least?", readAloud: "Which decimal is least?", answer: dec(ns[0], 1),
          wrong: ns.slice(1).map((v, i) => wrong(dec(v, 1), i === 2 ? "more-less" : "decimal-order")) };
      }
      const right = task === "left" ? dec(10 - n, 1) : task === "fraction" ? frac(n, 10) : dec(n, 1);
      const prompt = task === "region" ? `A strip has 10 equal parts. ${count(n, "part")} is shaded. Which decimal names the shaded part?`
        : task === "left" ? `${frac(n, 10)} of a strip is shaded. Which decimal names the part not shaded?`
        : task === "value" ? `What is the value of the ${n} in ${whole}.${n}?`
        : `Which fraction is equal to ${whole}.${n} − ${whole}?`;
      const spoken = task === "region" ? prompt : task === "left" ? `${sayFrac(n, 10)} of a strip is shaded. Which decimal names the part not shaded?`
        : task === "value" ? `What is the value of the ${n} in ${whole} and ${sayFrac(n, 10)}?`
        : `Which fraction is equal to ${whole} and ${sayFrac(n, 10)}, minus ${whole}?`;
      const candidates = task === "fraction" ? [wrong(frac(n, 100), "decimal-point"), wrong(frac(10, n), "fraction-flip"), wrong(frac(n * 10, 10), "decimal-point")]
        : task === "left" ? [wrong(dec(n, 1), "fraction-other-part"), wrong(dec(10 - n, 2), "decimal-point"), wrong(String(10 - n), "decimal-point")]
        : [wrong(dec(n, 2), "decimal-point"), wrong(String(n), "N2"), wrong(dec(10 - n, 1), task === "value" ? "complement" : "fraction-other-part")];
      return { values: { n, whole }, prompt, readAloud: spoken, answer: right, wrong: candidates };
    },
  })),
  {
    // Fractions with the same denominator (4.3: "compare and order fractions with common denominators").
    id: "g35-4-compare-like",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "4.3",
    fill(rng) {
      const d = rng.pick([5, 6, 8, 10, 12]);
      const nums = rng.shuffle(Array.from({ length: d - 1 }, (_, i) => i + 1)).slice(0, 4).sort((a, b) => a - b);
      const greatest = rng.int(0, 1) === 1;
      const pick = greatest ? nums[3] : nums[0];
      const others = nums.filter((n) => n !== pick);
      return {
        values: { d, greatest: greatest ? 1 : 0, a: nums[0], b: nums[1], c: nums[2], e: nums[3] },
        prompt: `Which fraction is the ${greatest ? "greatest" : "least"}?`,
        readAloud: `Which fraction is the ${greatest ? "greatest" : "least"}?`,
        answer: frac(pick, d),
        wrong: others.map((n) => wrong(frac(n, d), n === (greatest ? nums[0] : nums[3]) ? "more-less" : "fraction-order")),
      };
    },
  },
  {
    // Unit fractions of the same whole (map, misconception F1: 1/4 or 1/8).
    id: "g35-4-compare-unit",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: true, standard: "4.3",
    fill(rng) {
      const ds = rng.shuffle([2, 3, 4, 5, 6, 8, 10, 12]).slice(0, 4).sort((a, b) => a - b);
      const biggest = rng.int(0, 1) === 1;
      const pick = biggest ? ds[0] : ds[3];
      const whole = rng.pick(["pizzas", "cakes", "pies", "chocolate bars"]);
      return {
        values: { biggest: biggest ? 1 : 0, a: ds[0], b: ds[1], c: ds[2], e: ds[3] },
        prompt: `Some ${whole} are all the same size. Which piece is the ${biggest ? "biggest" : "smallest"}?`,
        readAloud: `Some ${whole} are all the same size. Which piece is the ${biggest ? "biggest" : "smallest"}?`,
        answer: `${frac(1, pick)} of a ${whole.slice(0, -1)}`,
        wrong: ds.filter((d) => d !== pick).map((d) => wrong(`${frac(1, d)} of a ${whole.slice(0, -1)}`, d === (biggest ? ds[3] : ds[0]) ? "F1" : "fraction-order")),
      };
    },
  },
  {
    // Benchmarks 0, one half and 1 (map, grade 4: is 7/8 closest to 0, 1/2 or 1?). The choices are the question.
    id: "g35-4-benchmark",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "choice", whiteboard: true, standard: "4.3",
    fill(rng) {
      const [n, d] = draw(
        rng,
        (r) => { const d = r.pick([5, 6, 8, 10, 12]); return [r.int(1, d - 1), d] as const; },
        ([n, d]) => {
          const x = n / d;
          const gaps = [x, Math.abs(x - 0.5), 1 - x].sort((a, b) => a - b);
          return gaps[1] - gaps[0] >= 0.1;
        },
      );
      const x = n / d;
      const near = [[0, "0"], [0.5, "1/2"], [1, "1"]] as const;
      const best = [...near].sort((a, b) => Math.abs(x - a[0]) - Math.abs(x - b[0]))[0];
      return {
        values: { n, d },
        prompt: `Which benchmark is closest to ${frac(n, d)}?`,
        readAloud: `Which benchmark is closest to ${sayFrac(n, d)}?`,
        answer: best[1],
        wrong: near.filter((b) => b !== best).map((b) => wrong(b[1], b[0] === 0 ? "benchmark-zero" : b[0] === 0.5 ? "benchmark-half" : "benchmark-one")),
      };
    },
  },
  {
    // Tenths as decimals (4.2: "the relationship between fractions and decimals").
    id: "g35-4-tenths-decimal",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "4.2",
    fill(rng) {
      const n = rng.int(1, 9);
      return {
        values: { n },
        prompt: `Which decimal is the same as ${frac(n, 10)}?`,
        readAloud: `Which decimal is the same as ${sayFrac(n, 10)}?`,
        answer: `0.${n}`,
        wrong: [wrong(`${n}.10`, "F7"), wrong(`0.0${n}`, "decimal-point"), wrong(`${n}.0`, "decimal-point")],
      };
    },
  },
  {
    // Hundredths as decimals (4.2). ON reads hundredths in grade 5.
    id: "g35-4-hundredths-decimal",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "choice", whiteboard: false, standard: "4.2",
    fill(rng) {
      const n = draw(rng, (r) => r.int(11, 99), (n) => n % 10 !== 0);
      return {
        values: { n },
        prompt: `Which decimal is the same as ${frac(n, 100)}?`,
        readAloud: `Which decimal is the same as ${sayFrac(n, 100)}?`,
        answer: dec(n, 2),
        wrong: [wrong(dec(n, 1), "decimal-point"), wrong(dec(n, 3), "decimal-point"), wrong(`${n}.100`, "F7")],
      };
    },
  },
  {
    // A decimal as a fraction (map, grade 4: which fraction equals 0.4; misconception F7).
    id: "g35-4-decimal-to-fraction",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "4.2",
    fill(rng) {
      const n = rng.int(2, 9);
      return {
        values: { n },
        prompt: `Which fraction is the same as 0.${n}?`,
        readAloud: `Which fraction is the same as 0.${n}?`,
        answer: frac(n, 10),
        wrong: [wrong(frac(n, 100), "decimal-point"), wrong(frac(1, n), "decimal-unit-part"), wrong(frac(n * 10, 10), "decimal-point")],
      };
    },
  },
  {
    // Comparing tenths and hundredths (4.2; misconception F6). WNCP and ON compare decimals in grade 5 (unsure).
    id: "g35-4-compare-decimals",
    strand: "F", grades: { BC: 4, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: false, standard: "4.2",
    fill(rng) {
      const greatest = rng.int(0, 1) === 1;
      const { v, answer, wrong: w } = drawChoices(
        rng,
        (r) => {
          const t = r.int(3, 8); // the answer's tenths (greatest), or the trap
          const hs = [r.int(11, t * 10 - 1), r.int(11, t * 10 - 1), r.int(11, t * 10 - 1)].map((h) => (h % 10 === 0 ? h + 1 : h));
          return { t, hs, small: r.int(1, 2) };
        },
        ({ t, hs, small }) => greatest
          // Greatest: one tenths number beats three longer hundredths numbers.
          ? { answer: dec(t, 1), candidates: hs.map((h) => wrong(dec(h, 2), "F6")) }
          // Least: a short hundredths number like 0.05 is below tenths numbers.
          : { answer: dec(small, 2), candidates: [wrong(dec(t, 1), "F6"), ...hs.map((h) => wrong(dec(h, 2), "decimal-order"))] },
      );
      return {
        values: { t: v.t, greatest: greatest ? 1 : 0 },
        prompt: `Which decimal is the ${greatest ? "greatest" : "least"}?`,
        readAloud: `Which decimal is the ${greatest ? "greatest" : "least"}?`,
        answer,
        wrong: w,
      };
    },
  },
  {
    // Money in decimal notation (4.2, 4.18: "decimal notation in real-life problems").
    id: "g35-4-money-notation",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "4.18",
    fill(rng) {
      const d = rng.int(1, 20), c = rng.int(1, 9);
      return {
        values: { d, c },
        prompt: `How do you write ${count(d, "dollar")} and ${count(c, "cent")} with a dollar sign?`,
        readAloud: `How do you write ${count(d, "dollar")} and ${count(c, "cent")} with a dollar sign?`,
        answer: money(d * 100 + c),
        wrong: [wrong(`$${d}.${c}0`, "zero-placeholder"), wrong(`$${d}${c}`, "decimal-point"), wrong(`$${d}.${c}`, "zero-placeholder")],
      };
    },
  },
  {
    // The value of a decimal digit (4.2; misconception N2). ON reads hundredths in grade 5.
    id: "g35-4-decimal-digit",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "choice", whiteboard: false, standard: "4.2",
    fill(rng) {
      const [o, t, h] = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
      const n = `${o}.${t}${h}`;
      const tenths = rng.int(0, 1) === 1;
      const digit = tenths ? t : h;
      const [right, ...others] = tenths
        ? [`${digit} tenths`, [`${digit} hundredths`, "N2"], [`${digit} ones`, "N2"], [`${digit * 10}`, "N2"]] as const
        : [`${digit} hundredths`, [`${digit} tenths`, "N2"], [`${digit} ones`, "N2"], [`${digit} thousandths`, "N2"]] as const;
      return {
        values: { o, t, h, tenths: tenths ? 1 : 0 },
        prompt: `In ${n}, what is the value of the ${digit}?`,
        readAloud: `In the number ${n}, what is the value of the digit ${digit}?`,
        answer: right.replace(/^1 (\w+)s$/, "1 $1"),
        wrong: others.map(([v, m]) => wrong(v.replace(/^1 (\w+)s$/, "1 $1"), m)),
      };
    },
  },
  {
    // A decimal on a number line in tenths (4.2: "linear models").
    id: "g35-4-decimal-number-line",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: true, standard: "4.2",
    fill(rng) {
      const n = rng.int(1, 8);
      return {
        values: { n },
        prompt: `A number line goes from 0 to 1. It is split into 10 equal parts. A dot is ${count(n, "part")} from 0. Which decimal is at the dot?`,
        readAloud: `A number line goes from 0 to 1. It is split into 10 equal parts. A dot is ${count(n, "part")} from 0. Which decimal is at the dot?`,
        answer: `0.${n}`,
        wrong: [wrong(`0.0${n}`, "decimal-point"), wrong(`0.${n + 1}`, "F5"), wrong(`${n}.0`, "decimal-point")],
      };
    },
  },
  {
    // Hundredths on a grid (4.2: "region models"). ON reads hundredths in grade 5.
    id: "g35-4-hundredths-grid",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "choice", whiteboard: false, standard: "4.2",
    fill(rng) {
      const n = draw(rng, (r) => r.int(12, 88), (n) => n % 10 !== 0 && n !== 50);
      return {
        values: { n },
        prompt: `A grid has 100 equal squares. ${n} of the squares are shaded. Which decimal names the shaded part?`,
        readAloud: `A grid has 100 equal squares. ${n} of the squares are shaded. Which decimal names the shaded part?`,
        answer: dec(n, 2),
        wrong: [wrong(dec(n, 1), "decimal-point"), wrong(dec(100 - n, 2), "fraction-other-part"), wrong(`${n}.0`, "decimal-point")],
      };
    },
  },
  {
    // More than one half (4.3: "estimate with benchmarks"). ON is unsure, so 5.
    id: "g35-4-more-than-half",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "choice", whiteboard: true, standard: "4.3",
    fill(rng) {
      // The answer has small numbers; the wrong choices have bigger numbers but are less than one half.
      const [an, ad] = rng.pick([[2, 3], [3, 4], [3, 5], [4, 5], [4, 6], [5, 8], [4, 7]] as const);
      const lows = rng.shuffle([[4, 9], [5, 12], [3, 8], [4, 10], [5, 11], [6, 13], [2, 7], [3, 10]] as const).slice(0, 3);
      return {
        values: { an, ad },
        prompt: "Which fraction is greater than 1/2?",
        readAloud: "Which fraction is greater than one half?",
        answer: frac(an, ad),
        wrong: lows.map(([n, d]) => wrong(frac(n, d), "benchmark-size")),
      };
    },
  },
  {
    // Tenths as hundredths (4.2). ON reads hundredths in grade 5.
    id: "g35-4-tenths-as-hundredths",
    strand: "F", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "number", whiteboard: false, standard: "4.2",
    fill(rng) {
      const n = rng.int(1, 9);
      return {
        values: { n },
        prompt: `0.${n} is the same as how many hundredths?`,
        readAloud: `0.${n} is the same as how many hundredths?`,
        answer: String(n * 10),
        wrong: typedWrong(n * 10, [[n, "decimal-point"], [n * 100, "decimal-point"]]),
      };
    },
  },

  // ---------- Patterns and algebra ----------
  {
    // Extend a pattern in a table (map, grade 4: inputs 1-4 give 5, 8, 11, 14).
    id: "g35-4-table-pattern",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.9",
    fill(rng) {
      const k = rng.int(2, 9), s = draw(rng, (r) => r.int(1, 12), (s) => s !== k);
      const out = (i: number) => s + (i - 1) * k;
      const answer = out(6);
      return {
        values: { s, k },
        prompt: `In a table, input 1 gives ${out(1)}, input 2 gives ${out(2)}, input 3 gives ${out(3)} and input 4 gives ${out(4)}. The pattern keeps going. What does input 6 give?`,
        readAloud: `In a table, input 1 gives ${out(1)}, input 2 gives ${out(2)}, input 3 gives ${out(3)} and input 4 gives ${out(4)}. The pattern keeps going. What does input 6 give?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[out(5), "next-not-asked"], [6 * k, "A5"]]),
      };
    },
  },
  {
    // A missing factor (map, grade 4: ? x 6 = 42).
    id: "g35-4-missing-factor",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.11",
    fill(rng) {
      const a = rng.int(3, 9), b = rng.int(3, 9), first = rng.int(0, 1) === 1;
      const p = a * b;
      return {
        values: { a, b, first: first ? 1 : 0 },
        prompt: first ? `? × ${b} = ${p}` : `${b} × ? = ${p}`,
        readAloud: first ? `What number times ${b} is ${p}?` : `${b} times what number is ${p}?`,
        answer: String(a),
        wrong: typedWrong(a, [[p - b, "operation"], [p + b, "operation"], [p * b, "operation"]]),
      };
    },
  },
  {
    // A missing divisor (4.11: all operations).
    id: "g35-4-missing-divisor",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.11",
    fill(rng) {
      const a = rng.int(3, 9), q = draw(rng, (r) => r.int(3, 9), (q) => q !== a);
      const n = a * q;
      return {
        values: { n, q },
        prompt: `${n} ÷ ? = ${q}`,
        readAloud: `${n} divided by what number is ${q}?`,
        answer: String(a),
        wrong: typedWrong(a, [[n * q, "operation"], [n - q, "operation"]]),
      };
    },
  },
  {
    // A missing number in a bigger subtraction (map, grade 4: 15 - ? = 11).
    id: "g35-4-subtract-unknown",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.11",
    fill(rng) {
      const a = rng.int(16, 60) * 50, b = draw(rng, (r) => r.int(5, a / 50 - 6) * 50, (b) => 2 * b !== a && (a - b) % 100 !== 0);
      return {
        values: { a, b },
        prompt: `${fmt(a)} − ? = ${fmt(b)}`,
        readAloud: `${fmt(a)} minus what number is ${fmt(b)}?`,
        answer: String(a - b),
        wrong: typedWrong(a - b, [[a + b, "operation"]]),
      };
    },
  },
  {
    // A decreasing pattern in a table (4.9).
    id: "g35-4-decreasing-table",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.9",
    fill(rng) {
      const k = rng.pick([15, 20, 25, 30, 35, 40, 45]), start = rng.int(8, 12) * 50;
      const after = (n: number) => start - n * k;
      const name = rng.pick(NAMES);
      return {
        values: { start, k },
        prompt: `A tank holds ${start} litres of water. ${name} uses ${k} litres each day. After 1 day there are ${after(1)} litres, after 2 days ${after(2)} and after 3 days ${after(3)}. How many litres are left after 6 days?`,
        readAloud: `A tank holds ${start} litres of water. ${name} uses ${k} litres each day. After 1 day there are ${after(1)} litres, after 2 days ${after(2)} and after 3 days ${after(3)}. How many litres are left after 6 days?`,
        answer: String(after(6)),
        wrong: typedWrong(after(6), [[after(5), "one-to-one"], [start + 6 * k, "pattern-direction"]]),
      };
    },
  },
  {
    // Choose the equation for a story (4.10: "represent and explain one-step equations with an unknown").
    id: "g35-4-equation-for-story",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "4.10",
    fill(rng) {
      const each = rng.int(3, 9), boxes = draw(rng, (r) => r.int(3, 9), (b) => b !== each);
      const total = each * boxes;
      const name = rng.pick(NAMES);
      const [box, things] = rng.pick([["box", "pens"], ["bag", "apples"], ["pack", "cards"], ["jar", "cookies"]] as const);
      return {
        values: { each, boxes },
        prompt: `${name} has some ${box === "box" ? "boxes" : `${box}s`}. Each ${box} has ${each} ${things}. ${name} has ${total} ${things} in all. Which equation shows this?`,
        readAloud: `${name} has some ${box === "box" ? "boxes" : `${box}s`}. Each ${box} has ${each} ${things}. ${name} has ${total} ${things} in all. Which equation shows this?`,
        answer: `? × ${each} = ${total}`,
        wrong: [wrong(`? + ${each} = ${total}`, "operation"), wrong(`${total} × ${each} = ?`, "operation"), wrong(`? − ${each} = ${total}`, "operation")],
      };
    },
  },
  {
    // Equal products on both sides (4.10: "algebraic relationships among quantities"; misconception A1). Preserving
    // equality is WNCP grade 5 or 6 and AB is unsure, so those get 5.
    id: "g35-4-balance-multiply",
    strand: "A", grades: { BC: 4, AB: 5, SK: 5, MB: 5, ON: 4 }, format: "number", whiteboard: true, standard: "4.10",
    fill(rng) {
      const [a, b, c] = draw(
        rng,
        (r) => [r.int(2, 9), r.int(2, 9), r.int(2, 9)],
        ([a, b, c]) => (a * b) % c === 0 && c !== a && c !== b && (a * b) / c !== a && (a * b) / c <= 12,
      );
      const answer = (a * b) / c;
      return {
        values: { a, b, c },
        prompt: `${a} × ${b} = ${c} × ?`,
        readAloud: `${a} times ${b} is the same as ${c} times what number?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[a * b, "A1"], [a * b + c, "operation"]]),
      };
    },
  },
  {
    // Find the rule of a table (4.9: "describe with words and numbers").
    id: "g35-4-table-rule",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "4.9",
    fill(rng) {
      const times = rng.int(0, 1) === 1;
      const k = rng.int(3, 9);
      const outs = [1, 2, 3].map((i) => (times ? i * k : i + k));
      return {
        values: { k, times: times ? 1 : 0 },
        prompt: `In a table, input 1 gives ${outs[0]}, input 2 gives ${outs[1]} and input 3 gives ${outs[2]}. Which rule fits every row?`,
        readAloud: `In a table, input 1 gives ${outs[0]}, input 2 gives ${outs[1]} and input 3 gives ${outs[2]}. Which rule fits every row?`,
        answer: times ? `Multiply the input by ${k}` : `Add ${k} to the input`,
        wrong: times
          ? [wrong(`Add ${k} to the input`, "rule-from-change"), wrong(`Add ${k - 1} to the input`, "rule-one-row")]
          : [wrong("Add 1 to the input", "rule-from-change"), wrong(`Multiply the input by ${k + 1}`, "rule-one-row")],
      };
    },
  },
  {
    // A far figure in a growing pattern (4.9). Predicting a far term is WNCP grade 5 (unsure), so the others get 5.
    id: "g35-4-figure-pattern",
    strand: "A", grades: { BC: 4, AB: 5, SK: 5, MB: 5, ON: 4 }, format: "number", whiteboard: true, standard: "4.9",
    fill(rng) {
      const k = rng.int(2, 5), s = draw(rng, (r) => r.int(2, 9), (s) => s !== k);
      const fig = (i: number) => s + (i - 1) * k;
      const far = rng.int(8, 12);
      const thing = rng.pick(["tiles", "dots", "sticks", "blocks"]);
      return {
        values: { s, k, far },
        prompt: `Figure 1 has ${fig(1)} ${thing}. Figure 2 has ${fig(2)} ${thing}. Figure 3 has ${fig(3)} ${thing}. The pattern keeps growing the same way. How many ${thing} are in figure ${far}?`,
        readAloud: `Figure 1 has ${fig(1)} ${thing}. Figure 2 has ${fig(2)} ${thing}. Figure 3 has ${fig(3)} ${thing}. The pattern keeps growing the same way. How many ${thing} are in figure ${far}?`,
        answer: String(fig(far)),
        wrong: typedWrong(fig(far), [[fig(4), "next-not-asked"], [far * k, "A5"], [far * s, "pattern-multiply"]]),
      };
    },
  },
  {
    // Three equal unknowns (4.11).
    id: "g35-4-three-same",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "number", whiteboard: true, standard: "4.11",
    fill(rng) {
      const k = rng.int(4, 30);
      return {
        values: { k },
        prompt: `? + ? + ? = ${3 * k}. All three missing numbers are the same. What is the missing number?`,
        readAloud: `A missing number, plus the same number, plus the same number again, is ${3 * k}. What is the missing number?`,
        answer: String(k),
        wrong: typedWrong(k, [[3 * k, "A1"], [3 * k - 3, "operation"], [9 * k, "operation"]]),
      };
    },
  },
  {
    // Which equation is true (4.10; misconception A1). Equality on both sides: as g35-4-balance-multiply.
    id: "g35-4-true-equation",
    strand: "A", grades: { BC: 4, AB: 5, SK: 5, MB: 5, ON: 4 }, format: "choice", whiteboard: false, standard: "4.10",
    fill(rng) {
      const [p, [a, b], [c, d]] = rng.pick([
        [12, [3, 4], [2, 6]], [18, [2, 9], [3, 6]], [20, [4, 5], [2, 10]], [24, [4, 6], [3, 8]], [30, [5, 6], [3, 10]],
        [36, [4, 9], [6, 6]], [40, [5, 8], [4, 10]], [16, [2, 8], [4, 4]],
      ] as const);
      const extra = rng.int(2, 5);
      return {
        values: { p, extra },
        prompt: "Which equation is true?",
        readAloud: "Which equation is true?",
        answer: `${a} × ${b} = ${c} × ${d}`,
        wrong: [
          wrong(`${a} × ${b} = ${p} + ${extra}`, "A1"),
          wrong(`${a} × ${b} = ${a} + ${b}`, "operation"),
          wrong(`${a} × ${b} = ${c} × ${d + 1}`, "same-size"),
        ],
      };
    },
  },
  {
    // Undo a rule (4.10: "algebraic relationships").
    id: "g35-4-machine-input",
    strand: "A", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 6 }, format: "number", whiteboard: true, standard: "4.10",
    fill(rng) {
      const k = rng.int(3, 9), x = draw(rng, (r) => r.int(3, 12), (x) => x !== k);
      const out = k * x;
      return {
        values: { k, x },
        prompt: `A number machine multiplies every number by ${k}. A number goes in and ${out} comes out. What number went in?`,
        readAloud: `A number machine multiplies every number by ${k}. A number goes in and ${out} comes out. What number went in?`,
        answer: String(x),
        wrong: typedWrong(x, [[out * k, "operation"], [out - k, "operation"]]),
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    // Perimeter of a rectangle (map, grade 4: 8 cm by 5 cm; misconception M2).
    id: "g35-4-perimeter",
    strand: "MG", grades: { BC: 4, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "4.14",
    fill(rng) {
      const l = rng.int(4, 15), w = draw(rng, (r) => r.int(2, 9), (w) => w < l && w !== 2);
      const [unit, word] = rng.pick([["cm", "centimetres"], ["m", "metres"]] as const);
      const thing = unit === "cm" ? rng.pick(["card", "photo", "sticker"]) : rng.pick(["garden", "patio", "playground"]);
      return {
        values: { l, w },
        prompt: `A rectangular ${thing} is ${l} ${unit} long and ${w} ${unit} wide. What is its perimeter, in ${unit}?`,
        readAloud: `A rectangular ${thing} is ${l} ${word} long and ${w} ${word} wide. What is its perimeter, in ${word}?`,
        answer: String(2 * (l + w)),
        wrong: typedWrong(2 * (l + w), [[l * w, "M2"], [l + w, "M2"]]),
      };
    },
  },
  {
    // Perimeter of an irregular shape (4.14: "regular and irregular shapes").
    id: "g35-4-perimeter-sides",
    strand: "MG", grades: { BC: 4, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "4.14",
    fill(rng) {
      const n = rng.int(4, 6);
      const sides = draw(rng, (r) => Array.from({ length: n }, () => r.int(2, 12)),
        (sides) => 2 * Math.max(...sides) < sides.reduce((sum, side) => sum + side, 0));
      const total = sides.reduce((s, x) => s + x, 0);
      return {
        values: { n, total },
        prompt: `A garden has ${n} straight sides. They measure ${sides.slice(0, -1).map((s) => `${s} m`).join(", ")} and ${sides[n - 1]} m. How long is a fence that goes all the way around, in m?`,
        readAloud: `A garden has ${n} straight sides. They measure ${sides.slice(0, -1).map((s) => `${s} metres`).join(", ")} and ${sides[n - 1]} metres. How many metres long is a fence that goes all the way around?`,
        answer: String(total),
        wrong: typedWrong(total, [[total - sides[n - 1], "leaves-out-addend"]]),
      };
    },
  },
  {
    // A side of a square from its perimeter (4.14).
    id: "g35-4-square-side",
    strand: "MG", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.14",
    fill(rng) {
      const s = rng.int(3, 15);
      const p = 4 * s;
      return {
        values: { s },
        prompt: `A square has a perimeter of ${p} cm. How long is each side, in cm?`,
        readAloud: `A square has a perimeter of ${p} centimetres. How many centimetres long is each side?`,
        answer: String(s),
        wrong: typedWrong(s, [[p / 2, "M2"], [p * 4, "operation"], [p - 4, "operation"]]),
      };
    },
  },
  {
    // Read an analog clock to 5 minutes (4.12; misconception M7). The clock is described in words.
    // AB and ON tell time in grade 3 (map, section 5).
    id: "g35-4-read-clock",
    strand: "MG", grades: { BC: 4, AB: 3, SK: 4, MB: 4, ON: 3 }, format: "choice", whiteboard: false, standard: "4.12",
    fill(rng) {
      const [h, k] = draw(rng, (r) => [r.int(1, 11), r.int(1, 11)], ([h, k]) => h !== k);
      const next = h === 12 ? 1 : h + 1;
      return {
        values: { h, k },
        prompt: `On a clock, the short hand is between the ${h} and the ${next}. The long hand points to the ${k}. What time is it?`,
        readAloud: `On a clock, the short hand is between the ${h} and the ${next}. The long hand points to the ${k}. What time is it?`,
        answer: time(h, 5 * k),
        wrong: [wrong(time(h, k), "M7"), wrong(time(next, 5 * k), "M7"), wrong(time(k, 5 * h), "clock-hands")],
      };
    },
  },
  {
    // Quarter past, half past, quarter to (4.12: "circle and fractions in telling time").
    id: "g35-4-quarter-to",
    strand: "MG", grades: { BC: 4, AB: 3, SK: 4, MB: 4, ON: 3 }, format: "choice", whiteboard: false, standard: "4.12",
    fill(rng) {
      const h = rng.int(2, 11), kind = rng.pick(["quarter past", "half past", "quarter to"] as const);
      const prev = h - 1, next = h + 1;
      const [answer, others] = {
        "quarter past": [time(h, 15), [[time(h, 45), "clock-fraction"], [time(prev, 45), "clock-fraction"], [time(h, 25), "clock-hundred"]]],
        "half past": [time(h, 30), [[time(next, 30), "clock-hour"], [time(h, 50), "clock-hundred"], [time(prev, 30), "clock-hour"]]],
        "quarter to": [time(prev, 45), [[time(h, 45), "clock-to"], [time(h, 15), "clock-fraction"], [time(prev, 15), "clock-fraction"]]],
      }[kind] as [string, [string, "clock-hour" | "clock-to" | "clock-fraction" | "clock-hundred"][]];
      return {
        values: { h, kind: ["quarter past", "half past", "quarter to"].indexOf(kind) },
        prompt: `What time is ${kind} ${h}?`,
        readAloud: `What time is ${kind} ${h}?`,
        answer,
        wrong: others.map(([v, m]) => wrong(v, m)),
      };
    },
  },
  {
    // 24-hour time (4.12: "12- and 24-hour clocks"). ON is unsure, so 5.
    id: "g35-4-24-hour",
    strand: "MG", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 5 }, format: "choice", whiteboard: false, standard: "4.12",
    fill(rng) {
      const H = rng.int(13, 21), m = rng.pick([0, 15, 30, 45]);
      return {
        values: { H, m },
        prompt: `A train leaves at ${time(H, m)} on a 24-hour clock. What time is that on a 12-hour clock?`,
        readAloud: `A train leaves at ${H} ${m === 0 ? "hundred" : m} on a 24-hour clock. What time is that on a 12-hour clock?`,
        answer: time(H - 12, m, "p.m."),
        wrong: [wrong(time(H - 10, m, "p.m."), "clock-24"), wrong(time(H - 12, m, "a.m."), "clock-24"), wrong(time(H - 10, m, "a.m."), "clock-24")],
      };
    },
  },
  {
    // Regular polygons (4.13). WNCP compares regular and irregular polygons in grade 6, and AB and ON are unsure.
    id: "g35-4-regular-polygon",
    strand: "MG", grades: { BC: 4, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "4.13",
    fill(rng) {
      const answer = rng.pick([
        "A triangle with 3 equal sides and 3 equal angles",
        "A square",
        "A hexagon with 6 equal sides and 6 equal angles",
        "A pentagon with 5 equal sides and 5 equal angles",
      ]);
      const others = rng.shuffle([
        ["A rectangle that is not a square", "one-attribute"],
        ["A rhombus with no square corners", "one-attribute"],
        ["A triangle with sides of 3 cm, 4 cm and 5 cm", "regular-all"],
        ["A circle", "shape-name"],
      ] as const).slice(0, 3);
      return {
        values: {},
        prompt: "A regular polygon has all sides equal and all angles equal. Which shape is a regular polygon?",
        readAloud: "A regular polygon has all sides equal and all angles equal. Which shape is a regular polygon?",
        answer,
        wrong: others.map(([v, m]) => wrong(v, m)),
      };
    },
  },
  {
    // Sides of polygons (4.13: "describe and sort ... polygons").
    id: "g35-4-sides-in-all",
    strand: "MG", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.13",
    fill(rng) {
      const SHAPES = [["triangle", 3], ["pentagon", 5], ["hexagon", 6], ["octagon", 8]] as const;
      const [[n1, s1], [n2, s2]] = rng.shuffle(SHAPES).slice(0, 2);
      const a = rng.int(2, 4), b = rng.int(1, 3);
      const answer = a * s1 + b * s2;
      // A child who mixes up hexagons and octagons.
      const swap = (s: number) => (s === 6 ? 8 : s === 8 ? 6 : s);
      return {
        values: { a, b, s1, s2 },
        prompt: `How many sides do ${a} ${n1}s and ${count(b, n2)} have in all?`,
        readAloud: `How many sides do ${a} ${n1}s and ${count(b, n2)} have in all?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[a + b, "count-objects"], [s1 + s2, "ignores-given"], [a * swap(s1) + b * swap(s2), "shape-name"]]),
      };
    },
  },
  {
    // Lines of symmetry (map, grade 4: a rectangle that is not a square has 2).
    id: "g35-4-symmetry",
    strand: "MG", grades: { BC: 4, AB: 5, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.15",
    fill(rng) {
      const [shape, lines, miss] = rng.pick([
        ["a square", 4, 2],
        ["a rectangle that is not a square", 2, 4],
        ["a triangle with 3 equal sides", 3, 1],
        ["a regular hexagon, with 6 equal sides and 6 equal angles", 6, 3],
        ["a triangle with exactly 2 equal sides", 1, 3],
        ["a regular pentagon, with 5 equal sides and 5 equal angles", 5, 0],
      ] as const);
      return {
        values: { lines },
        prompt: `How many lines of symmetry does ${shape} have?`,
        readAloud: `How many lines of symmetry does ${shape} have?`,
        answer: String(lines),
        wrong: typedWrong(lines, [[miss, "symmetry-lines"]]),
      };
    },
  },
  {
    // A pictograph key (map, grade 4: each symbol = 5 students; misconception D1).
    id: "g35-4-pictograph",
    strand: "DP", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 3 }, format: "number", whiteboard: false, standard: "4.16",
    fill(rng) {
      const k = rng.pick([2, 3, 4, 5, 10]), n = draw(rng, (r) => r.int(3, 9), (n) => n !== k);
      const sport = rng.pick(["soccer", "hockey", "swimming", "basketball", "skating"]);
      return {
        values: { k, n },
        prompt: `In a pictograph, each picture stands for ${k} children. The row for ${sport} has ${n} pictures. How many children chose ${sport}?`,
        readAloud: `In a pictograph, each picture stands for ${k} children. The row for ${sport} has ${n} pictures. How many children chose ${sport}?`,
        answer: String(k * n),
        wrong: typedWrong(k * n, [[n, "D1"], [k + n, "operation"]]),
      };
    },
  },
  {
    // A half picture in a pictograph (4.16).
    id: "g35-4-pictograph-half",
    strand: "DP", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.16",
    fill(rng) {
      const k = rng.pick([2, 4, 6, 10]), n = rng.int(2, 7);
      const name = rng.pick(NAMES);
      const answer = k * n + k / 2;
      return {
        values: { k, n },
        prompt: `In a pictograph of books read, each picture stands for ${k} books. ${name}'s row has ${n} whole pictures and a half picture. How many books did ${name} read?`,
        readAloud: `In a pictograph of books read, each picture stands for ${k} books. ${name}'s row has ${n} whole pictures and a half picture. How many books did ${name} read?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[n + 0.5, "D1"], [k * n, "one-part"], [k * (n + 1), "half-symbol"]]),
      };
    },
  },
  {
    // A bar graph with a scale (4.16: many-to-one).
    id: "g35-4-bar-scale",
    strand: "DP", grades: { BC: 4, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "4.16",
    fill(rng) {
      const k = 2, a = rng.int(7, 12), b = draw(rng, (r) => r.int(2, 7), (b) => b < a);
      const [x, y] = rng.shuffle(["apples", "pears", "grapes", "bananas"]);
      return {
        values: { k, a, b },
        figure: { kind: "bars", bars: [{ label: x, value: a * k }, { label: y, value: b * k }] },
        prompt: `The graph shows children who chose fruit. How many more chose ${x} than ${y}?`,
        readAloud: `The graph shows ${a * k} children who chose ${x} and ${b * k} who chose ${y}. How many more chose ${x} than ${y}?`,
        answer: String(k * (a - b)),
        wrong: typedWrong(k * (a - b), [[a - b, "D1"], [k * a, "graph-value"]]),
      };
    },
  },
  {
    // Predict the results of spins (4.17: "predict single outcomes"). WNCP's probability experiments are grade 6,
    // and AB and ON are unsure, so the others get 6.
    id: "g35-4-spin-predict",
    strand: "DP", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.18",
    fill(rng) {
      const [parts, red] = rng.pick([[4, 3], [4, 1], [5, 4], [5, 1], [10, 7], [10, 3], [8, 6], [8, 2]] as const);
      const spins = parts * rng.int(4, 10);
      const answer = (spins * red) / parts;
      return {
        values: { parts, red, spins },
        prompt: `A spinner has ${parts} equal parts: ${red} ${red === 1 ? "part is" : "parts are"} red and the rest are blue. You spin it ${spins} times. About how many times will it land on red?`,
        readAloud: `A spinner has ${parts} equal parts: ${red} ${red === 1 ? "part is" : "parts are"} red and the rest are blue. You spin it ${spins} times. About how many times will it land on red?`,
        answer: `About ${answer}`,
        wrong: [
          wrong(`About ${spins - answer}`, "probability-other"),
          wrong(`About ${spins / 2}`, "D3"),
          wrong(`About ${spins}`, "sure-of-possible"),
        ],
      };
    },
  },
];
