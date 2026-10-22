// Recorre la web con un GitHub simulado (datos de prueba en memoria) y saca
// capturas a 360 px: token → previsión → guardar → ceder en próxima → esta semana → «Ya no voy» → «Me la quedo» → marcador.
// Uso: node mirar.mjs http://127.0.0.1:8737/ /ruta/prefijo [light|dark]
// (servir antes web/ con: python3.12 -m http.server 8737 --bind 127.0.0.1)
// El reloj se fija al jueves 22/10/2026: si cambian los datos de prueba, cambiar también la fecha.
import { chromium } from 'playwright';
const [,, base, out, esquema = 'light'] = process.argv;
let state = {
  version: 1, plaza: '#37 (in)',
  users: { sendoa: { github: 'kalashftw', nombre: 'Sendoa' }, mikel: { github: 'mirastorza', nombre: 'Mikel' } },
  config: { dias_laborables: ['L','M','X','J','V'], desempate_inicial: 'mikel', saldo_inicial: { sendoa: 0, mikel: 0 } },
  semanas: {
    '2026-W42': { prevision: { sendoa: ['L','M','J'], mikel: ['M','X','J'] }, ajustes: [], festivos: [] },
    '2026-W43': { prevision: { sendoa: ['L','X','J','V'], mikel: ['M','X','V'] }, ajustes: [
      { dia: 'X', tipo: 'cesion', de: 'sendoa', a: 'mikel', por: 'sendoa', ts: '2026-10-20T07:00:00Z' }], festivos: [] },
    '2026-W44': { prevision: { mikel: ['L','J'] }, ajustes: [], festivos: [] },
  },
};
let sha = 1; const commits = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: esquema });
const page = await ctx.newPage();
await page.clock.install({ time: new Date('2026-10-22T09:00:00Z') });
page.on('pageerror', e => console.log('ERROR', e.message));
page.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
page.on('dialog', d => d.accept());
await page.route('https://api.github.com/**', async (r) => {
  const req = r.request(); const url = req.url();
  if (url.endsWith('/user')) return r.fulfill({ json: { login: 'kalashftw' } });
  if (req.method() === 'GET') return r.fulfill({ json: { sha: String(sha), content: Buffer.from(JSON.stringify(state)).toString('base64') } });
  const body = JSON.parse(req.postData());
  if (body.sha !== String(sha)) return r.fulfill({ status: 409, json: {} });
  state = JSON.parse(Buffer.from(body.content, 'base64').toString()); sha++; commits.push(body.message);
  return r.fulfill({ json: { content: { sha: String(sha) } } });
});
await page.goto(base);
await page.screenshot({ path: `${out}-0-token.png`, fullPage: true });
await page.fill('#token', 'github_pat_prueba');
await page.click('button[type=submit]');
await page.waitForSelector('.marcar');
await page.click('.marcar button[data-dia="L"]');
await page.click('.marcar button[data-dia="X"]');
await page.click('.marcar button[data-dia="J"]');
await page.screenshot({ path: `${out}-1-siguiente.png`, fullPage: true });
await page.click('button[data-accion="guardar"]');
await page.waitForSelector('text=Guardado ✓');
await page.screenshot({ path: `${out}-2-guardado.png`, fullPage: true });
const ceder = page.locator('ul.dias button[data-accion="ceder"]').first();
console.log('ceder en próxima', await ceder.getAttribute('data-dia'));
await ceder.click();
await page.waitForSelector('text=Cedida a Mikel ✓');
await page.screenshot({ path: `${out}-2b-cedida.png`, fullPage: true });
await page.click('nav button[data-pestana="actual"]');
await page.screenshot({ path: `${out}-3-actual.png`, fullPage: true });
await page.click('button[data-accion="cancelar"][data-dia="J"]');
await page.waitForSelector('text=Hecho ✓');
await page.screenshot({ path: `${out}-4-actual-tras.png`, fullPage: true });
await page.click('button[data-accion="quedar"][data-dia="J"]');
await page.waitForSelector('text=Es tuya ✓');
await page.screenshot({ path: `${out}-4b-me-la-quedo.png`, fullPage: true });
await page.click('nav button[data-pestana="marcador"]');
await page.screenshot({ path: `${out}-5-marcador.png`, fullPage: true });
console.log('commits', commits);
console.log('anchura', await page.evaluate(() => document.documentElement.scrollWidth));
await b.close();
