// Same content in every option. Photos: real where we have them, labelled placeholders where a real photo is still to come.
const IMG = "img/";
window.STEPS = [
  { n: "01", t: "Assess", d: "We send a free placement assessment on paper. It finds your child's level, strengths, gaps and misconceptions.", img: IMG + "loop-assess-paper.jpg" },
  { n: "02", t: "Deliver", d: "We create and mail a physical workbook personalized to what your child needs to work on.", ph: "Real photo to come: a plain parcel at the door" },
  { n: "03", t: "Practice", d: "Your child spends roughly 15-20 minutes a day working on paper.", img: IMG + "loop-practice-6.jpg" },
  { n: "04", t: "Scan", d: "You take a photo of the completed pages with your phone.", ph: "Real photo to come: a parent photographs a worksheet" },
  { n: "05", t: "Adapt", d: "Our system checks your child's answers and updates their learning profile.", ph: "Real photo to come: a parent checks a page with a pen" },
  { n: "06", t: "Repeat", d: "The next workbook is built from what your child mastered, struggled with or needs to review. It arrives before the current one runs out.", ph: "Real photo to come: a child opens the next book" },
];
window.media = (s) => s.img ? `<div class="ph"><img src="${s.img}" alt=""></div>` : `<div class="ph">${s.ph}</div>`;
window.card = (s, extra = "") => `<div class="card" data-n="${s.n}" ${extra}><span class="n">${s.n}</span><h3>${s.t}.</h3><p>${s.d}</p>${media(s)}</div>`;
window.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
