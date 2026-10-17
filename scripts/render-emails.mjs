// Render real email functions without sending mail. Usage: node scripts/render-emails.mjs OUTPUT_DIRECTORY
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = process.argv[2];
if (!output) throw new Error("Pass an output directory. No email is sent.");
const bundled = await build({
  stdin: { contents: `
    export { reminderEmail } from './src/lib/reminder-email';
    export { reportEmail } from './src/lib/report-email';
    export { linkEmail } from './src/lib/sign-in-link';
    export { AUTH_EMAIL_KINDS, authEmail } from './src/lib/auth-email';
    export { reportModel } from './src/lib/assessment';
    export { knowsUpTo, takeTest } from './src/lib/assessment/scripted-child';
  `, resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm", tsconfig: "tsconfig.json",
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const common = {
  parentName: "Priya Shah", childName: "Asha", postal: "V4N 5B2", total: 24,
  url: "https://unicalearning.com/account/start/sample?reminder=start",
  unsubscribeUrl: "https://unicalearning.com/unsubscribe?t=sample-token",
};
const samples = {};
for (const kind of ["continue", "come_back", "start", "start_followup"]) {
  samples[`reminder-${kind}`] = api.reminderEmail({ ...common, url: common.url.replace("reminder=start", `reminder=${kind}`), kind, answered: 8, resumeUntil: Date.parse("2026-10-19T19:00:00Z") });
}
samples["sign-in-link"] = api.linkEmail({ ...common, url: "https://unicalearning.com/sign-in/link?t=sample-token" });
for (const province of ["BC", "ON"]) {
  const { placement } = api.takeTest({ grade: 4, province }, 1, api.knowsUpTo(3));
  const view = {
    id: "sample-report", childName: "Asha", province, completedAt: "2026-10-17T19:30:00Z", questions: 36, minutes: 34,
    model: api.reportModel(placement, { completedTestsInGrade: 0, workReviews: [] }),
  };
  for (const offer of [true, false]) {
    samples[`report-${province}-${offer ? "offer" : "quiet"}`] = api.reportEmail({ view, parentName: common.parentName, url: "https://unicalearning.com/account/report/sample?src=email", unsubscribeUrl: common.unsubscribeUrl, offer });
  }
}
for (const kind of api.AUTH_EMAIL_KINDS) samples[kind] = api.authEmail(kind);
await mkdir(output, { recursive: true });
for (const [name, email] of Object.entries(samples)) await writeFile(resolve(output, `${name}.html`), email.html);
await writeFile(resolve(output, "index.html"), `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email previews</title></head><body style="font:16px/1.7 Arial"><h1>Email previews</h1><p>Sample data. No email was sent. Auth fields remain literal.</p><ul>${Object.entries(samples).map(([name, e]) => `<li><a href="${name}.html">${name}</a>: ${e.subject}</li>`).join("")}</ul></body></html>`);
console.log(JSON.stringify({ output: resolve(output), templates: Object.keys(samples) }));
