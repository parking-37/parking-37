// Cambios que puede hacer un usuario sobre el estado. Cada uno devuelve la
// función que lo aplica (para poder reaplicarla si hay conflicto) y el
// mensaje del commit. Las reglas de plazo se comprueban al aplicar.

import { DIAS, previsionAbierta, diaAbierto, calcular } from './asignacion.js';

const semanaDe = (state, id) => (state.semanas[id] ??= { prevision: {}, ajustes: [], festivos: [] });
const lista = (dias) => (dias.length ? dias.join(',') : 'ninguno');

export class CambioNoValido extends Error {}

export function prevision({ yo, semana, dias, hoy }) {
  const ordenados = DIAS.filter((d) => dias.includes(d));
  return {
    mensaje: `${yo}: previsión ${semana} (${lista(ordenados)})`,
    mutar(state) {
      if (!previsionAbierta(semana, hoy)) throw new CambioNoValido(`La previsión de ${semana} ya está cerrada.`);
      semanaDe(state, semana).prevision[yo] = ordenados;
      return state;
    },
  };
}

// tipo: 'cesion' | 'cancelacion'. Solo puede hacerlo quien tiene la plaza ese día.
export function ajuste({ yo, otro, semana, dia, tipo, hoy, ts = new Date().toISOString() }) {
  const texto = tipo === 'cesion' ? `cede ${dia} ${semana} a ${otro}` : `ya no va ${dia} ${semana}`;
  return {
    mensaje: `${yo}: ${texto}`,
    mutar(state) {
      if (!diaAbierto(semana, dia, hoy)) throw new CambioNoValido('Ese día ya ha pasado.');
      if (calcular(state).semanas[semana]?.dias[dia]?.asignado !== yo) throw new CambioNoValido('Ese día ya no tienes la plaza.');
      semanaDe(state, semana).ajustes.push({ dia, tipo, de: yo, a: tipo === 'cesion' ? otro : null, por: yo, ts });
      return state;
    },
  };
}

export function festivo({ yo, semana, dia, marcar, hoy }) {
  return {
    mensaje: `${yo}: ${marcar ? 'festivo' : 'quita festivo'} ${dia} ${semana}`,
    mutar(state) {
      if (!diaAbierto(semana, dia, hoy)) throw new CambioNoValido('Ese día ya ha pasado.');
      const s = semanaDe(state, semana);
      s.festivos = DIAS.filter((d) => (d === dia ? marcar : s.festivos.includes(d)));
      return state;
    },
  };
}
