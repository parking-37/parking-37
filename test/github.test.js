import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Almacen } from '../github.js';
import { prevision, ajuste, CambioNoValido } from '../cambios.js';
import { calcular, DIAS } from '../asignacion.js';

// Un repo falso en memoria que se comporta como la API de contenidos:
// el PUT con un sha que no es el actual responde 409.
function repoFalso(inicial) {
  let sha = 0;
  let texto = JSON.stringify(inicial);
  const commits = [];
  const resp = (status, cuerpo) => ({ ok: status < 300, status, json: async () => cuerpo });
  const fetch = async (url, { method = 'GET', body } = {}) => {
    if (method === 'GET') return resp(200, { sha: String(sha), content: Buffer.from(texto).toString('base64') });
    const b = JSON.parse(body);
    if (b.sha !== String(sha)) return resp(409, {});
    texto = Buffer.from(b.content, 'base64').toString();
    sha += 1;
    commits.push(b.message);
    return resp(200, { content: { sha: String(sha) } });
  };
  return { fetch, commits, estado: () => JSON.parse(texto), escribirPorFuera: (s) => { texto = JSON.stringify(s); sha += 1; } };
}

const inicial = () => ({
  version: 1, plaza: '#37 (in)',
  users: { sendoa: { github: 'kalashftw', nombre: 'Sendoa' }, mikel: { github: 'mirastorza', nombre: 'Mikel' } },
  config: { dias_laborables: DIAS, desempate_inicial: 'mikel', saldo_inicial: { sendoa: 0, mikel: 0 } },
  semanas: {},
});
const hoy = '2026-10-22';

test('dos guardados a la vez desde estados viejos: no se pierde ninguno', async () => {
  const repo = repoFalso(inicial());
  const a = new Almacen({ token: 't', owner: 'o', repo: 'r', fetch: repo.fetch });
  const b = new Almacen({ token: 't', owner: 'o', repo: 'r', fetch: repo.fetch });
  const leidoA = await a.leer();
  const leidoB = await b.leer();

  const ca = prevision({ yo: 'sendoa', semana: '2026-W44', dias: ['J', 'L', 'M'], hoy });
  const cb = prevision({ yo: 'mikel', semana: '2026-W44', dias: ['M', 'X'], hoy });
  await a.guardar(ca.mutar, ca.mensaje, leidoA);
  await b.guardar(cb.mutar, cb.mensaje, leidoB); // choca, relee y reaplica

  assert.deepEqual(repo.estado().semanas['2026-W44'].prevision, { sendoa: ['L', 'M', 'J'], mikel: ['M', 'X'] });
  assert.deepEqual(repo.commits, ['sendoa: previsión 2026-W44 (L,M,J)', 'mikel: previsión 2026-W44 (M,X)']);
});

test('si vuelve a chocar tras releer, se rinde y no escribe', async () => {
  const repo = repoFalso(inicial());
  const fetchConCarrera = async (url, opts = {}) => {
    // Cada vez que alguien lee, otro escribe justo después.
    const r = await repo.fetch(url, opts);
    if ((opts.method ?? 'GET') === 'GET') repo.escribirPorFuera(repo.estado());
    return r;
  };
  const a = new Almacen({ token: 't', owner: 'o', repo: 'r', fetch: fetchConCarrera });
  const c = prevision({ yo: 'sendoa', semana: '2026-W44', dias: ['L'], hoy });
  await assert.rejects(a.guardar(c.mutar, c.mensaje), (e) => e.estado === 409);
  assert.deepEqual(repo.commits, []);
});

test('la reaplicación respeta el estado nuevo: no se cede dos veces el mismo día', async () => {
  const s = inicial();
  s.semanas['2026-W43'] = { prevision: { sendoa: ['V'], mikel: ['V'] }, ajustes: [], festivos: [] };
  const repo = repoFalso(s);
  const a = new Almacen({ token: 't', owner: 'o', repo: 'r', fetch: repo.fetch });
  assert.equal(calcular(s).semanas['2026-W43'].dias.V.asignado, 'mikel');

  const viejo = await a.leer();
  const ceder = ajuste({ yo: 'mikel', otro: 'sendoa', semana: '2026-W43', dia: 'V', tipo: 'cesion', hoy, ts: '2026-10-22T10:00:00Z' });
  await a.guardar(ceder.mutar, ceder.mensaje);
  await assert.rejects(a.guardar(ceder.mutar, ceder.mensaje, viejo), CambioNoValido);
  assert.equal(repo.estado().semanas['2026-W43'].ajustes.length, 1);
  assert.equal(calcular(repo.estado()).semanas['2026-W43'].dias.V.asignado, 'sendoa');
});

test('solo se cede un día con solape', () => {
  const s = inicial();
  s.semanas['2026-W43'] = { prevision: { sendoa: ['J', 'V'], mikel: ['V'] }, ajustes: [], festivos: [] };
  assert.throws(() => ajuste({ yo: 'sendoa', otro: 'mikel', semana: '2026-W43', dia: 'J', tipo: 'cesion', hoy }).mutar(s), /pedís los dos/);
  assert.doesNotThrow(() => ajuste({ yo: 'sendoa', otro: 'mikel', semana: '2026-W43', dia: 'J', tipo: 'cancelacion', hoy }).mutar(structuredClone(s)));
});

test('fuera de plazo: ni previsión de la semana en curso ni ajustes de días pasados', () => {
  const s = inicial();
  assert.throws(() => prevision({ yo: 'sendoa', semana: '2026-W43', dias: ['V'], hoy }).mutar(s), CambioNoValido);
  assert.doesNotThrow(() => prevision({ yo: 'sendoa', semana: '2026-W44', dias: ['V'], hoy }).mutar(s));
  s.semanas['2026-W43'] = { prevision: { sendoa: ['M'] }, ajustes: [], festivos: [] };
  assert.throws(() => ajuste({ yo: 'sendoa', otro: 'mikel', semana: '2026-W43', dia: 'M', tipo: 'cancelacion', hoy }).mutar(s), CambioNoValido);
});

test('el texto con tildes sobrevive al viaje en base64', async () => {
  const s = inicial();
  s.plaza = 'Plaza nº 37 — señalización';
  const repo = repoFalso(s);
  const a = new Almacen({ token: 't', owner: 'o', repo: 'r', fetch: repo.fetch });
  const c = prevision({ yo: 'sendoa', semana: '2026-W44', dias: ['L'], hoy });
  const { state } = await a.guardar(c.mutar, c.mensaje);
  assert.equal(state.plaza, 'Plaza nº 37 — señalización');
  assert.equal(repo.estado().plaza, 'Plaza nº 37 — señalización');
});
