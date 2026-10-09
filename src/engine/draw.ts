/**
 * Dibujo de un fotograma. Compone la escena estática con los elementos móviles,
 * los ordena por profundidad y los pinta de fondo a frente.
 */

import { forklift, pallet, person, truck } from './props';
import type { Iso } from './iso';
import type { Plant } from './plant';
import type { Scene, StaticPiece } from './scene';
import type { Simulation } from './sim';
import type { PlantData, Room, RoomState } from './types';

const COS = Math.cos(Math.PI / 6);
const LABEL_FONT = '500 11px "IBM Plex Sans",system-ui,sans-serif';
/** Por debajo de esta escala los rótulos de zona estorban más que ayudan. */
const MARKER_MIN_SCALE = 0.45;

const FLOOR: Record<string, string> = {
  prod: 'floor-prod',
  corr: 'floor-corr',
  store: 'floor-store',
  amen: 'floor-amen',
  serv: 'floor-serv',
};

/**
 * Color de la ropa de quien está en un punto del plano. Lo decide el
 * departamento, así que el operario que empuja un palé cambia de color al pasar
 * de fabricación a envasado o a expedición.
 */
function wearAt(plant: Plant, data: PlantData, x: number, y: number): string {
  const room = plant.roomAt(x, y);
  const token = (room && data.wear.byRoom[room.id]) || data.wear.default;
  return token;
}

/** Opacidad del velo de color que marca el estado de una sala. */
function tint(s: RoomState, t: number): number {
  switch (s) {
    case 'prod': return 0.17;
    case 'clean': return 0.22;
    case 'off': return 0.2;
    case 'risk': return 0.26 + 0.1 * Math.sin(t * 5);
    case 'alert': return 0.38 + 0.12 * Math.sin(t * 6);
    default: return 0;
  }
}

export interface DrawInput {
  iso: Iso;
  plant: Plant;
  sim: Simulation;
  scene: Scene;
  data: PlantData;
  hover: Room | null;
  selected: Room | null;
  width: number;
  height: number;
  dpr: number;
}

export function drawFrame(input: DrawInput): void {
  const { iso, plant, sim, scene, data, hover, selected, width, height, dpr } = input;
  const g = iso.g;
  const { x: ofx, y: ofy } = plant.origin;
  const P = iso.p.bind(iso);

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);

  // Solar.
  const gr = data.ground;
  iso.box(gr.x, gr.y, gr.w, gr.d, gr.h, gr.z0, gr.token);

  // Eje del pasillo central.
  g.setLineDash([10, 9]);
  g.strokeStyle = iso.col.rgba('muted', 0.45);
  g.lineWidth = 1.4;
  g.beginPath();
  const a0 = P(data.aisle.x0, data.aisle.y, 0);
  const a1 = P(data.aisle.x1, data.aisle.y, 0);
  g.moveTo(a0[0], a0[1]);
  g.lineTo(a1[0], a1[1]);
  g.stroke();
  g.setLineDash([]);

  // Suelos con el velo de estado.
  for (const r of plant.rooms) {
    const pts = [P(r.x0, r.y0, 0), P(r.x1, r.y0, 0), P(r.x1, r.y1, 0), P(r.x0, r.y1, 0)];
    iso.poly(pts, iso.col.value[FLOOR[r.kind]!]!);
    const s = plant.stateOf(r);
    // Un estado puesto a mano trae su propia opacidad, sin parpadeo.
    const manual = plant.modeState(r);
    const a = manual ? manual.tint : tint(s, iso.t);
    if (a > 0) iso.poly(pts, iso.col.rgba(s, a));
  }

  // Suelos elevados. Van aquí, antes que las piezas, para que los reactores y
  // cuanto se apoye encima queden siempre por delante de la plataforma.
  for (const pl of data.platforms) {
    iso.box(pl.x - ofx, pl.y - ofy, pl.w, pl.d, pl.h, 0, pl.token);
  }

  // Zonas delimitadas dentro de las salas: cuarentena, carga, muelle…
  for (const z of data.zones) {
    const pts = [
      P(z.x0 - ofx, z.y0 - ofy, 0), P(z.x1 - ofx, z.y0 - ofy, 0),
      P(z.x1 - ofx, z.y1 - ofy, 0), P(z.x0 - ofx, z.y1 - ofy, 0),
    ];
    if (z.fill) iso.poly(pts, iso.col.rgba(z.token, z.fill));
    g.setLineDash([6, 5]);
    iso.poly(pts, null, iso.col.value[z.token]!, 1.6);
    g.setLineDash([]);
  }

  // Ondas de alarma sobre el foco de la desviación.
  const focus = plant.byId[data.incident.room]!;
  if (sim.incident.on || focus.inc === 'alert') {
    const cx = (focus.x0 + focus.x1) / 2;
    const cy = (focus.y0 + focus.y1) / 2;
    for (let k = 0; k < 3; k++) {
      const f = (iso.t * 0.45 + k / 3) % 1;
      iso.circlePath(cx, cy, 30 + f * (60 + sim.incident.ring * 70), 0.5);
      g.strokeStyle = iso.col.rgba('alert', 0.55 * (1 - f));
      g.lineWidth = 2;
      g.stroke();
    }
  }

  // Sombras: el desplazamiento crece con la altura de la pieza.
  for (const s of scene.shadows) {
    const o = s.h * 0.45;
    iso.poly([
      P(s.x + o, s.y + o, 0), P(s.x + s.w + o, s.y + o, 0),
      P(s.x + s.w + o, s.y + s.d + o, 0), P(s.x + o, s.y + s.d + o, 0),
    ], 'rgba(0,0,0,.10)');
  }

  /* ---------- piezas ordenadas por profundidad ---------- */

  const list: StaticPiece[] = scene.statics.slice();
  const add = (dp: number, draw: (i: Iso) => void) => list.push({ dp, draw });

  // Palés ya en cuarentena.
  sim.quarantine.forEach((p, i) => {
    if (!p) return;
    const x = sim.slotX(i) - ofx;
    const y = data.quarantine.y - ofy;
    add(x + y, (i2) => pallet(i2, x, y, 'clean'));
  });

  // Cada lote en planta, con el operario que lo empuja detrás.
  for (const lot of sim.lots) {
    // Los que esperan por la misma sala se escalonan hacia atrás por su ruta,
    // para que hagan fila en vez de amontonarse en el mismo punto.
    const atras = lot.queued ? data.lot.queueGap * lot.rank : 0;
    const lx = lot.x - lot.dx * atras - ofx;
    const ly = lot.y - lot.dy * atras - ofy;
    const ox = lot.x - lot.dx * (atras + 15) - ofx;
    const oy = lot.y - lot.dy * (atras + 15) - ofy;
    // El color del palé dice de un vistazo en qué situación está.
    const token = lot.held ? 'alert' : lot.queued ? 'clean' : 'prod';
    const wear = wearAt(plant, data, ox, oy);
    add(lx + ly, (i2) => pallet(i2, lx, ly, token));
    add(ox + oy + 0.2, (i2) => person(i2, ox, oy, i2.col.value[wear]!, 0, lot.moving));
  }

  for (const w of sim.walkers) {
    const x = w.x - ofx;
    const y = w.y - ofy;
    add(x + y, (i2) => person(i2, x, y, i2.col.value[w.color]!, w.phase, w.moving, w.lab));
  }

  for (const f of sim.forklifts) {
    const fx = f.x - ofx;
    const fy = f.y - ofy;
    const wear = wearAt(plant, data, fx, fy);
    add(fx + fy, (i2) => forklift(i2, fx, fy, f.dir, i2.col.value[wear]!));
  }

  if (sim.truck.phase) {
    const tx = sim.truck.x - ofx;
    const ty = sim.truck.y - ofy;
    add(tx + ty, (i2) => truck(i2, tx, ty));
  }

  // Cajas avanzando por las cintas mientras su sala está en proceso. El trazado
  // viene de los datos: codificarlo aquí ataba el dibujo a un plano concreto.
  for (const c of data.conveyors ?? []) {
    const room = plant.byId[c.room];
    if (!room || plant.stateOf(room) !== 'prod') continue;
    for (let i = 0; i < c.count; i++) {
      const f = (iso.t * c.speed + i / c.count) % 1;
      const x = c.x0 - ofx + f * (c.x1 - c.x0);
      const y = c.y - ofy;
      const token = i % 2 ? 'carton' : 'carton2';
      add(x + y + 20, (i2) => i2.box(x, y, 9, 8, 7, c.z, token));
    }
  }

  // Escena propia del estado manual de la sala: enseres, personal y vapor.
  const salaModos = plant.byId[plant.modes.room];
  const modo = salaModos ? plant.modeState(salaModos) : null;
  if (modo) {
    for (const pr of modo.props ?? []) {
      const x = pr.x - ofx;
      const y = pr.y - ofy;
      add(x + pr.w / 2 + y + pr.d / 2, (i2) => i2.box(x, y, pr.w, pr.d, pr.h, 0, pr.token));
    }
    for (const w of sim.modeCrew) {
      const x = w.x - ofx;
      const y = w.y - ofy;
      add(x + y, (i2) => person(i2, x, y, i2.col.value[w.color]!, w.phase, w.moving));
    }
  }

  list.sort((p, q) => p.dp - q.dp);
  for (const e of list) e.draw(iso);

  /* ---------- contornos, chincheta y etiquetas ---------- */

  if (modo?.steam) {
    for (const [sx, sy] of modo.steam) steam(iso, sx - ofx, sy - ofy);
  }
  // Señalización de advertencia cuando el producto la exige.
  const tipo = salaModos ? plant.modeType(salaModos) : null;
  if (tipo?.warn && salaModos) {
    const c = salaModos.label ?? [(salaModos.x0 + salaModos.x1) / 2, (salaModos.y0 + salaModos.y1) / 2];
    const [wx, wy] = P(c[0], c[1], 54 + Math.sin(iso.t * 2.4) * 2);
    warnSign(iso, wx, wy, tipo.token);
  }

  if (hover) {
    const pts = [P(hover.x0, hover.y0, 0), P(hover.x1, hover.y0, 0), P(hover.x1, hover.y1, 0), P(hover.x0, hover.y1, 0)];
    iso.poly(pts, null, iso.col.rgba('ink', 0.55), 1.6);
  }
  if (selected) {
    const r = selected;
    const pts = [P(r.x0, r.y0, 0), P(r.x1, r.y0, 0), P(r.x1, r.y1, 0), P(r.x0, r.y1, 0)];
    g.setLineDash([7, 4]);
    iso.poly(pts, iso.col.rgba('accent', 0.08), iso.col.value['accent']!, 2.2);
    g.setLineDash([]);
  }

  const focused = sim.focusedLot();
  if (focused) {
    const [px, py] = P(focused.x - ofx, focused.y - ofy, 34 + Math.sin(iso.t * 3) * 2);
    const u = Math.max(iso.view.s, 0.7);
    g.fillStyle = iso.col.value['accent']!;
    g.beginPath();
    g.arc(px, py - 11 * u, 7 * u, Math.PI * 0.8, Math.PI * 2.2);
    g.lineTo(px, py);
    g.closePath();
    g.fill();
    g.fillStyle = iso.col.value['truck-box']!;
    g.beginPath();
    g.arc(px, py - 11 * u, 2.6 * u, 0, 7);
    g.fill();
  }

  // Una etiqueta solo se dibuja si la sala es más ancha en pantalla que el
  // propio rótulo. Sin esto, al alejarse se amontonan todas y no se lee nada.
  g.font = LABEL_FONT;
  for (const r of plant.rooms) {
    if (!r.short) continue;
    const anchoSala = (r.x1 - r.x0 + (r.y1 - r.y0)) * COS * iso.view.s;
    if (anchoSala < g.measureText(r.short).width + 22) continue;
    const c = r.label ?? [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
    const [px, py] = P(c[0], c[1], 0);
    const s = plant.stateOf(r);
    pill(iso, r.short, px, py, s === 'ok' ? null : s);
  }
  // Los rótulos de zona desaparecen juntos por debajo de cierta escala.
  if (iso.view.s >= MARKER_MIN_SCALE) {
    for (const m of data.markers) {
      const [px, py] = P(m.x - ofx, m.y - ofy, 0);
      pill(iso, m.text, px, py, m.token);
    }
  }
}

/** Columna de vapor, para la sala en limpieza. */
function steam(iso: Iso, x: number, y: number): void {
  const g = iso.g;
  const u = iso.view.s;
  for (let i = 0; i < 5; i++) {
    const f = (iso.t * 0.4 + i / 5) % 1;
    const [px, py] = iso.p(x, y, 4 + f * 46);
    g.fillStyle = iso.col.rgba('truck-box', 0.4 * (1 - f));
    g.beginPath();
    g.arc(px + Math.sin(f * 5 + i) * 4 * u, py, (3 + f * 7) * u, 0, 7);
    g.fill();
  }
}

/** Triángulo de advertencia flotando sobre la sala. */
function warnSign(iso: Iso, sx: number, sy: number, token: string): void {
  const g = iso.g;
  const r = 13;
  g.beginPath();
  g.moveTo(sx, sy - r);
  g.lineTo(sx + r * 0.92, sy + r * 0.62);
  g.lineTo(sx - r * 0.92, sy + r * 0.62);
  g.closePath();
  g.fillStyle = iso.col.value[token]!;
  g.fill();
  g.strokeStyle = iso.col.rgba('surface', 0.9);
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = iso.col.value['surface']!;
  g.font = 'bold 13px system-ui,sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', sx, sy + 3);
}

/** Etiqueta flotante con punto de color opcional. */
function pill(iso: Iso, text: string, sx: number, sy: number, token: string | null): void {
  const g = iso.g;
  g.font = LABEL_FONT;
  const tw = g.measureText(text).width;
  const w = tw + (token ? 19 : 12);
  const h = 18;
  const x = sx - w / 2;
  const y = sy - h / 2;

  g.fillStyle = iso.col.rgba('surface', 0.92);
  iso.roundRect(x, y, w, h, 9);
  g.fill();
  g.strokeStyle = iso.col.value['line']!;
  g.lineWidth = 1;
  g.stroke();

  if (token) {
    g.fillStyle = iso.col.value[token]!;
    g.beginPath();
    g.arc(x + 9, sy, 3.2, 0, 7);
    g.fill();
  }
  g.fillStyle = iso.col.value['ink']!;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(text, x + (token ? 15 : 6), sy + 0.5);
}
