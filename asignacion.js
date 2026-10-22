// Lógica de reparto de la plaza (§6 del PRD). Sin dependencias ni acceso a red:
// la usan la web y, si llega la fase 2, la Action de avisos.

export const DIAS = ['L', 'M', 'X', 'J', 'V'];
export const ZONA = 'Europe/Madrid';

const DIA_MS = 86400000;

// ── Fechas y semanas ISO ────────────────────────────────────────────────
// Las fechas viajan como 'YYYY-MM-DD' (día de calendario en Madrid). La
// aritmética se hace en UTC a mediodía, así el cambio de hora no la toca.

const aUTC = (f) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10), 12);
const aFecha = (ms) => new Date(ms).toISOString().slice(0, 10);

export function hoyMadrid(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

export function semanaISO(fecha) {
  const d = new Date(aUTC(fecha));
  const diaSemana = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - diaSemana + 3); // el jueves decide el año
  const anio = d.getUTCFullYear();
  const semana = 1 + Math.floor((d - Date.UTC(anio, 0, 1, 12)) / (7 * DIA_MS));
  return `${anio}-W${String(semana).padStart(2, '0')}`;
}

export function lunesDe(semana) {
  const anio = +semana.slice(0, 4);
  const n = +semana.slice(6);
  const cuatroEnero = Date.UTC(anio, 0, 4, 12);
  const lunesSemana1 = cuatroEnero - ((new Date(cuatroEnero).getUTCDay() + 6) % 7) * DIA_MS;
  return aFecha(lunesSemana1 + (n - 1) * 7 * DIA_MS);
}

export const fechaDe = (semana, dia) => aFecha(aUTC(lunesDe(semana)) + DIAS.indexOf(dia) * DIA_MS);
export const sumarSemanas = (semana, n) => semanaISO(aFecha(aUTC(lunesDe(semana)) + n * 7 * DIA_MS));

// La previsión de una semana se puede cambiar hasta el domingo anterior a las 23:59.
export const previsionAbierta = (semana, hoy) => hoy < lunesDe(semana);
// Los ajustes y festivos solo valen para hoy o días futuros.
export const diaAbierto = (semana, dia, hoy) => fechaDe(semana, dia) >= hoy;

// ── Reparto ─────────────────────────────────────────────────────────────

const otroDe = (state, u) => Object.keys(state.users).find((k) => k !== u);

// A quién le toca el próximo solape con el marcador actual.
function ganadorSolape(state, ganados, ultimoGanador) {
  const [a, b] = Object.keys(state.users);
  if (ganados[a] !== ganados[b]) return ganados[a] < ganados[b] ? a : b;
  return ultimoGanador ? otroDe(state, ultimoGanador) : state.config.desempate_inicial;
}

// Recorre todas las semanas en orden y devuelve la asignación de cada día y
// el marcador. Nada de esto se guarda: siempre sale de previsión + ajustes.
export function calcular(state) {
  const usuarios = Object.keys(state.users);
  const laborables = DIAS.filter((d) => state.config.dias_laborables.includes(d));
  const ganados = { ...state.config.saldo_inicial };
  let ultimoGanador = null;
  const semanas = {};

  for (const id of Object.keys(state.semanas).sort()) {
    const s = state.semanas[id];
    const prevision = s.prevision ?? {};
    const festivos = s.festivos ?? [];
    const dias = {};

    for (const dia of laborables) {
      const pide = usuarios.filter((u) => prevision[u]?.includes(dia));
      const r = { dia, fecha: fechaDe(id, dia), pide, festivo: festivos.includes(dia), solape: false, asignado: null, ajustes: [] };
      dias[dia] = r;
      if (r.festivo) continue;

      if (pide.length === 1) r.asignado = pide[0];
      if (pide.length === 2) {
        r.solape = true;
        r.asignado = ganadorSolape(state, ganados, ultimoGanador);
        ganados[r.asignado] += 1;
        ultimoGanador = r.asignado;
      }

      const ajustes = (s.ajustes ?? []).filter((a) => a.dia === dia).sort((a, b) => a.ts.localeCompare(b.ts));
      const yaNoVan = new Set();
      for (const a of ajustes) {
        // Un ajuste solo vale si lo hace quien tiene la plaza en ese momento;
        // «me la quedo» (apunte), solo si la plaza está libre. No cuenta en el marcador.
        const aplicado = a.tipo === 'apunte' ? r.asignado === null : a.de === r.asignado;
        r.ajustes.push({ ...a, aplicado });
        if (!aplicado) continue;
        if (a.tipo === 'apunte') { r.asignado = a.de; continue; }
        const otro = otroDe(state, a.de);
        if (a.tipo === 'cancelacion') yaNoVan.add(a.de);
        // Una cancelación no devuelve la plaza a quien ya dijo que no iba.
        if (a.tipo === 'cesion' || (a.tipo === 'cancelacion' && pide.includes(otro) && !yaNoVan.has(otro))) {
          r.asignado = otro;
          ganados[a.de] -= 1;
          ganados[otro] += 1;
        } else if (a.tipo === 'cancelacion') {
          r.asignado = null;
        }
      }
    }

    semanas[id] = { id, dias, falta: usuarios.filter((u) => !prevision[u]) };
  }

  return { semanas, ganados, ultimoGanador, proximoSolape: ganadorSolape(state, ganados, ultimoGanador) };
}
