// Aside REPL test. First open a test-family draft with a completed question comment.
// Run in the persistent `aside --account u0 repl` session that holds that page.
console.log((await snapshot(page, { selector: ".wbr" })).tree);
const tagAndPin = await page.evaluate(() => {
  const tag = document.querySelector(".wbr-question.wbr-changed>span");
  const pin = document.querySelector(".wbr-pin.done");
  if (!tag || !pin) throw new Error("This test requires a completed question comment.");
  const overlaps = () => {
    const a = tag.getBoundingClientRect(), b = pin.getBoundingClientRect();
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  };
  const fixedOverlap = overlaps();
  const original = tag.getAttribute("style");
  try {
    // Negative control: the previous rule must fail on this same page.
    tag.style.left = "0";
    tag.style.right = "auto";
    const oldRuleOverlap = overlaps();
    if (fixedOverlap || !oldRuleOverlap) throw new Error(JSON.stringify({ fixedOverlap, oldRuleOverlap }));
    return { finding: "R428-8", fixedOverlap, oldRuleOverlap };
  } finally {
    if (original === null) tag.removeAttribute("style");
    else tag.setAttribute("style", original);
  }
});
console.log(tagAndPin);
