// The only module that calls Typst, behind the `Renderer` interface. It is not pure: it reads files, writes the page model to a new temporary folder and
// starts a program. None of that reaches the result: the same pages, program and fonts give the same bytes.
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DrawnText, PageModel, Position } from "../contract";
import { sha256 } from "../hash";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { isRecord } from "../shapes/shape";
import { PINS, type Pins } from "./pins";

export const IMAGE_PIXELS_PER_INCH = 150;
const TIME_LIMIT_MS = 60_000;
const OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;

export interface RenderAssets {
  /** The installed Typst program. */
  program: string;
  /** The computer that the program is for, as Typst names it. */
  target: string;
  fontsDir: string;
  /** The drawing file. */
  template: string;
}

const TARGETS: Readonly<Record<string, string>> = {
  "darwin arm64": "aarch64-apple-darwin",
  "darwin x64": "x86_64-apple-darwin",
  "linux x64": "x86_64-unknown-linux-musl",
  "linux arm64": "aarch64-unknown-linux-musl",
};

/** The name that Typst gives this kind of computer. */
export function typstTarget(platform: string, arch: string): string {
  const target = TARGETS[`${platform} ${arch}`];
  if (target === undefined) throw new RenderError(`The workbook engine has no pinned Typst for ${platform} ${arch}.`);
  return target;
}

/** Where the install script puts Typst: outside every checkout, so that all worktrees share it. */
export const typstProgram = (home: string, target: string, version: string): string => join(home, ".cache", "unica-learning", "typst", version, target, "typst");

/** The fonts and the drawing file of a checkout. */
export function drawingFiles(root: string): Pick<RenderAssets, "fontsDir" | "template"> {
  const render = join(root, "src", "lib", "workbook-v2", "render");
  return { fontsDir: join(render, "fonts"), template: join(render, "page.typ") };
}

/** The files of a checkout and the installed Typst of a computer. */
export function projectAssets(root: string, home: string, platform: string, arch: string): RenderAssets {
  const target = typstTarget(platform, arch);
  return { target, program: typstProgram(home, target, PINS.version), ...drawingFiles(root) };
}

async function checkProgram({ program, target }: RenderAssets, pins: Pins): Promise<void> {
  const bytes = await readFile(program).catch(() => null);
  if (!bytes) throw new RenderError(`Typst ${pins.version} is not at ${program}. Run "npm run typst:install" once.`);
  if (sha256(bytes) !== pins.targets[target]?.programSha256) throw new RenderError(`The program ${program} is not the pinned Typst ${pins.version} for ${target}.`);
}

async function checkFonts({ fontsDir }: RenderAssets, pins: Pins): Promise<void> {
  const files = (await readdir(fontsDir)).filter((f) => /\.(ttf|otf|ttc|otc|woff2?)$/i.test(f));
  const extra = files.find((f) => !Object.hasOwn(pins.fonts, f));
  if (extra !== undefined) throw new RenderError(`${extra} is not a pinned font.`);
  for (const [file, hash] of Object.entries(pins.fonts)) {
    if (!files.includes(file)) throw new RenderError(`The font ${file} is not in ${fontsDir}.`);
    if (sha256(await readFile(join(fontsDir, file))) !== hash) throw new RenderError(`The font ${file} is not the pinned file.`);
  }
}

/** Runs Typst with no environment of the computer, so that no setting reaches it. Any warning is a failure. */
function typst(program: string, folder: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(program, args, { cwd: folder, env: { NODE_ENV: "production" }, timeout: TIME_LIMIT_MS, killSignal: "SIGKILL", maxBuffer: OUTPUT_LIMIT_BYTES }, (error, stdout, stderr) => {
      if (error || stderr.trim() !== "") reject(new RenderError(`Typst reported: ${stderr.trim() || error?.message || "nothing"}`));
      else resolve(stdout);
    });
  });
}

const REPORT = "(positions: query(<position>).map(it => it.value), texts: query(<drawn>).map(it => it.value))";

/** What Typst says that it drew. A number that cannot be read becomes NaN, which matches no place in the model. */
function readReport(json: string): { positions: Position[]; texts: DrawnText[] } {
  const report: unknown = JSON.parse(json);
  const list = (name: string): Record<string, unknown>[] => {
    const values = isRecord(report) ? report[name] : null;
    if (!Array.isArray(values) || !values.every(isRecord)) throw new RenderError(`Typst reported ${name} that cannot be read.`);
    return values;
  };
  const number = (value: unknown) => (typeof value === "number" ? value : Number.NaN);
  return {
    positions: list("positions").map((p) => ({ id: String(p.id), sheet: number(p.sheet), rect: { x: number(p.x), y: number(p.y), w: number(p.w), h: number(p.h) } })),
    texts: list("texts").map((t) => ({ sheet: number(t.sheet), x: number(t.x), y: number(t.y), text: String(t.text) })),
  };
}

async function draw(assets: RenderAssets, pins: Pins, folder: string, pages: readonly PageModel[]): Promise<Rendering> {
  await copyFile(assets.template, join(folder, "page.typ"));
  await writeFile(join(folder, "pages.json"), JSON.stringify({ typst: pins.version, pages }));
  const fonts = ["--ignore-system-fonts", "--ignore-embedded-fonts", "--font-path", assets.fontsDir];
  const still = [...fonts, "--creation-timestamp", "0"];
  const runs = await Promise.allSettled([
    typst(assets.program, folder, ["compile", ...still, "page.typ", "book.pdf"]),
    typst(assets.program, folder, ["compile", ...still, "--ppi", String(IMAGE_PIXELS_PER_INCH), "page.typ", "page-{p}.png"]),
    typst(assets.program, folder, ["eval", ...fonts, REPORT, "--in", "page.typ"]),
  ]);
  // All three have ended here, so a failed one leaves nothing that still writes to the folder.
  const failed = runs.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
  const [, , report] = runs.map((r) => (r.status === "fulfilled" ? r.value : ""));
  const drawn = (await readdir(folder)).filter((f) => f.endsWith(".png")).length;
  if (drawn !== pages.length) throw new RenderError(`Typst drew ${drawn} pages and the book has ${pages.length}.`);
  const images = await Promise.all(pages.map((_, i) => readFile(join(folder, `page-${i + 1}.png`))));
  return { pdf: await readFile(join(folder, "book.pdf")), images, ...readReport(report) };
}

/** Checks the program and the fonts against their pins, once, and gives the renderer that uses them. */
export async function openRenderer(assets: RenderAssets, pins: Pins = PINS): Promise<Renderer> {
  await checkProgram(assets, pins);
  await checkFonts(assets, pins);
  return {
    identity: { typst: pins.version, fonts: sha256(JSON.stringify(Object.entries(pins.fonts).sort())) },
    async render(pages) {
      if (pages.length === 0) throw new RenderError("There is no page to draw.");
      const folder = await mkdtemp(join(tmpdir(), "workbook-v2-"));
      try {
        return await draw(assets, pins, folder, pages);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  };
}
