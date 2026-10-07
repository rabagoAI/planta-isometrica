/**
 * Monta la escena estática: muros (fusionados y con los huecos de las puertas)
 * y equipos del JSON. Cada pieza queda como una función de dibujo con su
 * profundidad `dp`, para ordenarlas de fondo a frente en cada fotograma.
 */

import { rackModule, person, tree } from './props';
import type { Iso } from './iso';
import type { Plant } from './plant';
import type { RackCell } from './props';
import type { PlantData, SeatedItem } from './types';

export interface StaticPiece {
  /** Profundidad isométrica: a más valor, más al frente. */
  dp: number;
  draw: (iso: Iso) => void;
}

/** Sombra proyectada en el suelo por una pieza alta. */
export interface Shadow { x: number; y: number; w: number; d: number; h: number }

export interface Scene {
  statics: StaticPiece[];
  shadows: Shadow[];
  /** Posiciones del personal sentado; las usa el recuento de personas por sala. */
  seated: [number, number][];
}

/**
 * PRNG determinista (mulberry32). La semilla fija hace que las cajas de las
 * estanterías caigan siempre igual, así el plano no cambia entre recargas.
 */
function makeRng(seed = 20261006) {
  let a = 0;
  return function rng(): number {
    a = ((a || seed) + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildScene(data: PlantData, plant: Plant): Scene {
  const { x: ofx, y: ofy } = data.meta.origin;
  const statics: StaticPiece[] = [];
  const shadows: Shadow[] = [];
  const seated: [number, number][] = [];
  const rng = makeRng();

  /* ---------- muros ---------- */

  const wallH = data.walls.defaultHeight;
  const thick = data.walls.thickness;
  const half = thick / 2;

  const pushWall = (axis: 'h' | 'v', c: number, a: number, b: number, h: number) => {
    const x = axis === 'h' ? a : c - half;
    const y = axis === 'h' ? c - half : a;
    const w = axis === 'h' ? b - a : thick;
    const d = axis === 'h' ? thick : b - a;
    statics.push({
      // +.5 para que el muro gane al suelo y a los equipos pegados a él.
      dp: x + w / 2 + y + d / 2 + 0.5,
      draw: (iso) => iso.boxC(
        x, y, w, d, h, 0,
        iso.col.value['wall-t']!, iso.col.value['wall-l']!, iso.col.value['wall-r']!,
      ),
    });
  };

  // Cada sala aporta sus cuatro aristas; las que comparten línea se fusionan.
  const lines = new Map<string, [number, number][]>();
  const add = (axis: 'h' | 'v', c: number, a: number, b: number) => {
    const k = axis + '|' + c;
    const list = lines.get(k);
    if (list) list.push([a, b]);
    else lines.set(k, [[a, b]]);
  };
  for (const r of plant.rooms) {
    add('h', r.y0, r.x0, r.x1);
    add('h', r.y1, r.x0, r.x1);
    add('v', r.x0, r.y0, r.y1);
    add('v', r.x1, r.y0, r.y1);
  }

  // Alturas especiales: muro de fondo más alto, fachada y lateral a media altura.
  const overrideH = new Map(
    data.walls.overrides.map((o) => [
      o.axis + '|' + (o.c - (o.axis === 'h' ? ofy : ofx)),
      o.height,
    ]),
  );

  for (const [key, intervals] of lines) {
    const axis = key.slice(0, 1) as 'h' | 'v';
    const c = Number(key.slice(2));

    // Fusionar tramos solapados o contiguos.
    const sorted = [...intervals].sort((p, q) => p[0] - q[0]);
    let merged: [number, number][] = [];
    for (const iv of sorted) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1] + 0.01) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    }

    // Restar los huecos de las puertas de esta línea.
    for (const dr of plant.doors) {
      if (dr.axis !== axis || Math.abs(dr.c - c) > 0.01) continue;
      const next: [number, number][] = [];
      for (const s of merged) {
        if (dr.b <= s[0] || dr.a >= s[1]) { next.push(s); continue; }
        if (dr.a > s[0]) next.push([s[0], dr.a]);
        if (dr.b < s[1]) next.push([dr.b, s[1]]);
      }
      merged = next;
    }

    const h = overrideH.get(axis + '|' + c) ?? wallH;
    // Trocear: un muro largo de una pieza se ordenaría mal frente a los equipos.
    for (const s of merged) {
      const len = s[1] - s[0];
      const n = Math.max(1, Math.ceil(len / data.walls.segmentLength));
      const step = len / n;
      for (let i = 0; i < n; i++) pushWall(axis, c, s[0] + i * step, s[0] + (i + 1) * step, h);
    }
  }

  /* ---------- equipos ---------- */

  const pushBox = (px: number, py: number, w: number, d: number, h: number, token: string, z0 = 0) => {
    const x = px - ofx;
    const y = py - ofy;
    statics.push({
      dp: x + w / 2 + y + d / 2 + z0 * 0.01,
      draw: (iso) => iso.box(x, y, w, d, h, z0, token),
    });
    if (h > 8) shadows.push({ x, y, w, d, h });
  };

  for (const item of data.equipment) {
    if (!item.type) continue; // separador documental

    switch (item.type) {
      case 'box':
        pushBox(item.x, item.y, item.w, item.d, item.h, item.token, item.z0 ?? 0);
        break;

      case 'cyl': {
        const x = item.x - ofx;
        const y = item.y - ofy;
        const z0 = item.z0 ?? 0;
        const room = plant.byId[item.room]!;
        statics.push({
          dp: x + y,
          draw: (iso) => iso.cyl(
            x, y, item.r, item.h, z0, item.token,
            plant.stateOf(room) === 'prod', item.phase,
          ),
        });
        shadows.push({ x: x - item.r, y: y - item.r, w: 2 * item.r, d: 2 * item.r, h: z0 + item.h });
        break;
      }

      case 'rack': {
        const x = item.x - ofx;
        const y = item.y - ofy;
        const n = Math.max(1, Math.ceil(item.len / 40));
        const L = item.len / n;
        for (let i = 0; i < n; i++) {
          const sx = item.axis === 'x' ? x + i * L : x;
          const sy = item.axis === 'y' ? y + i * L : y;
          const w = item.axis === 'x' ? L : item.dep;
          const d = item.axis === 'y' ? L : item.dep;
          const perLevel = Math.floor(L / 13);
          const cells: RackCell[] = [];
          for (let level = 0; level < 2; level++) {
            for (let slot = 0; slot < perLevel; slot++) {
              // Un 18 % de los huecos queda vacío.
              if (rng() > 0.82) continue;
              cells.push({ level, slot, alt: rng() > 0.5 });
            }
          }
          statics.push({
            dp: sx + w / 2 + sy + d / 2,
            draw: (iso) => rackModule(iso, sx, sy, w, d, item.axis, L, perLevel, cells),
          });
          shadows.push({ x: sx, y: sy, w, d, h: 28 });
        }
        break;
      }

      case 'tree': {
        const x = item.x - ofx;
        const y = item.y - ofy;
        statics.push({ dp: x + y, draw: (iso) => tree(iso, x, y) });
        break;
      }

      case 'stack': {
        // Palé apilado: base de madera y una caja encima.
        const token = (item.x + item.y) % 2 ? 'carton' : 'carton2';
        pushBox(item.x - 9, item.y - 9, 18, 18, 3, 'wood');
        pushBox(item.x - 8.6, item.y - 8.6, 17, 17, 10, token, 3);
        break;
      }

      case 'seated': {
        const s = item as SeatedItem;
        const x = s.x - ofx;
        const y = s.y - ofy;
        seated.push([s.x, s.y]);
        statics.push({
          dp: x + y,
          draw: (iso) => person(iso, x, y, iso.col.value[s.token]!, 0, false, s.lab, true),
        });
        break;
      }
    }
  }

  return { statics, shadows, seated };
}
