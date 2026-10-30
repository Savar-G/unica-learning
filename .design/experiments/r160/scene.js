// Prints Leah's plan and warm-up pages, out of focus, onto the blank book behind the phone in loop-scan-4.jpg.
const sharp = require('/Users/savargupta/Github/pagewise-landing-page/node_modules/sharp');
const root = '/Users/savargupta/Github/pagewise-landing-page/.claude/worktrees/products-page/.design';
const photo = root + '/assets/stock/loop-scan-4.jpg';
const wb = root + '/experiments/r159/assets/wb/';
const out = root + '/experiments/r160/assets/scan-photo.jpg';
(async () => {
  const left = await sharp(wb + 'leah-02-plan.jpg').resize(690).toBuffer();
  const right = await sharp(wb + 'leah-03-d1p1.jpg').resize(680).toBuffer();
  // White everywhere except the visible parts of the book (above and left of the phone), with soft edges.
  const cover = Buffer.from(`<svg width="2000" height="3000" xmlns="http://www.w3.org/2000/svg"><filter id="f"><feGaussianBlur stdDeviation="18"/></filter>
    <path filter="url(#f)" fill="#fff" fill-rule="evenodd" d="M-100,-100H2100V3100H-100Z M160,560 H1375 V790 H600 V1510 H160 Z"/></svg>`);
  const layer = await sharp({ create: { width: 2000, height: 3000, channels: 3, background: '#ffffff' } })
    .composite([{ input: left, left: 142, top: 520 }, { input: right, left: 845, top: 520 }, { input: cover }])
    .linear(0.5, 128).blur(13).png().toBuffer();
  const full = await sharp(photo).composite([{ input: layer, blend: 'multiply' }]).png().toBuffer();
  await sharp(full).extract({ left: 100, top: 380, width: 1650, height: 2320 }).resize(990).jpeg({ quality: 84 }).toFile(out);
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
