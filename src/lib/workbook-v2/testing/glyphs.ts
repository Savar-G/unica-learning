// Reads which characters a font file holds (the format 4 table of its character map), for tests.
export function characterCodes(font: Buffer): Set<number> {
  const tables = font.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < tables; i++) if (font.toString("latin1", 12 + i * 16, 16 + i * 16) === "cmap") cmap = font.readUInt32BE(20 + i * 16);
  if (cmap < 0) throw new Error("the font has no character map");
  const codes = new Set<number>();
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const at = cmap + font.readUInt32BE(cmap + 8 + i * 8);
    if (font.readUInt16BE(at) !== 4) continue;
    const segments = font.readUInt16BE(at + 6) / 2;
    for (let s = 0; s < segments; s++) {
      const end = font.readUInt16BE(at + 14 + s * 2);
      const start = font.readUInt16BE(at + 16 + segments * 2 + s * 2);
      for (let code = start; code <= end && code !== 0xffff; code++) codes.add(code);
    }
  }
  return codes;
}
