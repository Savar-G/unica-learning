// Puts the pinned Typst on a computer, once. Not part of a build or a test: `npm run typst:install` calls it.
import { execFile } from "node:child_process";
import { access, chmod, constants, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { sha256 } from "../hash";
import { RenderError } from "../renderer";
import type { Pins } from "./pins";
import { typstProgram } from "./typst";

const run = promisify(execFile);

/** Every account may run the program and only its owner may change it. */
const MODE = 0o755;

export interface InstallInput {
  home: string;
  target: string;
  pins: Pins;
  download: (url: string) => Promise<Uint8Array>;
}

/** The path of the installed program. A program with the pinned hash stays and may run; nothing unchecked ever takes its place. */
export async function installTypst({ home, target, pins, download }: InstallInput): Promise<string> {
  const pin = pins.targets[target];
  if (!pin) throw new RenderError(`The workbook engine has no pinned Typst for ${target}.`);
  const program = typstProgram(home, target, pins.version);
  const installed = await readFile(program).catch(() => null);
  if (installed && sha256(installed) === pin.programSha256) {
    await access(program, constants.X_OK).catch(() => chmod(program, MODE));
    return program;
  }

  const url = `https://github.com/typst/typst/releases/download/v${pins.version}/typst-${target}.tar.xz`;
  const archive = await download(url);
  if (sha256(archive) !== pin.archiveSha256) throw new RenderError(`The archive ${url} is not the pinned file.`);
  const place = dirname(program);
  await mkdir(dirname(place), { recursive: true });
  // Beside the final place, so that the last step is one rename on one disk.
  const work = await mkdtemp(`${place}-`);
  try {
    await writeFile(join(work, "typst.tar.xz"), archive);
    await run("tar", ["-xJf", "typst.tar.xz"], { cwd: work });
    const unpacked = join(work, `typst-${target}`, "typst");
    if (sha256(await readFile(unpacked)) !== pin.programSha256) throw new RenderError(`The program in ${url} is not the pinned Typst.`);
    await chmod(unpacked, MODE);
    await mkdir(place, { recursive: true });
    await rename(unpacked, program);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return program;
}
