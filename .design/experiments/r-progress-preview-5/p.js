// Option P's frame: the prediction on top, the variant's skills block, then the three steps of how.
window.renderP = (p, skillsHtml) => {
  const n = p.c.name;
  const books = p.books.map((b) => `<i style="--c:${gradeColor(b.grade)}" title="Workbook ${b.n}"></i>`).join("");
  const legend = p.stages.map((s) => `<span><i style="--c:${gradeColor(s.grade)}"></i>${gradeName(s.grade)}: ${monthShort(s.from)} to ${monthShort(s.to)} ${s.to.getFullYear()}</span>`).join("");
  document.getElementById("out").innerHTML = `
    <div class="head">
      <p class="k">Our prediction for ${n}</p>
      <p class="say">We predict ${n} can reach a <b>${gradeName(p.goal)} level</b> by <b>${monthYear(p.goalDate)}</b>.</p>
    </div>
    <div class="skills">${skillsHtml}</div>
    <div class="how">
      <p class="k">How we get ${n} there</p>
      <div class="do"><span class="num">1</span><b>A new workbook every 2 weeks</b><span>Printed for ${n} and mailed home. ${p.books.length} workbooks take ${n} from ${gradeName(p.c.working)} to ${gradeName(p.goal)}.</span><div class="bar">${books}</div><div class="legend">${legend}</div></div>
      <div class="do"><span class="num">2</span><b>${p.day.pages} pages a day, 5 days a week</b><span>About ${p.day.min} minutes a day, in pencil. Each day teaches one new step, then practice, review and a challenge.</span></div>
      <div class="do"><span class="num">3</span><b>Every page is marked</b><span>You scan the finished pages. We mark them, and the next workbook adds what ${n} needs and moves faster where ${n} is secure.</span></div>
    </div>
    <p class="basis">${basis(p)}</p>`;
};
