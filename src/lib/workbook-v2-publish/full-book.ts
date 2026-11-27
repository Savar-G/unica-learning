// A full-size invented book for the v2 publish path (UNI-141): a Level 3 snapshot of seven sheets, written here as
// TypeScript data, and the plan of a book of 60 sheets (120 pages, 10 days of 6 sheets) with about 2,000 questions. All
// content is invented. App code may not name the engine's data files (scripts/engine-guard.mjs, engine-asset-use), so the
// rows are written out here; validateSnapshot checks them like any other snapshot.

import type { QueueReason } from "@/lib/workbook-v2/assemble/position";

/** One sheet of a book plan. The first sheet of each day starts it, so its front page has the time log. */
export interface PlannedBookSheet { sheetId: string; attempt: number; startsDay: boolean; day: number; reason?: QueueReason }

/** The invented Level 3 snapshot: facts, brackets, columns, bar models and word problems with the CA and US packs. */
export const FULL_BOOK_SNAPSHOT = {
  format: 1,
  id: "invented-full-level-3-v1",
  level: { id: "level-3", name: "3" },
  defaultRegion: "CA",
  regionPacks: [
    {"id": "CA", "units": {"length": {"one": "centimetre", "many": "centimetres"}, "volume": {"one": "litre", "many": "litres"}, "money": {"one": "dollar", "many": "dollars"}, "cent": {"one": "cent", "many": "cents"}}, "coins": {"rounding": "nearest-5-cents", "list": [{"id": "loonie", "one": "loonie", "many": "loonies", "cents": 100}, {"id": "toonie", "one": "toonie", "many": "toonies", "cents": 200}, {"id": "quarter", "one": "quarter", "many": "quarters", "cents": 25}, {"id": "dime", "one": "dime", "many": "dimes", "cents": 10}, {"id": "nickel", "one": "nickel", "many": "nickels", "cents": 5}]}, "spelling": {"colour": "colour", "metre": "metre", "litre": "litre", "favourite": "favourite"}},
    {"id": "US", "units": {"length": {"one": "inch", "many": "inches"}, "volume": {"one": "quart", "many": "quarts"}, "money": {"one": "dollar", "many": "dollars"}, "cent": {"one": "cent", "many": "cents"}}, "coins": {"rounding": "none", "list": [{"id": "dollar", "one": "dollar coin", "many": "dollar coins", "cents": 100}, {"id": "quarter", "one": "quarter", "many": "quarters", "cents": 25}, {"id": "dime", "one": "dime", "many": "dimes", "cents": 10}, {"id": "nickel", "one": "nickel", "many": "nickels", "cents": 5}, {"id": "penny", "one": "penny", "many": "pennies", "cents": 1}]}, "spelling": {"colour": "color", "metre": "meter", "litre": "liter", "favourite": "favorite"}},
  ],
  scenarios: [
    {"id": "bakery-boxes", "interest": "default", "kind": "groups", "place": "bakery", "container": {"one": "box", "many": "boxes"}, "thing": {"one": "muffin", "many": "muffins"}, "verb": "packs", "unit": {"one": "muffin", "many": "muffins"}, "quantityLimits": {"groups": {"min": 2, "max": 9}, "each": {"min": 2, "max": 12}, "taken": {"min": 2, "max": 4}}},
    {"id": "station-crates", "interest": "space", "kind": "groups", "place": "space station", "container": {"one": "crate", "many": "crates"}, "thing": {"one": "moon rock", "many": "moon rocks"}, "verb": "loads", "unit": {"one": "moon rock", "many": "moon rocks"}, "quantityLimits": {"groups": {"min": 2, "max": 6}, "each": {"min": 2, "max": 10}, "taken": {"min": 2, "max": 4}}},
    {"id": "class-stickers", "interest": "default", "kind": "share", "place": "classroom", "container": {"one": "sheet", "many": "sheets"}, "thing": {"one": "sticker", "many": "stickers"}, "verb": "shares", "unit": {"one": "sticker", "many": "stickers"}, "quantityLimits": {"count": {"min": 4, "max": 40}}},
    {"id": "rocket-snacks", "interest": "space", "kind": "share", "place": "rocket", "container": {"one": "pouch", "many": "pouches"}, "thing": {"one": "snack bar", "many": "snack bars"}, "verb": "packs", "unit": {"one": "snack bar", "many": "snack bars"}, "quantityLimits": {"count": {"min": 4, "max": 30}}},
    {"id": "craft-ribbon", "interest": "default", "kind": "measure", "place": "craft table", "container": {"one": "spool", "many": "spools"}, "thing": {"one": "ribbon", "many": "ribbons"}, "verb": "cuts", "unit": {"one": "ribbon", "many": "ribbons"}, "quantityLimits": {"length": {"min": 25, "max": 90}, "cut": {"min": 5, "max": 19}}},
    {"id": "picnic-juice", "interest": "default", "kind": "pour", "place": "picnic", "container": {"one": "jug", "many": "jugs"}, "thing": {"one": "cup", "many": "cups"}, "verb": "pours", "unit": {"one": "cup", "many": "cups"}, "quantityLimits": {"jugs": {"min": 2, "max": 5}, "size": {"min": 3, "max": 4}, "drunk": {"min": 2, "max": 4}}},
    {"id": "piggy-bank", "interest": "default", "kind": "coins", "place": "toy shop", "container": {"one": "jar", "many": "jars"}, "thing": {"one": "coin", "many": "coins"}, "verb": "saves", "unit": {"one": "coin", "many": "coins"}, "quantityLimits": {"count": {"min": 2, "max": 9}}},
  ],
  questions: [
    {"id": "muffin-boxes", "scenarioKind": "groups", "slots": {"groups": {"min": 2, "max": 9}, "each": {"min": 2, "max": 12}}, "unit": "[unit]", "solver": {"op": "×", "left": {"slot": "groups"}, "right": {"slot": "each"}}, "difficulty": 1, "phrasings": [{"id": "packs", "tokens": [{"word": "The"}, {"word": "[place]"}, {"word": "[verb]"}, {"word": "[groups]"}, {"word": "[containers]"}, {"word": "with"}, {"word": "[each]"}, {"word": "[things]"}, {"word": "in"}, {"word": "each."}, {"word": "How"}, {"word": "many"}, {"word": "[things]"}, {"word": "is"}, {"word": "that?"}]}, {"id": "holds", "tokens": [{"word": "There"}, {"word": "are"}, {"word": "[groups]"}, {"word": "[containers]"}, {"word": "at"}, {"word": "the"}, {"word": "[place]."}, {"word": "Each"}, {"word": "one"}, {"word": "holds"}, {"word": "[each]"}, {"word": "[things]."}, {"word": "How"}, {"word": "many"}, {"word": "[things]"}, {"word": "are"}, {"word": "there"}, {"word": "in"}, {"word": "all?"}]}]},
    {"id": "half-of-them", "scenarioKind": "share", "slots": {"count": {"min": 4, "max": 40, "multipleOf": 2}}, "unit": "[unit]", "solver": {"op": "×", "left": {"fraction": [1, 2]}, "right": {"slot": "count"}}, "difficulty": 2, "phrasings": [{"id": "takes", "tokens": [{"word": "There"}, {"word": "are"}, {"word": "[count]"}, {"word": "[things]"}, {"word": "in"}, {"word": "the"}, {"word": "[place]."}, {"word": "Ana"}, {"word": "takes"}, {"math": "½"}, {"word": "of"}, {"word": "them."}, {"word": "How"}, {"word": "many"}, {"word": "[things]"}, {"word": "does"}, {"word": "Ana"}, {"word": "take?"}]}, {"id": "gives", "tokens": [{"word": "Ana"}, {"word": "has"}, {"word": "[count]"}, {"word": "[things]."}, {"word": "She"}, {"word": "gives"}, {"math": "½"}, {"word": "of"}, {"word": "the"}, {"word": "[things]"}, {"word": "to"}, {"word": "a"}, {"word": "friend."}, {"word": "How"}, {"word": "many"}, {"word": "[things]"}, {"word": "does"}, {"word": "she"}, {"word": "give"}, {"word": "away?"}]}]},
    {"id": "ribbon-cut", "scenarioKind": "measure", "slots": {"length": {"min": 25, "max": 90}, "cut": {"min": 5, "max": 19}}, "unit": "[unit.length]", "solver": {"op": "-", "left": {"slot": "length"}, "right": {"slot": "cut"}}, "difficulty": 2, "phrasings": [{"id": "cuts", "tokens": [{"word": "Sam"}, {"word": "has"}, {"word": "a"}, {"word": "[spell.colour]ful"}, {"word": "ribbon"}, {"word": "that"}, {"word": "is"}, {"word": "[length]"}, {"word": "[units.length]"}, {"word": "long."}, {"word": "Sam"}, {"word": "cuts"}, {"word": "off"}, {"word": "[cut]"}, {"word": "[units.length]."}, {"word": "How"}, {"word": "long"}, {"word": "is"}, {"word": "the"}, {"word": "ribbon"}, {"word": "now?"}]}, {"id": "bow", "tokens": [{"word": "A"}, {"word": "ribbon"}, {"word": "at"}, {"word": "the"}, {"word": "[place]"}, {"word": "is"}, {"word": "[length]"}, {"word": "[units.length]"}, {"word": "long."}, {"word": "A"}, {"word": "bow"}, {"word": "uses"}, {"word": "[cut]"}, {"word": "[units.length]"}, {"word": "of"}, {"word": "it."}, {"word": "How"}, {"word": "much"}, {"word": "ribbon"}, {"word": "is"}, {"word": "left?"}]}]},
    {"id": "muffins-left", "scenarioKind": "groups", "slots": {"groups": {"min": 3, "max": 6}, "each": {"min": 2, "max": 10}, "taken": {"min": 2, "max": 4}}, "unit": "[unit]", "solver": {"op": "-", "left": {"op": "×", "left": {"slot": "groups"}, "right": {"slot": "each"}}, "right": {"slot": "taken"}}, "difficulty": 3, "phrasings": [{"id": "given", "tokens": [{"word": "The"}, {"word": "[place]"}, {"word": "[verb]"}, {"word": "[groups]"}, {"word": "[containers]"}, {"word": "with"}, {"word": "[each]"}, {"word": "[things]"}, {"word": "in"}, {"word": "each."}, {"word": "Then"}, {"word": "[taken]"}, {"word": "[things]"}, {"word": "are"}, {"word": "given"}, {"word": "away."}, {"word": "How"}, {"word": "many"}, {"word": "[things]"}, {"word": "are"}, {"word": "left?"}]}, {"id": "home", "tokens": [{"word": "There"}, {"word": "are"}, {"word": "[groups]"}, {"word": "[containers]"}, {"word": "of"}, {"word": "[each]"}, {"word": "[things]"}, {"word": "at"}, {"word": "the"}, {"word": "[place]."}, {"word": "Lee"}, {"word": "takes"}, {"word": "[taken]"}, {"word": "[things]"}, {"word": "home."}, {"word": "How"}, {"word": "many"}, {"word": "[things]"}, {"word": "are"}, {"word": "still"}, {"word": "there?"}]}]},
    {"id": "juice-left", "scenarioKind": "pour", "slots": {"jugs": {"min": 2, "max": 5}, "size": {"min": 3, "max": 4}, "drunk": {"min": 2, "max": 4}}, "unit": "[unit.volume]", "solver": {"op": "-", "left": {"op": "×", "left": {"slot": "jugs"}, "right": {"slot": "size"}}, "right": {"slot": "drunk"}}, "difficulty": 3, "phrasings": [{"id": "fills", "tokens": [{"word": "Each"}, {"word": "[container]"}, {"word": "holds"}, {"word": "[size]"}, {"word": "[units.volume]"}, {"word": "of"}, {"word": "juice."}, {"word": "Mo"}, {"word": "fills"}, {"word": "[jugs]"}, {"word": "[containers]"}, {"word": "for"}, {"word": "the"}, {"word": "[place]."}, {"word": "The"}, {"word": "family"}, {"word": "drinks"}, {"word": "[drunk]"}, {"word": "[units.volume]."}, {"word": "How"}, {"word": "much"}, {"word": "juice"}, {"word": "is"}, {"word": "left?"}]}, {"id": "spills", "tokens": [{"word": "Mo"}, {"word": "pours"}, {"word": "[size]"}, {"word": "[units.volume]"}, {"word": "of"}, {"word": "juice"}, {"word": "into"}, {"word": "each"}, {"word": "of"}, {"word": "[jugs]"}, {"word": "[containers]."}, {"word": "Then"}, {"word": "[drunk]"}, {"word": "[units.volume]"}, {"word": "spill"}, {"word": "on"}, {"word": "the"}, {"word": "grass."}, {"word": "How"}, {"word": "much"}, {"word": "juice"}, {"word": "is"}, {"word": "in"}, {"word": "the"}, {"word": "[containers]"}, {"word": "now?"}]}]},
    {"id": "toonie-savings", "scenarioKind": "coins", "regions": ["CA"], "slots": {"count": {"min": 2, "max": 9}}, "unit": "[unit.money]", "solver": {"op": "×", "left": {"slot": "count"}, "right": {"number": 2}}, "difficulty": 2, "phrasings": [{"id": "saves", "tokens": [{"word": "Pia"}, {"word": "saves"}, {"word": "[count]"}, {"word": "[coins.toonie]"}, {"word": "in"}, {"word": "a"}, {"word": "[container]."}, {"word": "A"}, {"word": "[coin.toonie]"}, {"word": "is"}, {"word": "worth"}, {"word": "two"}, {"word": "dollars."}, {"word": "How"}, {"word": "many"}, {"word": "dollars"}, {"word": "does"}, {"word": "Pia"}, {"word": "have?"}]}, {"id": "finds", "tokens": [{"word": "Pia"}, {"word": "finds"}, {"word": "[count]"}, {"word": "[coins.toonie]"}, {"word": "at"}, {"word": "the"}, {"word": "[place]."}, {"word": "Each"}, {"word": "[coin.toonie]"}, {"word": "is"}, {"word": "two"}, {"word": "dollars."}, {"word": "How"}, {"word": "many"}, {"word": "dollars"}, {"word": "is"}, {"word": "that?"}]}]},
    {"id": "nickels-to-pennies", "scenarioKind": "coins", "regions": ["US"], "slots": {"count": {"min": 2, "max": 9}}, "unit": "[unit.cent]", "solver": {"op": "×", "left": {"slot": "count"}, "right": {"number": 5}}, "difficulty": 2, "phrasings": [{"id": "trades", "tokens": [{"word": "A"}, {"word": "[coin.nickel]"}, {"word": "is"}, {"word": "worth"}, {"word": "five"}, {"word": "[coins.penny]."}, {"word": "Pia"}, {"word": "trades"}, {"word": "[count]"}, {"word": "[coins.nickel]"}, {"word": "for"}, {"word": "[coins.penny]."}, {"word": "How"}, {"word": "many"}, {"word": "cents"}, {"word": "does"}, {"word": "she"}, {"word": "get?"}]}, {"id": "jar", "tokens": [{"word": "Pia"}, {"word": "has"}, {"word": "[count]"}, {"word": "[coins.nickel]"}, {"word": "in"}, {"word": "a"}, {"word": "[container]."}, {"word": "Each"}, {"word": "one"}, {"word": "is"}, {"word": "worth"}, {"word": "five"}, {"word": "[coins.penny]."}, {"word": "How"}, {"word": "many"}, {"word": "cents"}, {"word": "are"}, {"word": "in"}, {"word": "the"}, {"word": "[container]?"}]}]},
  ],
  topics: [
    {"id": "topic-1", "code": "3-1", "title": "Number facts", "sheets": ["times-facts", "add-and-take-away", "division-facts"]},
    {"id": "topic-2", "code": "3-2", "title": "Dividing in brackets", "sheets": ["division-brackets"]},
    {"id": "topic-3", "code": "3-3", "title": "Multiplying 2 digits by 1 digit", "sheets": ["column-multiplication", "equal-groups", "story-problems"]},
  ],
  sheets: [
    {
      id: "times-facts", firstPage: 1,
      front: { instruction: "Multiply.", template: "facts-2x10", rows: [
        {"id": "table-of-5", "shape": "fact.mul", "items": 9, "limits": {"tables": [5], "second": {"min": 1, "max": 9}, "result": {"min": 0, "max": 100}, "order": "up"}},
        {"id": "hard-tables", "shape": "fact.mul", "items": 11, "limits": {"tables": [6, 7, 8, 9], "second": {"min": 3, "max": 9}, "result": {"min": 0, "max": 100}, "order": "mixed"}},
      ] },
      back: { instruction: "Multiply.", template: "facts-2x10", rows: [
        {"id": "table-of-4", "shape": "fact.mul", "items": 11, "limits": {"tables": [4], "second": {"min": 0, "max": 10}, "result": {"min": 0, "max": 100}, "order": "up"}},
        {"id": "up-to-9-times-9", "shape": "fact.mul", "items": 9, "limits": {"tables": [2, 3, 4, 5, 6, 7, 8, 9], "second": {"min": 2, "max": 9}, "result": {"min": 0, "max": 100}, "order": "mixed"}},
      ] },
    },
    {
      id: "add-and-take-away", firstPage: 3,
      front: { instruction: "Add.", template: "facts-2x10", rows: [
        {"id": "sums-to-10", "shape": "fact.add", "items": 11, "limits": {"tables": [1, 2, 3, 4, 5, 6, 7, 8, 9], "second": {"min": 1, "max": 9}, "result": {"min": 2, "max": 10}, "order": "mixed"}},
        {"id": "table-of-6-down", "shape": "fact.add", "items": 9, "limits": {"tables": [6], "second": {"min": 1, "max": 9}, "result": {"min": 0, "max": 20}, "order": "down"}},
      ] },
      back: { instruction: "Take away.", template: "facts-2x10", rows: [
        {"id": "from-12", "shape": "fact.sub", "items": 9, "limits": {"tables": [12], "second": {"min": 1, "max": 9}, "result": {"min": 0, "max": 20}, "order": "up"}},
        {"id": "from-11-to-18", "shape": "fact.sub", "items": 11, "limits": {"tables": [11, 12, 13, 14, 15, 16, 17, 18], "second": {"min": 2, "max": 9}, "result": {"min": 2, "max": 9}, "order": "mixed"}},
      ] },
    },
    {
      id: "division-facts", firstPage: 5,
      front: { instruction: "Divide.", template: "facts-2x10", rows: [
        {"id": "front-easy-tables", "shape": "div.fact", "items": 9, "limits": {"divisors": [2, 10], "quotient": {"min": 1, "max": 9}, "order": "mixed", "form": "line"}},
        {"id": "front-hundred", "shape": "div.fact", "items": 1, "limits": {"divisors": [10], "quotient": {"min": 10, "max": 10}, "order": "mixed", "form": "line"}},
        {"id": "front-threes-and-fours", "shape": "div.fact", "items": 10, "limits": {"divisors": [3, 4], "quotient": {"min": 1, "max": 10}, "order": "up", "form": "line"}},
      ] },
      back: { instruction: "Divide.", template: "facts-2x10", rows: [
        {"id": "back-three-digits", "shape": "div.long", "items": 20, "limits": {"dividendDigits": {"min": 3, "max": 3}, "dividend": {"min": 10, "max": 999}, "divisor": {"min": 2, "max": 9}, "quotient": {"min": 1, "max": 499}, "quotientDigits": {"min": 1, "max": 3}, "remainder": "none", "start": "either", "bringDownZero": "allowed", "zeroInside": "allowed", "zeroAtEnd": "allowed", "leftOver": {"min": 0, "max": 2}, "form": "line"}},
      ] },
    },
    {
      id: "division-brackets", firstPage: 7,
      front: { instruction: "Divide.", template: "brackets-2x6", rows: [
        {"id": "front-easy-tables", "shape": "div.fact", "items": 11, "limits": {"divisors": [2, 10], "quotient": {"min": 1, "max": 9}, "order": "mixed", "form": "bracket"}},
        {"id": "front-hundred", "shape": "div.fact", "items": 1, "limits": {"divisors": [10], "quotient": {"min": 10, "max": 10}, "order": "mixed", "form": "bracket"}},
      ] },
      back: { instruction: "Divide.", template: "brackets-2x6", rows: [
        {"id": "back-hundred", "shape": "div.fact", "items": 1, "limits": {"divisors": [10], "quotient": {"min": 10, "max": 10}, "order": "mixed", "form": "bracket"}},
        {"id": "back-hard-tables", "shape": "div.fact", "items": 11, "limits": {"divisors": [6, 7, 8, 9], "quotient": {"min": 2, "max": 9}, "order": "mixed", "form": "bracket"}},
      ] },
    },
    {
      id: "column-multiplication", firstPage: 9,
      front: { instruction: "Multiply. Start with the ones.", template: "columns-2x4", rows: [
        {"id": "no-carry", "shape": "mul.column", "items": 4, "limits": {"digits": {"min": 2, "max": 2}, "a": {"min": 11, "max": 43}, "b": {"min": 2, "max": 4}, "carries": {"min": 0, "max": 0}, "carryIntoTens": {"min": 0, "max": 0}, "carryIntoHundreds": {"min": 0, "max": 0}, "carryIntoThousands": {"min": 0, "max": 0}, "product": {"min": 10, "max": 99}, "zeroInProduct": "never", "wholeTens": "allowed"}},
        {"id": "one-carry", "shape": "mul.column", "items": 4, "limits": {"digits": {"min": 2, "max": 2}, "a": {"min": 12, "max": 49}, "b": {"min": 2, "max": 4}, "carries": {"min": 1, "max": 1}, "carryIntoTens": {"min": 0, "max": 8}, "carryIntoHundreds": {"min": 0, "max": 0}, "carryIntoThousands": {"min": 0, "max": 0}, "product": {"min": 10, "max": 99}, "zeroInProduct": "never", "wholeTens": "allowed"}},
      ] },
      back: { instruction: "Multiply. If you carry, write the number above the tens.", template: "columns-2x4", rows: [
        {"id": "one-carry-larger", "shape": "mul.column", "items": 4, "limits": {"digits": {"min": 2, "max": 2}, "a": {"min": 12, "max": 49}, "b": {"min": 2, "max": 8}, "carries": {"min": 1, "max": 1}, "carryIntoTens": {"min": 0, "max": 8}, "carryIntoHundreds": {"min": 0, "max": 0}, "carryIntoThousands": {"min": 0, "max": 0}, "product": {"min": 10, "max": 99}, "zeroInProduct": "never", "wholeTens": "allowed"}},
        {"id": "past-one-hundred", "shape": "mul.column", "items": 4, "limits": {"digits": {"min": 2, "max": 2}, "a": {"min": 21, "max": 98}, "b": {"min": 3, "max": 9}, "carries": {"min": 0, "max": 1}, "carryIntoTens": {"min": 0, "max": 8}, "carryIntoHundreds": {"min": 0, "max": 0}, "carryIntoThousands": {"min": 0, "max": 0}, "product": {"min": 100, "max": 999}, "zeroInProduct": "allowed", "wholeTens": "allowed"}},
      ] },
    },
    {
      id: "equal-groups", firstPage: 11,
      front: { instruction: "Each bar is one group. Find the total.", template: "figures-1x4", rows: [
        {"id": "two-or-three-bars", "shape": "figure.bar", "items": 2, "limits": {"groups": {"min": 2, "max": 3}, "size": {"min": 2, "max": 20}, "product": {"min": 4, "max": 60}}},
        {"id": "four-to-six-bars", "shape": "figure.bar", "items": 2, "limits": {"groups": {"min": 4, "max": 6}, "size": {"min": 2, "max": 25}, "product": {"min": 8, "max": 150}}},
      ] },
      back: { instruction: "Add the bars to find the total.", template: "figures-1x4", rows: [
        {"id": "larger-bars", "shape": "figure.bar", "items": 2, "limits": {"groups": {"min": 2, "max": 4}, "size": {"min": 10, "max": 50}, "product": {"min": 20, "max": 200}}},
        {"id": "five-or-six-bars", "shape": "figure.bar", "items": 2, "limits": {"groups": {"min": 5, "max": 6}, "size": {"min": 10, "max": 99}, "product": {"min": 50, "max": 594}}},
      ] },
    },
    {
      id: "story-problems", firstPage: 13,
      front: { instruction: "Read each story. Write the answer in the box.", template: "stories-1x3", rows: [
        {"id": "one-step", "shape": "story", "items": 3, "limits": {"questions": ["muffin-boxes", "half-of-them", "ribbon-cut"]}},
      ] },
      back: { instruction: "Use the work space. Write the answer in the box.", template: "stories-1x3", rows: [
        {"id": "two-steps", "shape": "story", "items": 3, "limits": {"questions": ["muffins-left", "juice-left", "toonie-savings", "nickels-to-pennies"]}},
      ] },
    },
  ],

} as const;

/** The sheets of a facts day, of a day with brackets and columns, and of a day of facts only. */
const FIGURE_DAY = ["facts", "facts", "facts", "facts", "equal-groups", "story-problems"] as const;
const MIXED_DAY = ["facts", "facts", "facts", "facts", "division-brackets", "column-multiplication"] as const;
const FACTS_DAY = ["facts", "facts", "facts", "facts", "facts", "facts"] as const;
/** 46 sheets of facts, 2 of brackets, 2 of columns, 5 of bar models and 5 of word problems. */
const DAYS = [FIGURE_DAY, FIGURE_DAY, FIGURE_DAY, FIGURE_DAY, FIGURE_DAY, MIXED_DAY, MIXED_DAY, FACTS_DAY, FACTS_DAY, FACTS_DAY];
const FACT_SHEETS = ["times-facts", "add-and-take-away", "division-facts"] as const;

/**
 * The book plan: 10 days of 6 sheets. The facts sheets take turns, and each new issue of a sheet is its next attempt, so
 * no sheet and attempt repeats. `sheets` keeps the first sheets of the plan only (an even count, so the pages are a
 * multiple of 4).
 */
export function fullBookPlan(sheets = 60): PlannedBookSheet[] {
  const attempts = new Map<string, number>();
  let facts = 0;
  const plan = DAYS.flatMap((kinds, d) => kinds.map((kind, i): PlannedBookSheet => {
    const sheetId = kind === "facts" ? FACT_SHEETS[facts++ % FACT_SHEETS.length] : kind;
    const attempt = (attempts.get(sheetId) ?? 0) + 1;
    attempts.set(sheetId, attempt);
    return { sheetId, attempt, startsDay: i === 0, day: d + 1, reason: attempt === 1 ? "new" : "repeat" };
  }));
  return plan.slice(0, sheets);
}
