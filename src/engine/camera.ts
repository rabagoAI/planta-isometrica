/**
 * Cámara del plano: cuánto se acerca y qué punto queda en el centro.
 *
 * El centro se guarda en el espacio proyectado de la escena (el mismo de
 * `Bounds`), no en coordenadas de plano, porque así centrar y recortar son
 * cuentas directas sin volver a invertir la proyección.
 */

import type { Bounds } from './bounds';
import type { View } from './iso';

/** Zoom 1 = el plano entra entero. Por debajo no tiene sentido. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
/** Suavizado de los desplazamientos con destino (doble clic, reencuadre). */
const EASE = 9;

export class Camera {
  zoom = MIN_ZOOM;
  /** Punto de la escena que queda en el centro del lienzo. */
  cx = 0;
  cy = 0;

  private bounds: Bounds;
  private tZoom = MIN_ZOOM;
  private tCx = 0;
  private tCy = 0;

  constructor(bounds: Bounds) {
    this.bounds = bounds;
    this.reset(true);
  }

  get atFit(): boolean { return this.zoom <= MIN_ZOOM + 1e-4 }
  get atMax(): boolean { return this.zoom >= MAX_ZOOM - 1e-4 }
  /** Hay destino pendiente: el bucle debe seguir interpolando. */
  get animating(): boolean {
    return Math.abs(this.zoom - this.tZoom) > 1e-4
      || Math.abs(this.cx - this.tCx) > 0.05
      || Math.abs(this.cy - this.tCy) > 0.05;
  }

  /** Al cambiar la inclinación cambian los límites y hay que reencuadrar. */
  setBounds(b: Bounds): void {
    this.bounds = b;
    this.reset(true);
  }

  /** Vuelve a la vista general. `now` salta sin transición. */
  reset(now = false): void {
    this.tZoom = MIN_ZOOM;
    this.tCx = (this.bounds.minX + this.bounds.maxX) / 2;
    this.tCy = (this.bounds.minY + this.bounds.maxY) / 2;
    if (now) { this.zoom = this.tZoom; this.cx = this.tCx; this.cy = this.tCy; }
  }

  /** Escala a la que el plano entra completo en el ancho disponible. */
  fitScale(width: number, pad: number): number {
    return (width - 2 * pad) / (this.bounds.maxX - this.bounds.minX);
  }

  /** Vista lista para dibujar, ya recortada. */
  view(width: number, height: number, pad: number): View {
    const s = this.fitScale(width, pad) * this.zoom;
    this.clamp(width, height, s);
    return { s, ox: width / 2 - this.cx * s, oy: height / 2 - this.cy * s };
  }

  /**
   * Acerca o aleja manteniendo quieto el punto que hay bajo (ax, ay).
   * Sin ancla se usa el centro del lienzo.
   */
  zoomBy(factor: number, width: number, height: number, pad: number, ax?: number, ay?: number): void {
    const fit = this.fitScale(width, pad);
    const s0 = fit * this.zoom;
    const z = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (z === this.zoom) return;
    const s1 = fit * z;
    const k = 1 / s0 - 1 / s1;
    this.zoom = z;
    this.cx += ((ax ?? width / 2) - width / 2) * k;
    this.cy += ((ay ?? height / 2) - height / 2) * k;
    this.settle();
  }

  /** Arrastre: el desplazamiento viene en píxeles de pantalla. */
  panBy(dx: number, dy: number, s: number): void {
    this.cx -= dx / s;
    this.cy -= dy / s;
    this.settle();
  }

  /**
   * Encuadra un rectángulo de la escena, con transición. `limit` recorta el
   * acercamiento: una sala pequeña llenaría el lienzo y se perdería el contexto.
   */
  focus(rect: Bounds, width: number, height: number, pad: number, limit = MAX_ZOOM): void {
    const margin = pad * 3;
    const w = Math.max(1, rect.maxX - rect.minX);
    const h = Math.max(1, rect.maxY - rect.minY);
    const s = Math.min((width - 2 * margin) / w, (height - 2 * margin) / h);
    this.tZoom = clamp(s / this.fitScale(width, pad), MIN_ZOOM, Math.min(MAX_ZOOM, limit));
    this.tCx = (rect.minX + rect.maxX) / 2;
    this.tCy = (rect.minY + rect.maxY) / 2;
  }

  /** Interpola hacia el destino. Devuelve true si la vista ha cambiado. */
  animate(dt: number): boolean {
    if (!this.animating) return false;
    const k = 1 - Math.exp(-dt * EASE);
    this.zoom += (this.tZoom - this.zoom) * k;
    this.cx += (this.tCx - this.cx) * k;
    this.cy += (this.tCy - this.cy) * k;
    return true;
  }

  /** Los gestos directos no interpolan: el destino es la posición actual. */
  private settle(): void {
    this.tZoom = this.zoom;
    this.tCx = this.cx;
    this.tCy = this.cy;
  }

  /**
   * Evita que el plano se despegue de los bordes. Si cabe entero en un eje,
   * se centra en ese eje; si no, se impide que asome el fondo.
   */
  private clamp(width: number, height: number, s: number): void {
    const b = this.bounds;
    if ((b.maxX - b.minX) * s <= width) {
      this.cx = (b.minX + b.maxX) / 2;
    } else {
      this.cx = clamp(this.cx, b.minX + width / (2 * s), b.maxX - width / (2 * s));
    }
    if ((b.maxY - b.minY) * s <= height) {
      this.cy = (b.minY + b.maxY) / 2;
    } else {
      this.cy = clamp(this.cy, b.minY + height / (2 * s), b.maxY - height / (2 * s));
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
