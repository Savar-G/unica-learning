// "warm" is the live look (D-034). "primer" keeps the original Primer-style rules reachable for comparison.
export type Look = "primer" | "warm";

const KEEP = new Set(["BC", "Pagewise", "Unica", "Learning", "Savar", "Cedric", "I", "CAD"]);

// Primer uses Title Case headings; the warm look uses sentence case.
export function cs(look: Look, s: string): string {
  if (look === "primer") return s;
  const words = s.split(" ");
  return words
    .map((w, i) => {
      const startsSentence = i === 0 || /[.!?]$/.test(words[i - 1]);
      return startsSentence || KEEP.has(w.replace(/[^A-Za-z]/g, "")) ? w : w.toLowerCase();
    })
    .join(" ");
}
