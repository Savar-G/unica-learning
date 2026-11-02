// Sample data for round r331: the note sentences are exactly what src/lib/maya-call-note.ts writes for these facts.
window.MAYA = "../../../public/desk/maya.webp";
window.CALLS = [
  {
    id: "c3", child: "Leah", when: "Today, 4:12 p.m.", whenShort: "Today", page: 23, number: 4, question: "27 + 39 = ?", minutes: 6,
    finished: "help", chip: "Finished with help",
    sentences: ["Leah called Maya about page 23, question 4.", "Leah got stuck on adding the ones and carrying.", "Maya showed an easier example first. Then Leah finished it.", "Leah said the answer is on paper now."],
    warm: "Leah asked good questions and kept trying.",
  },
  {
    id: "c2", child: "Leah", when: "Yesterday, 5:40 p.m.", whenShort: "Yesterday", page: 22, number: 7, question: "300 − 128 = ?", minutes: 10,
    finished: "notdone", chip: "Not finished",
    sentences: ["Leah called Maya about page 22, question 7.", "Leah got stuck on taking away in the tens, where it needs borrowing.", "The call ran out of time before the question was done.", "Maya helped one step at a time."],
    warm: null,
  },
  {
    id: "c1", child: "Leah", when: "Thursday, Oct 29, 6:05 p.m.", whenShort: "Oct 29", page: 21, number: 2, question: "45 + 32 = ?", minutes: 3,
    finished: "alone", chip: "Finished alone",
    sentences: ["Leah called Maya about page 21, question 2.", "Leah finished it with no help.", "Leah said the answer is on paper now."],
    warm: "Leah stayed calm and kept going.",
  },
  {
    id: "s1", child: "Sam", when: "Today, 3:30 p.m.", whenShort: "Today", page: 9, number: 3, question: "6 × 7 = ?", minutes: 4,
    finished: "given", chip: "Maya gave the answer",
    sentences: ["Sam called Maya about page 9, question 3.", "Sam got stuck on multiplying by the ones digit.", "Maya helped step by step, then gave the answer.", "Sam said the answer is on paper now."],
    warm: "Sam listened well and worked with Maya together.",
  },
];
window.TRANSCRIPT = [
  ["maya", "0:00", "Hi Leah! I'm Maya, an AI math helper. I can see page 23, question 4: 27 + 39. Shall we get going?"],
  ["child", "0:09", "I don't know how to start."],
  ["maya", "0:12", "That's okay. First, a smaller one: 18 + 5. Watch this. Add the ones: 8 + 5 = 13. Write 3 and carry 1 ten."],
  ["maya", "0:31", "Add the tens: 1 + 1 = 2. Write 2. So 18 + 5 = 23."],
  ["child", "0:44", "Okay."],
  ["maya", "0:47", "Now yours: 27 + 39. What do the ones make? 7 + 9."],
  ["child", "1:20", "Is it 56?"],
  ["maya", "1:24", "Good try. Let's look at the ones first. What is 7 + 9?"],
  ["child", "1:51", "Can you help me?"],
  ["maya", "1:54", "Sure. Count on from 9: 10, 11, 12... up 7 more. What do you get?"],
  ["child", "2:30", "16"],
  ["maya", "2:33", "Yes, 16. Write 6 and carry 1 ten. Now the tens: 2 + 3 + 1."],
  ["child", "3:05", "66"],
  ["maya", "3:08", "That's it: 27 + 39 = 66. How did you know to carry?"],
  ["child", "3:30", "Because the ones made a ten, so I carried it."],
  ["maya", "3:34", "Exactly. Write 66 on your page, then tell me."],
  ["mark", "3:40", "Writing on paper."],
  ["child", "4:52", "I wrote it."],
  ["maya", "4:55", "Nice work, Leah! See you next time."],
];
window.noteHtml = (c) => `<div class="note-text">${c.sentences.slice(1).map((s) => `<p>${s}</p>`).join("")}${c.warm ? `<p class="warm">${c.warm}</p>` : ""}</div>`;
window.txHtml = () => `<div class="tx">${window.TRANSCRIPT.map(([w, t, s]) =>
  w === "mark" ? `<div class="line mark">${t} · ${s}</div>`
  : `<div class="line ${w === "child" ? "kid-line" : w}"><div class="who">${w === "maya" ? `<img src="${window.MAYA}" alt="">` : "L"}</div><div><div class="meta">${w === "maya" ? "Maya" : "Leah"} · ${t}</div><div class="bubble">${s}</div></div></div>`).join("")}</div>`;
