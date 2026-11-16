import sharp from "sharp";
import { fileURLToPath } from "node:url";

const questions = Array.from({ length: 17 }, (_, index) => {
  const number = index + 1, column = index < 9 ? 0 : 1, row = index < 9 ? index : index - 9;
  const left = 65 + column * 470, top = 228 + row * 120;
  return `<g><text x="${left}" y="${top + 35}" font-size="17" fill="#777">${number}.</text><text x="${left + 48}" y="${top + 47}" font-size="30" fill="#272727">17 − 8 =</text><rect x="${left + 250}" y="${top + 32}" width="100" height="60" rx="3" fill="none" stroke="#bdbdb9"/><text x="${left + 285}" y="${top + 80}" transform="rotate(-6 ${left + 285} ${top + 80})" font-family="cursive" font-style="italic" font-size="47" fill="#74726d">${number === 7 || number === 14 ? "8" : "9"}</text></g>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1414"><defs><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".4" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".035"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs><rect width="1000" height="1414" fill="#faf9f4"/><g filter="url(#paper)"><text x="65" y="88" font-family="Arial" font-size="27" font-weight="bold">Unica Learning</text><text x="65" y="142" font-family="Arial" font-size="20" fill="#777">Leah · Day 9</text><path d="M65 175H935" stroke="#dddcd7"/><text x="65" y="206" font-family="Arial" font-size="17" fill="#555">Subtract. Write the answer in each box.</text><g font-family="Arial">${questions}</g><text x="900" y="1380" font-family="Arial" font-size="18" fill="#777">67</text></g></svg>`;
await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toFile(fileURLToPath(new URL("./synthetic-photo.jpg", import.meta.url)));
