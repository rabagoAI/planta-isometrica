/**
 * Proyección isométrica y primitivas de dibujo sobre canvas 2D.
 * Coordenadas de entrada: px del plano ya trasladados al origen (ver meta.origin).
 */

import type { Colors } from './colors';

const COS = Math.cos(Math.PI / 6);
/** Inclinación de referencia: la isometría clásica del prototipo. */
export const DEFAULT_TILT = 0.5;

export type Point = [number, number];

/** Cámara: escala y desplazamiento en pantalla. */
export interface View {
  s: number;
  ox: number;
  oy: number;
}

/** Contexto de dibujo que comparten todas las primitivas. */
export class Iso {
  g: CanvasRenderingContext2D;
  col: Colors;
  view: View = { s: 0.7, ox: 0, oy: 0 };
  /** Reloj de animación en segundos; lo avanza el bucle. */
  t = 0;
  /**
   * Factor vertical de la proyección. 0.5 es la isometría clásica; bajarlo
   * aplana el plano, que así ocupa menos alto en pantalla.
   */
  tilt: number = DEFAULT_TILT;

  constructor(g: CanvasRenderingContext2D, col: Colors) {
    this.g = g;
    this.col = col;
  }

  /** Plano (x, y) y altura z → pantalla. */
  p(x: number, y: number, z = 0): Point {
    const { s, ox, oy } = this.view;
    return [(x - y) * COS * s + ox, (x + y) * this.tilt * s - z * s + oy];
  }

  /** Pantalla → plano. Inversa de `p` a cota 0. */
  toPlan(sx: number, sy: number): { x: number; y: number } {
    const { s, ox, oy } = this.view;
    const a = (sx - ox) / (COS * s);
    const b = (sy - oy) / (this.tilt * s);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  poly(pts: Point[], fill?: string | null, stroke?: string | null, lw = 1): void {
    const g = this.g;
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i]!;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
      // Sin contorno, las caras contiguas dejan costuras de antialias.
      if (!stroke) {
        g.strokeStyle = fill;
        g.lineWidth = 0.6;
        g.stroke();
      }
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  }

  /** Caja con las tres caras visibles y colores explícitos. */
  boxC(
    x: number, y: number, w: number, d: number, h: number, z0: number,
    top: string, left: string, right: string,
  ): void {
    const z1 = z0 + h;
    const P = this.p.bind(this);
    this.poly([P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x, y + d, z1)], left);
    this.poly([P(x + w, y, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x + w, y, z1)], right);
    this.poly([P(x, y, z1), P(x + w, y, z1), P(x + w, y + d, z1), P(x, y + d, z1)], top);
  }

  /** Caja sombreada a partir de un token de color. */
  box(x: number, y: number, w: number, d: number, h: number, z0: number, token: string): void {
    this.boxC(x, y, w, d, h, z0, this.col.value[token]!, this.col.shade(token, 0.86), this.col.shade(token, 0.72));
  }

  /** Traza (sin pintar) la elipse que proyecta un círculo del plano. */
  circlePath(cx: number, cy: number, r: number, z: number): void {
    const g = this.g;
    g.beginPath();
    for (let i = 0; i <= 36; i++) {
      const a = (Math.PI * 2 * i) / 36;
      const [x, y] = this.p(cx + r * Math.cos(a), cy + r * Math.sin(a), z);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
  }

  /** Depósito cilíndrico. Si `active`, burbujea y suelta vapor. */
  cyl(cx: number, cy: number, r: number, h: number, z0: number, token: string, active: boolean, ph = 0): void {
    const g = this.g;
    const { s } = this.view;
    const N = 28;
    const bot: Point[] = [];
    const top: Point[] = [];
    for (let i = 0; i <= N; i++) {
      const a = -Math.PI / 4 + (Math.PI * i) / N;
      bot.push(this.p(cx + r * Math.cos(a), cy + r * Math.sin(a), z0));
      top.push(this.p(cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + h));
    }
    // Degradado horizontal para dar volumen a la pared curva.
    const sx = this.p(cx, cy, z0)[0];
    const ext = r * 1.2247 * s;
    const gr = g.createLinearGradient(sx - ext, 0, sx + ext, 0);
    gr.addColorStop(0, this.col.shade(token, 1.14));
    gr.addColorStop(0.55, this.col.value[token]!);
    gr.addColorStop(1, this.col.shade(token, 0.7));

    g.beginPath();
    for (let i = 0; i < bot.length; i++) {
      const [x, y] = bot[i]!;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    for (let i = top.length - 1; i >= 0; i--) g.lineTo(top[i]![0], top[i]![1]);
    g.closePath();
    g.fillStyle = gr;
    g.fill();

    this.circlePath(cx, cy, r, z0 + h);
    g.fillStyle = this.col.shade(token, 1.28);
    g.fill();

    if (!active) return;
    const k = 0.3 + 0.22 * Math.sin(this.t * 4 + ph);
    this.circlePath(cx, cy, r * 0.8, z0 + h);
    g.fillStyle = this.col.rgba('prod', k);
    g.fill();
    for (let i = 0; i < 3; i++) {
      const f = (this.t * 0.5 + i / 3 + ph) % 1;
      const [px, py] = this.p(cx, cy, z0 + h + 4 + f * 26);
      g.fillStyle = this.col.rgba('truck-box', 0.55 * (1 - f));
      g.beginPath();
      g.arc(px + Math.sin(f * 6 + i) * 2 * s, py, (2.6 + f * 4) * s, 0, 7);
      g.fill();
    }
  }

  /** Rectángulo redondeado en coordenadas de pantalla. */
  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const g = this.g;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
}
