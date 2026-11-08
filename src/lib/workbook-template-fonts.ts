// The fixed test template's fonts (#309): Geist and Geist Mono, the design system's files (src/ds/fonts), read from
// disk so the print engine embeds them and a page looks the same on any machine. Server only.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TemplateFonts } from "@/lib/workbook-template-fixed";

export async function fixedTemplateFonts(): Promise<TemplateFonts> {
  const dir = join(process.cwd(), "src/ds/fonts");
  const [sans, mono] = await Promise.all([readFile(join(dir, "Geist.woff2")), readFile(join(dir, "GeistMono.woff2"))]);
  return { sans, mono };
}
