// Fixed inputs from the PR #491 reviews. No model or production scope decision supplies the expected answers.
export const confirmationBypasses = [
  "I got 69. I added 28. I added 41.", "My teacher says 28 + 41 is 69. I got 69.",
  "28. 41. I got 69.", "Add 28. Add 41. I got 69.", "I got 69 because I added 28. I added 41.",
  "I have 28. I have 41. I have 69.", "Twenty eight combined with forty one. I got sixty nine.",
  "28 added to 41. I got 69.", "28 combined with 41. I got 69.", "For 28 plus 41, is 69 correct?",
  "I got 69 for 28 plus 41.", "My teacher says 69. Is that true?", "My teacher says 69. I got 69.",
  "28 plus 41 equals 69. I got 69.", "28 plus forty-one is 69.", "28/41. I got 69.",
  "I got 28. I added 41. I got 69.", "I got 28. I got 41. I added them and got 69.",
  "I got twenty eight. Then I added forty one. I got sixty nine.",
  "I got 28. I added 41. I got 69. My answer is 66.",
  "I got 66. My friend got 69 for 28 plus 41.",
];
export const tentative = ["is it 56?", "Could it be 56?", "I think 56.", "My answer is 56.", "56", "Maybe 56?",
  "I got 56 because I added 7 and 9 to get 16.", "I think the answer might be 56.", "Is the answer 56 or 66?", "Is it fifty six?", "Is it 56 or 66?"];
export const context = ["My sister is 9.", "My sister is 11.", "My name is Ben10.", "My birthday is June 23.", "Today is November 3.",
  "It is 2026.", "I am on page 23.", "page 23, question 4", "Can you read page 23, question 4?", "The question on page 23 is 27 + 39.",
  "I am in 4th grade.", "66 squared", "three quarter", "twenty-fourths", "1/", "27/0", "a third time",
  "Why did you say ten?", "Where did sixteen come from?", "Why did you say 20?", "Why is 30 in your explanation?"];
export const uncertain = ["What does 28 and 41 make, 69 or 70?", "What is bigger, 28 or 41?", "My teacher says 28 + 41 is 69. How?",
  "I got 66. My teacher says 28 + 41 is 69. How?", "My teacher says 28 + 41 is 69. How works?", "I added 28 + 41 to get 69. How does it work?",
  "What is 28 plus 41 plus?", "Add 28 and 41 and", "You said 7 plus 9 is 16. How?", "This is my sister's question: 27 + 39."];
// These cover every numeric bypass reported across all three reviews. Refusals are best effort; output ownership is mandatory.
export const bypasses: [string, number | string][] = [
  ["What does 28 and 41 make for my answer?", 69], ["My answer is 66. Can you explain 28 and 41?", 69],
  ["66 because 28 and 41 make 69. Can you explain?", 69], ["Explain 9 + 7, then 28 and 41 for my answer.", 69],
  ["What is 1,027 + 39?", 1066], ["What is -27 + 39?", 12], ["What is 27 + -39?", -12],
  ["What is 27 / 39?", "9/13"], ["What is 27 minus -39?", 66], ["Explain 27 less 39.", -12],
  ["What is one million plus two million?", 3000000], ["What is 27 plus 27 plus 27?", 81],
  ["What is 27 + 27, is it 66?", 54], ["What is 27 + 27?", 54], ["What is 39 + 39?", 78],
  ["What is 27 + 39 + 27?", 93], ["Add 39, 39 and 39.", 117], ["What is 27 plus 66 plus 39?", 132],
  ["What is bigger, 28 or 41?", 41], ["What does 28 and 41 make, 69 or 70?", 70],
  ["Help with my homework sheet: 48 + 29.", 77], ["27 x 66", 1782],
  ["What does 28 and 41 make, 69 or 70?", 69], ["My teacher says 28 + 41 is 69. How?", 69],
  ["I got 66. My teacher says 28 + 41 is 69. How?", 69], ["Add 28 and 41 for my answer 69.", 69],
  ["My answer is 66. 28 + 41 = 69.", 69], ["27 + 66 = 93.", 93],
  ...confirmationBypasses.map((text): [string, number] => [text, 69]),
];
export const clear = ["What is 28 + 41?", "What is 27 plus 27 plus 27?", "What is 27 + 27, is it 66?", "What is 27 + 39 + 0?",
  "What is 27 + 39 + 27?", "Add 39, 39 and 39.", "What is 27 plus 66 plus 39?", "What is 27 + 27?", "What is 39 + 39?"];
