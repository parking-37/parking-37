// Genera icon-180/192/512.png a partir de icon.svg. El de 180 (iOS) sin esquinas redondeadas.
// Uso: node iconos.mjs ..   (desde web/herramientas)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, dir] = process.argv;
const original = readFileSync(`${dir}/icon.svg`, "utf8");
const b = await chromium.launch();
for (const n of [180, 192, 512]) {
  const p = await b.newPage({ viewport: { width: n, height: n } });
  const svg = n === 180 ? original.replace(`rx="112"`, `rx="0"`) : original;
  await p.setContent(`<style>*{margin:0}svg{display:block;width:${n}px;height:${n}px}</style>${svg}`);
  await p.screenshot({ path: `${dir}/icon-${n}.png`, omitBackground: true });
}
await b.close();
