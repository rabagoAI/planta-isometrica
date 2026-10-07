/**
 * Puente entre las variables CSS del tema y el canvas.
 * El canvas no puede usar `var(--x)`, así que leemos los valores calculados
 * de :root y los refrescamos cuando cambia el tema.
 */

const KEYS = [
  'bg', 'surface', 'stage', 'ink', 'muted', 'line', 'accent',
  'prod', 'ok', 'clean', 'off', 'risk', 'alert', 'ground',
  'floor-prod', 'floor-corr', 'floor-store', 'floor-amen', 'floor-serv',
  'wall-t', 'wall-l', 'wall-r',
  'mach', 'rack', 'tank', 'carton', 'carton2', 'wood',
  'fork', 'dark', 'vest', 'truck-box', 'tree', 'trunk',
  'wear-fab', 'wear-env', 'wear-exp',
] as const;

export type Palette = Record<string, string>;

export class Colors {
  /** Valor hex de cada variable, por nombre sin `--`. */
  readonly value: Palette = {};
  /** Caché de tonos derivados; se vacía al releer el tema. */
  private tints: Palette = {};

  /** Relee las variables CSS de :root. Llamar al cambiar de tema. */
  read(): void {
    const cs = getComputedStyle(document.documentElement);
    this.tints = {};
    for (const k of KEYS) this.value[k] = cs.getPropertyValue('--' + k).trim();
  }

  /** Aclara (f > 1) u oscurece (f < 1) un token, con caché. */
  shade(token: string, f: number): string {
    const k = token + f;
    return (this.tints[k] ??= shade(this.value[token]!, f));
  }

  rgba(token: string, a: number): string {
    const [r, g, b] = hex(this.value[token]!);
    return `rgba(${r},${g},${b},${a})`;
  }
}

function hex(c: string): [number, number, number] {
  let s = c.replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/** Mezcla hacia blanco si f ≥ 1, hacia negro si f < 1. */
function shade(c: string, f: number): string {
  const h = hex(c);
  const target = f >= 1 ? 255 : 0;
  const k = Math.min(1, f >= 1 ? f - 1 : 1 - f);
  return 'rgb(' + h.map((v) => Math.round(v + (target - v) * k)).join(',') + ')';
}
