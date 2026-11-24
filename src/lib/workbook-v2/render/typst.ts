// The only module that calls Typst, behind the `Renderer` interface. It is not pure: it reads files, writes a new private
// folder and starts a program. None of that reaches the result: the same pages, program, drawing file and fonts give the
// same bytes. The drawing file and the fonts are read and checked once; each drawing uses that copy and nothing else.
import { execFile } from "node:child_process";
import { access, chmod, constants, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { IMAGE_PIXELS_PER_INCH, type DrawnText, type PageModel, type Position } from "../contract";
import { sha256 } from "../hash";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { isRecord } from "../shapes/shape";
import { PINS, type Pins } from "./pins";

const TIME_LIMIT_MS = 60_000;
const OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;
const EXECUTABLE_MODE = 0o755;

export interface RenderAssets {
  /** The installed Typst program. */
  program: string;
  /** The computer that the program is for, as Typst names it. */
  target: string;
  fontsDir: string;
  /** The drawing file. */
  template: string;
  /** Copy verified program bytes into each render's private temp folder when the program is not executable. */
  copyIfNotExecutable?: boolean;
}

export interface OpenRendererOptions {
  timeoutMs?: number;
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

/** Everything that draws a book. The program stays in its place, because it is large; the rest is held here. */
interface DrawingKit {
  pins: Pins;
  /** The full path, which no working folder changes. */
  program: string;
  programSha256: string;
  copyIfNotExecutable: boolean;
  template: Uint8Array;
  fonts: readonly { file: string; bytes: Uint8Array }[];
}

interface CheckedProgram {
  sha256: string;
  stageBytes: Uint8Array | null;
}

async function checkProgram(
  program: string,
  hash: string | undefined,
  version: string,
  target: string,
  copyIfNotExecutable: boolean,
): Promise<CheckedProgram> {
  const bytes = await readFile(program).catch(() => null);
  if (!bytes) throw new RenderError(`Typst ${version} is not at ${program}. Run "npm run typst:install" once.`);
  if (hash === undefined || sha256(bytes) !== hash) throw new RenderError(`The program ${program} is not the pinned Typst ${version} for ${target}.`);
  const executable = await access(program, constants.X_OK).then(() => true, () => false);
  if (!executable) {
    if (!copyIfNotExecutable) throw new RenderError(`The program ${program} may not run. Run "npm run typst:install" once.`);
    return { sha256: hash, stageBytes: bytes };
  }
  return { sha256: hash, stageBytes: null };
}

async function readFonts(fontsDir: string, pins: Pins): Promise<DrawingKit["fonts"]> {
  const fonts: { file: string; bytes: Uint8Array }[] = [];
  for (const [file, hash] of Object.entries(pins.fonts)) {
    const bytes = await readFile(join(fontsDir, file)).catch(() => null);
    if (!bytes) throw new RenderError(`The font ${file} is not in ${fontsDir}.`);
    if (sha256(bytes) !== hash) throw new RenderError(`The font ${file} is not the pinned file.`);
    fonts.push({ file, bytes });
  }
  return fonts;
}

async function readKit(assets: RenderAssets, pins: Pins): Promise<DrawingKit> {
  const program = resolve(assets.program);
  const copyIfNotExecutable = assets.copyIfNotExecutable === true;
  const checked = await checkProgram(program, pins.targets[assets.target]?.programSha256, pins.version, assets.target, copyIfNotExecutable);
  const template = await readFile(assets.template).catch(() => null);
  if (!template) throw new RenderError(`The drawing file ${assets.template} is not there.`);
  return { pins, program, programSha256: checked.sha256, copyIfNotExecutable, template, fonts: await readFonts(assets.fontsDir, pins) };
}

/** Runs Typst with no environment of the computer, so that no setting reaches it. Any warning is a failure. */
function typst(program: string, folder: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((done, fail) => {
    execFile(program, args, { cwd: folder, env: { NODE_ENV: "production" }, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: OUTPUT_LIMIT_BYTES }, (error, stdout, stderr) => {
      if (error || stderr.trim() !== "") fail(new RenderError(`Typst reported: ${stderr.trim() || error?.message || "nothing"}`));
      else done(stdout);
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

async function draw(
  { pins, program, template, fonts: fontFiles }: DrawingKit,
  folder: string,
  pages: readonly PageModel[],
  stageBytes: Uint8Array | null,
  timeoutMs: number,
): Promise<Rendering> {
  let executable = program;
  if (stageBytes) {
    executable = join(folder, "typst");
    await writeFile(executable, stageBytes, { mode: EXECUTABLE_MODE });
    await chmod(executable, EXECUTABLE_MODE);
  }
  await writeFile(join(folder, "page.typ"), template);
  await writeFile(join(folder, "pages.json"), JSON.stringify({ typst: pins.version, pages }));
  await mkdir(join(folder, "fonts"));
  for (const { file, bytes } of fontFiles) await writeFile(join(folder, "fonts", file), bytes);
  const fonts = ["--ignore-system-fonts", "--ignore-embedded-fonts", "--font-path", "fonts"];
  const still = [...fonts, "--creation-timestamp", "0"];
  const runs = await Promise.allSettled([
    typst(executable, folder, ["compile", ...still, "page.typ", "book.pdf"], timeoutMs),
    typst(executable, folder, ["compile", ...still, "--ppi", String(IMAGE_PIXELS_PER_INCH), "page.typ", "page-{p}.png"], timeoutMs),
    typst(executable, folder, ["eval", ...fonts, REPORT, "--in", "page.typ"], timeoutMs),
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

/** Checks the program and the fonts against their pins, reads the drawing file, and gives the renderer that uses them. */
export async function openRenderer(assets: RenderAssets, pins: Pins = PINS, options: OpenRendererOptions = {}): Promise<Renderer> {
  const timeoutMs = options.timeoutMs ?? TIME_LIMIT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RenderError("The render timeout must be a positive number.");
  const kit = await readKit(assets, pins);
  return {
    identity: { typst: pins.version, program: kit.programSha256, template: sha256(kit.template), fonts: { ...pins.fonts } },
    async render(pages) {
      if (pages.length === 0) throw new RenderError("There is no page to draw.");
      // Another program in its place since the check would draw a book that its record does not name.
      const checked = await checkProgram(kit.program, kit.programSha256, pins.version, assets.target, kit.copyIfNotExecutable);
      const folder = await mkdtemp(join(tmpdir(), "workbook-v2-"));
      try {
        return await draw(kit, folder, pages, checked.stageBytes, timeoutMs);
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  };
}
