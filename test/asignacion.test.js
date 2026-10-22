import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, semanaISO, lunesDe, fechaDe, sumarSemanas, hoyMadrid, previsionAbierta, DIAS } from '../asignacion.js';

const base = (semanas = {}, config = {}) => ({
  version: 1,
  plaza: '#37 (in)',
  users: { sendoa: { github: 'kalashftw', nombre: 'Sendoa' }, mikel: { github: 'mirastorza', nombre: 'Mikel' } },
  config: { dias_laborables: DIAS, desempate_inicial: 'mikel', saldo_inicial: { sendoa: 0, mikel: 0 }, ...config },
  semanas,
});
const sem = (sendoa, mikel, extra = {}) => ({ prevision: { sendoa, mikel }, ajustes: [], festivos: [], ...extra });
const asignados = (r, id) => Object.fromEntries(Object.values(r.semanas[id].dias).map((d) => [d.dia, d.asignado]));

test('sin historial: el primer solape es para el desempate inicial', () => {
  const r = calcular(base({ '2026-W44': sem(['L', 'M', 'J'], ['M', 'X']) }));
  assert.deepEqual(asignados(r, '2026-W44'), { L: 'sendoa', M: 'mikel', X: 'mikel', J: 'sendoa', V: null });
  assert.deepEqual(r.ganados, { sendoa: 0, mikel: 1 });
  assert.equal(r.semanas['2026-W44'].dias.M.solape, true);
  assert.equal(r.semanas['2026-W44'].dias.L.solape, false);
});

test('empate: gana quien no ganó el último solape', () => {
  const r = calcular(base({ '2026-W44': sem(['L', 'M', 'X'], ['L', 'M', 'X']) }));
  // L: empate 0-0, sin último → mikel. M: sendoa va por detrás → sendoa. X: 1-1, último sendoa → mikel.
  assert.deepEqual(asignados(r, '2026-W44'), { L: 'mikel', M: 'sendoa', X: 'mikel', J: null, V: null });
  assert.equal(r.proximoSolape, 'sendoa');
});

test('desequilibrio 2–0 de saldo: gana quien menos lleva aunque ganara el último', () => {
  const r = calcular(base({ '2026-W44': sem(['L', 'M'], ['L', 'M']) }, { saldo_inicial: { sendoa: 0, mikel: 2 } }));
  assert.deepEqual(asignados(r, '2026-W44'), { L: 'sendoa', M: 'sendoa', X: null, J: null, V: null });
  assert.deepEqual(r.ganados, { sendoa: 2, mikel: 2 });
  assert.equal(r.proximoSolape, 'mikel');
});

test('varios solapes en semanas seguidas: el contador pasa de una a otra', () => {
  const r = calcular(base({
    '2026-W45': sem(['J'], ['J']),
    '2026-W44': sem(['L', 'M', 'X'], ['L', 'M', 'X']),
  }));
  // W44 deja 1-2 a favor de mikel (orden cronológico aunque las claves vengan desordenadas).
  assert.equal(r.semanas['2026-W45'].dias.J.asignado, 'sendoa');
  assert.deepEqual(r.ganados, { sendoa: 2, mikel: 2 });
});

test('cesión: el día pasa al otro y el marcador se corrige −1/+1', () => {
  const r = calcular(base({ '2026-W44': sem(['J'], ['J'], {
    ajustes: [{ dia: 'J', tipo: 'cesion', de: 'mikel', a: 'sendoa', por: 'mikel', ts: '2026-10-29T08:00:00Z' }],
  }) }));
  assert.equal(r.semanas['2026-W44'].dias.J.asignado, 'sendoa');
  assert.deepEqual(r.ganados, { sendoa: 1, mikel: 0 });
});

test('cesión de alguien que no tiene la plaza: no se aplica', () => {
  const r = calcular(base({ '2026-W44': sem(['J'], ['J'], {
    ajustes: [{ dia: 'J', tipo: 'cesion', de: 'sendoa', a: 'mikel', por: 'sendoa', ts: '2026-10-29T08:00:00Z' }],
  }) }));
  assert.equal(r.semanas['2026-W44'].dias.J.asignado, 'mikel');
  assert.equal(r.semanas['2026-W44'].dias.J.ajustes[0].aplicado, false);
  assert.deepEqual(r.ganados, { sendoa: 0, mikel: 1 });
});

test('cancelación con el otro apuntado: pasa a él como una cesión', () => {
  const r = calcular(base({ '2026-W44': sem(['J'], ['J'], {
    ajustes: [{ dia: 'J', tipo: 'cancelacion', de: 'mikel', a: null, por: 'mikel', ts: '2026-10-29T08:00:00Z' }],
  }) }));
  assert.equal(r.semanas['2026-W44'].dias.J.asignado, 'sendoa');
  assert.deepEqual(r.ganados, { sendoa: 1, mikel: 0 });
});

test('cancelación sin el otro apuntado: la plaza queda libre y el marcador no cambia', () => {
  const r = calcular(base({ '2026-W44': sem(['J'], [], {
    ajustes: [{ dia: 'J', tipo: 'cancelacion', de: 'sendoa', a: null, por: 'sendoa', ts: '2026-10-29T08:00:00Z' }],
  }) }));
  assert.equal(r.semanas['2026-W44'].dias.J.asignado, null);
  assert.deepEqual(r.ganados, { sendoa: 0, mikel: 0 });
});

test('cesión y luego cancelación del que la recibe: vuelve y el marcador queda como estaba', () => {
  const r = calcular(base({ '2026-W44': sem(['J'], ['J'], {
    ajustes: [
      { dia: 'J', tipo: 'cancelacion', de: 'sendoa', a: null, por: 'sendoa', ts: '2026-10-29T09:00:00Z' },
      { dia: 'J', tipo: 'cesion', de: 'mikel', a: 'sendoa', por: 'mikel', ts: '2026-10-29T08:00:00Z' },
    ],
  }) }));
  assert.equal(r.semanas['2026-W44'].dias.J.asignado, 'mikel');
  assert.deepEqual(r.ganados, { sendoa: 0, mikel: 1 });
});

test('festivo: el día se ignora y no cuenta', () => {
  const r = calcular(base({ '2026-W44': sem(['L', 'M'], ['L', 'M'], { festivos: ['L'] }) }));
  assert.deepEqual(asignados(r, '2026-W44'), { L: null, M: 'mikel', X: null, J: null, V: null });
  assert.equal(r.semanas['2026-W44'].dias.L.festivo, true);
  assert.deepEqual(r.ganados, { sendoa: 0, mikel: 1 });
});

test('solo uno ha rellenado: se asigna igual y se avisa de quién falta', () => {
  const r = calcular(base({ '2026-W44': { prevision: { sendoa: ['L'] }, ajustes: [], festivos: [] } }));
  assert.deepEqual(r.semanas['2026-W44'].falta, ['mikel']);
  assert.equal(r.semanas['2026-W44'].dias.L.asignado, 'sendoa');
});

test('propiedad: sin ajustes, el marcador nunca se separa más de 1 (1.000 semanas)', () => {
  let semilla = 37;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const elegir = () => DIAS.filter(() => azar() < 0.6);
  const semanas = {};
  let id = '2026-W44';
  for (let i = 0; i < 1000; i++) {
    semanas[id] = sem(elegir(), elegir(), { festivos: DIAS.filter(() => azar() < 0.05) });
    id = sumarSemanas(id, 1);
  }
  const state = base(semanas);
  // Se comprueba tras cada semana, no solo al final.
  const ids = Object.keys(semanas).sort();
  assert.equal(ids.length, 1000);
  let solapes = 0;
  for (let n = 1; n <= ids.length; n++) {
    const parcial = { ...state, semanas: Object.fromEntries(ids.slice(0, n).map((k) => [k, semanas[k]])) };
    const { ganados } = calcular(parcial);
    assert.ok(Math.abs(ganados.sendoa - ganados.mikel) <= 1, `semana ${ids[n - 1]}: ${JSON.stringify(ganados)}`);
    if (n === ids.length) solapes = ganados.sendoa + ganados.mikel;
  }
  assert.ok(solapes > 500, 'el generador produce solapes de verdad');
});

test('semanas ISO: semana 53 y paso de año', () => {
  assert.equal(semanaISO('2026-12-31'), '2026-W53');
  assert.equal(semanaISO('2027-01-03'), '2026-W53');
  assert.equal(semanaISO('2027-01-04'), '2027-W01');
  assert.equal(semanaISO('2026-01-01'), '2026-W01');
  assert.equal(semanaISO('2025-12-29'), '2026-W01');
  assert.equal(semanaISO('2026-10-22'), '2026-W43');
  assert.equal(lunesDe('2026-W53'), '2026-12-28');
  assert.equal(lunesDe('2027-W01'), '2027-01-04');
  assert.equal(fechaDe('2026-W53', 'V'), '2027-01-01');
  assert.equal(sumarSemanas('2026-W53', 1), '2027-W01');
  assert.equal(sumarSemanas('2027-W01', -1), '2026-W53');
  assert.equal(sumarSemanas('2025-W52', 1), '2026-W01');
  // Recorrido largo: lunesDe y semanaISO son inversas.
  let s = '2020-W01';
  for (let i = 0; i < 600; i++, s = sumarSemanas(s, 1)) assert.equal(semanaISO(lunesDe(s)), s);
});

test('hora de Madrid y plazo del domingo 23:59, con cambio de hora', () => {
  // 25/10/2026: fin del horario de verano. 23:30 en Madrid (CET) = 22:30 UTC.
  assert.equal(hoyMadrid(new Date('2026-10-25T22:59:00Z')), '2026-10-25');
  assert.equal(hoyMadrid(new Date('2026-10-25T23:00:00Z')), '2026-10-26');
  assert.equal(previsionAbierta('2026-W44', hoyMadrid(new Date('2026-10-25T22:59:00Z'))), true);
  assert.equal(previsionAbierta('2026-W44', hoyMadrid(new Date('2026-10-25T23:00:00Z'))), false);
  // En verano (CEST) el corte es a las 22:00 UTC.
  assert.equal(hoyMadrid(new Date('2026-06-28T21:59:00Z')), '2026-06-28');
  assert.equal(hoyMadrid(new Date('2026-06-28T22:00:00Z')), '2026-06-29');
});

test('«me la quedo» en un día libre: es suya y el marcador no cambia', () => {
  const r = calcular(base({ '2026-W44': sem(['L'], ['M'], {
    ajustes: [{ dia: 'X', tipo: 'apunte', de: 'mikel', a: null, por: 'mikel', ts: '2026-10-28T07:00:00Z' }],
  }) }));
  assert.equal(r.semanas['2026-W44'].dias.X.asignado, 'mikel');
  assert.equal(r.semanas['2026-W44'].dias.X.solape, false);
  assert.deepEqual(r.ganados, { sendoa: 0, mikel: 0 });
});

test('«me la quedo» sobre un día que no está libre: no se aplica', () => {
  const r = calcular(base({ '2026-W44': sem(['L'], [], {
    ajustes: [{ dia: 'L', tipo: 'apunte', de: 'mikel', a: null, por: 'mikel', ts: '2026-10-26T07:00:00Z' }],
  }) }));
  assert.equal(r.semanas['2026-W44'].dias.L.asignado, 'sendoa');
  assert.equal(r.semanas['2026-W44'].dias.L.ajustes[0].aplicado, false);
});

test('ya no va, el otro se la queda y luego tampoco va: queda libre, sin devolverla ni tocar el marcador', () => {
  const r = calcular(base({ '2026-W44': sem([], ['X'], {
    ajustes: [
      { dia: 'X', tipo: 'cancelacion', de: 'mikel', a: null, por: 'mikel', ts: '2026-10-27T08:00:00Z' },
      { dia: 'X', tipo: 'apunte', de: 'sendoa', a: null, por: 'sendoa', ts: '2026-10-27T09:00:00Z' },
      { dia: 'X', tipo: 'cancelacion', de: 'sendoa', a: null, por: 'sendoa', ts: '2026-10-27T10:00:00Z' },
    ],
  }) }));
  assert.equal(r.semanas['2026-W44'].dias.X.asignado, null);
  assert.deepEqual(r.ganados, { sendoa: 0, mikel: 0 });
});
