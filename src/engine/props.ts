/** Figuras del plano: personas, palés, árboles, camión, toro y estanterías. */

import type { Iso } from './iso';

/** Operario u oficinista. `seat` lo dibuja sentado, `lab` con bata. */
export function person(
  iso: Iso, x: number, y: number, col: string, ph: number,
  moving: boolean, lab = false, seat = false,
): void {
  const g = iso.g;
  const [sx, sy] = iso.p(x, y, 0);
  const u = iso.view.s;
  const bob = moving ? Math.abs(Math.sin(iso.t * 9 + ph)) * 1.4 * u : 0;
  // Sentado: el torso baja y desaparecen las piernas.
  const o = seat ? 5 * u : 0;

  g.fillStyle = 'rgba(0,0,0,.2)';
  g.beginPath();
  g.ellipse(sx, sy, 5.2 * u, 2.6 * u, 0, 0, 7);
  g.fill();

  if (!seat) {
    g.fillStyle = iso.col.value['dark']!;
    g.fillRect(sx - 2.8 * u, sy - 8 * u - bob, 5.6 * u, 8 * u);
  }
  g.fillStyle = lab ? iso.col.value['truck-box']! : col;
  iso.roundRect(sx - 3.8 * u, sy - 19 * u - bob + o, 7.6 * u, (seat ? 9 : 12) * u, 2 * u);
  g.fill();

  g.fillStyle = '#E7B48C';
  g.beginPath();
  g.arc(sx, sy - 22.5 * u - bob + o, 3.3 * u, 0, 7);
  g.fill();

  g.fillStyle = seat ? '#3B2F2A' : lab ? iso.col.value['accent']! : '#F4F6F8';
  g.beginPath();
  g.arc(sx, sy - 23.4 * u - bob + o, 3.4 * u, Math.PI, 0);
  g.fill();
}

/** Palé con cuatro cajas. `token` añade una marca de color encima. */
export function pallet(iso: Iso, x: number, y: number, token?: string): void {
  iso.box(x - 9, y - 9, 18, 18, 3, 0, 'wood');
  const offsets: [number, number][] = [[-8.6, -8.6], [0.4, -8.6], [-8.6, 0.4], [0.4, 0.4]];
  offsets.forEach(([dx, dy], i) => {
    iso.box(x + dx, y + dy, 8.2, 8.2, 11, 3, i % 3 === 0 ? 'carton' : 'carton2');
  });
  if (token) iso.box(x - 3, y - 3, 6, 6, 0.8, 14, token);
}

export function tree(iso: Iso, x: number, y: number): void {
  const g = iso.g;
  const [sx, sy] = iso.p(x, y, 0);
  const u = iso.view.s;

  g.fillStyle = 'rgba(0,0,0,.16)';
  g.beginPath();
  g.ellipse(sx + 3 * u, sy, 11 * u, 5 * u, 0, 0, 7);
  g.fill();

  iso.box(x - 1.6, y - 1.6, 3.2, 3.2, 12, 0, 'trunk');

  const [cx, cy] = iso.p(x, y, 26);
  const gr = g.createRadialGradient(cx - 4 * u, cy - 5 * u, 2 * u, cx, cy, 14 * u);
  gr.addColorStop(0, iso.col.shade('tree', 1.3));
  gr.addColorStop(1, iso.col.shade('tree', 0.78));
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(cx, cy, 11 * u, 13 * u, 0, 0, 7);
  g.fill();
}

/** Camión en el muelle. Coordenadas ya trasladadas al origen. */
export function truck(iso: Iso, x: number, y: number): void {
  // El prototipo preparaba aquí una sombra bajo el camión, pero nunca llegaba a
  // pintarse. Se mantiene fuera para no alterar el aspecto actual.
  iso.box(x - 34, y - 12, 60, 24, 5, 2, 'dark');
  for (const o of [-26, -12, 14]) iso.box(x + o, y + 11, 10, 3, 8, 0, 'dark');
  iso.box(x - 34, y - 13, 42, 26, 26, 6, 'truck-box');
  // Franja lateral.
  const prod = iso.col.value['prod']!;
  iso.boxC(x - 30, y + 13, 34, 0.7, 6, 13, prod, prod, prod);
  iso.box(x + 8, y - 13, 19, 26, 17, 6, 'prod');
  // Parabrisas.
  const dark = iso.col.value['dark']!;
  iso.boxC(x + 26, y - 10, 0.8, 20, 7, 15, dark, dark, dark);
}

/** Toro de horquilla elevadora. `dir` es el sentido de marcha en y. */
export function forklift(iso: Iso, x: number, y: number, dir: number, wear: string): void {
  const g = iso.g;
  const [sx, sy] = iso.p(x, y, 0);
  const s = iso.view.s;

  g.fillStyle = 'rgba(0,0,0,.2)';
  g.beginPath();
  g.ellipse(sx, sy, 9 * s, 4 * s, 0, 0, 7);
  g.fill();

  iso.box(x - 6, y - 9, 12, 14, 9, 3, 'fork');
  // Mástil y horquillas, al frente según el sentido.
  iso.box(x - 5, dir > 0 ? y + 5 : y - 14, 10, 2, 32, 0, 'dark');
  iso.box(x - 4.5, dir > 0 ? y + 7 : y - 22, 2, 14, 1.2, 1, 'dark');
  iso.box(x + 2.5, dir > 0 ? y + 7 : y - 22, 2, 14, 1.2, 1, 'dark');
  // Arco de seguridad.
  iso.box(x - 5, y - 8, 1.4, 1.4, 14, 12, 'dark');
  iso.box(x + 3.6, y - 8, 1.4, 1.4, 14, 12, 'dark');

  person(iso, x, y + 1, wear, 1, false);
}

/** Una posición de carga dentro de una estantería. */
export interface RackCell { level: number; slot: number; alt: boolean }

/** Dibuja un módulo de estantería con las cajas que le tocaron. */
export function rackModule(
  iso: Iso, x: number, y: number, w: number, d: number,
  axis: 'x' | 'y', len: number, perLevel: number, cells: RackCell[],
): void {
  iso.box(x, y, w, d, 3, 0, 'rack');
  for (let lv = 0; lv < 2; lv++) {
    const z = 3 + lv * 13;
    const cw = (len - 2) / perLevel - 2;
    for (const c of cells) {
      if (c.level !== lv) continue;
      const off = 2 + (c.slot * (len - 2)) / perLevel;
      iso.box(
        axis === 'x' ? x + off : x + 2,
        axis === 'y' ? y + off : y + 2,
        axis === 'x' ? cw : d - 4,
        axis === 'y' ? cw : d - 4,
        10, z, c.alt ? 'carton' : 'carton2',
      );
    }
    // Larguero sobre cada nivel.
    iso.box(x, y, w, d, 1.6, z + 10, 'rack');
  }
  // Bastidores de los extremos.
  iso.box(x, y, axis === 'x' ? 2.4 : w, axis === 'y' ? 2.4 : d, 28, 0, 'rack');
  iso.box(
    axis === 'x' ? x + w - 2.4 : x,
    axis === 'y' ? y + d - 2.4 : y,
    axis === 'x' ? 2.4 : w,
    axis === 'y' ? 2.4 : d,
    28, 0, 'rack',
  );
}
