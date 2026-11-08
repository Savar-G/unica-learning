// Clock times in a child's turn, for a clock-time question (time-add, Maya coverage Wave C, C3c): "What time is 50
// minutes after 6:13?". Read only in exact forms, as an allow-list over each phrase (lessons from review 6): a typed
// time ("6:53", "7:03", "12:05", "08:35"), or an hour word one to twelve followed at once by its minutes in words: "oh" and a
// digit word ("seven oh three"), a teen ("six fifteen"), a tens word with or without a digit word ("nine forty", "six
// fifty-three", "six fifty three"), or "o'clock" ("seven o'clock"). Anything else stays numbers: "seven three",
// "half past six", "6 fifty", "7.03" and "703" are not times. Code reads them only in a clock-time call
// (ReadOptions.times); in any other call this text is never changed. Pure TypeScript.

const HOURS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const DIGITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty"];

const alt = (words: readonly string[]) => words.join("|");
/** A typed time, not inside a longer number: "6:53", or with a leading zero, "06:53". */
const TYPED = /(?<![\d.:,])(1[0-2]|0?[1-9]):([0-5]\d)(?![\d:]|\.\d)/g;
/** A spoken time: the hour word, then its minutes. */
const SPOKEN = new RegExp(
  `\\b(${alt(HOURS)})\\s+(?:(o['’]?\\s?clock)|oh\\s+(${alt(DIGITS)})|(${alt(TEENS)})|(${alt(TENS)})(?:[\\s-](${alt(DIGITS)}))?)\\b`,
  "gi",
);

const two = (n: number) => String(n).padStart(2, "0");

/** The minutes of a spoken time's minute words. */
function spokenMinutes(clock?: string, oh?: string, teen?: string, tens?: string, digit?: string): number {
  if (clock) return 0;
  if (oh) return DIGITS.indexOf(oh.toLowerCase()) + 1;
  if (teen) return TEENS.indexOf(teen.toLowerCase()) + 10;
  return (TENS.indexOf(tens!.toLowerCase()) + 2) * 10 + (digit ? DIGITS.indexOf(digit.toLowerCase()) + 1 : 0);
}

/**
 * The text with every time in an exact form written as its hour, `mark` and two minute digits ("7⁥03"), for the
 * number reader to read as one time. Nothing else changes.
 */
export function writtenTimes(text: string, mark: string): string {
  return text
    .replace(TYPED, (_, h: string, m: string) => `${Number(h)}${mark}${m}`)
    .replace(SPOKEN, (_, hour: string, clock?: string, oh?: string, teen?: string, tens?: string, digit?: string) =>
      `${HOURS.indexOf(hour.toLowerCase()) + 1}${mark}${two(spokenMinutes(clock, oh, teen, tens, digit))}`);
}
