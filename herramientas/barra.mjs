// Comprueba en WebKit (iPhone 15 emulado) que el menú queda pegado abajo en las tres vistas
// tras hacer scroll en «Próxima» (fallo de Safari, ver DECISIONES.md). Necesita: npx playwright install webkit
// Uso: node barra.mjs http://127.0.0.1:8737/ /ruta/prefijo  → navAbajo debe ser igual a alto y docScroll 0.
import { webkit, devices } from 'playwright';
const [,, base, out] = process.argv;
const state = {
  version: 1, plaza: '#37 (in)',
  users: { sendoa: { github: 'kalashftw', nombre: 'Sendoa' }, mikel: { github: 'mirastorza', nombre: 'Mikel' } },
  config: { dias_laborables: ['L','M','X','J','V'], desempate_inicial: 'mikel', saldo_inicial: { sendoa: 0, mikel: 0 } },
  semanas: { '2026-W43': { prevision: { sendoa: ['L','J'], mikel: ['J'] }, ajustes: [], festivos: [] },
             '2026-W44': { prevision: { sendoa: ['L','J'], mikel: ['M','J'] }, ajustes: [], festivos: [] } },
};
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 15'] });
const page = await ctx.newPage();
await page.clock.install({ time: new Date('2026-10-22T09:00:00Z') });
page.on('pageerror', e => console.log('ERROR', e.message));
await page.route('https://api.github.com/**', r => r.request().url().endsWith('/user')
  ? r.fulfill({ json: { login: 'kalashftw' } })
  : r.fulfill({ json: { sha: '1', content: Buffer.from(JSON.stringify(state)).toString('base64') } }));
await page.goto(base);
await page.fill('#token', 'x'); await page.click('button[type=submit]'); await page.waitForSelector('.marcar');
const medir = async (n) => {
  const m = await page.evaluate(() => {
    const sc = document.getElementById('scroll');
    return { alto: innerHeight, navAbajo: Math.round(nav.getBoundingClientRect().bottom),
      docScroll: document.documentElement.scrollHeight - innerHeight, contenido: sc.scrollHeight, visible: sc.clientHeight };
  });
  console.log(n, JSON.stringify(m));
  await page.screenshot({ path: `${out}-${n}.png` });
};
// Simula el caso del fallo: scroll en Próxima y luego cambiar a vistas cortas.
await page.evaluate(() => document.getElementById('scroll').scrollTo(0, 9999));
await medir('proxima-abajo');
await page.click('nav button[data-pestana="actual"]'); await medir('actual');
await page.click('nav button[data-pestana="marcador"]'); await medir('marcador');
await b.close();
