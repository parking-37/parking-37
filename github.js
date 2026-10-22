// Lectura y escritura de data/state.json en el repo privado a través de la
// API de contenidos de GitHub. Cada escritura es un commit.

const API = 'https://api.github.com';
const RUTA = 'data/state.json';

export class ErrorGitHub extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

const deBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const aBase64 = (texto) => btoa(Array.from(new TextEncoder().encode(texto), (b) => String.fromCharCode(b)).join(''));

export class Almacen {
  constructor({ token, owner, repo, fetch: f = globalThis.fetch.bind(globalThis) }) {
    this.token = token;
    this.url = `${API}/repos/${owner}/${repo}/contents/${RUTA}`;
    this.fetch = f;
  }

  async pedir(url, opciones = {}) {
    const res = await this.fetch(url, {
      ...opciones,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) throw new ErrorGitHub(`GitHub respondió ${res.status}`, res.status);
    return res.json();
  }

  usuario() {
    return this.pedir(`${API}/user`);
  }

  async leer() {
    const r = await this.pedir(this.url);
    return { state: JSON.parse(deBase64(r.content)), sha: r.sha };
  }

  // `mutar` recibe una copia del estado y devuelve el estado nuevo (o lanza
  // si el cambio ya no es válido). Si otro guardó entre medias, se relee y se
  // vuelve a aplicar el cambio sobre lo nuevo, una vez como máximo.
  async guardar(mutar, mensaje, actual = null) {
    let { state, sha } = actual ?? (await this.leer());
    for (let intento = 0; ; intento++) {
      const nuevo = mutar(structuredClone(state));
      try {
        const r = await this.pedir(this.url, {
          method: 'PUT',
          body: JSON.stringify({ message: mensaje, content: aBase64(JSON.stringify(nuevo, null, 2) + '\n'), sha }),
        });
        return { state: nuevo, sha: r.content.sha };
      } catch (e) {
        if (intento > 0 || ![409, 422].includes(e.estado)) throw e;
        ({ state, sha } = await this.leer());
      }
    }
  }
}
