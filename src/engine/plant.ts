/**
 * Modelo de salas: traslada el plano al origen, resuelve qué sala hay en un punto
 * y deduce la adyacencia a partir de las puertas (la usa el contagio de desviaciones).
 */

import type {
  DoorData, PlantData, Room, RoomModeState, RoomModeType, RoomModes, RoomState,
} from './types';

export const STATE_LABEL: Record<RoomState, string> = {
  prod: 'En proceso',
  ok: 'Operativa',
  clean: 'En limpieza',
  off: 'Parada',
  risk: 'En riesgo',
  alert: 'Desviación',
};

/** Puerta con las coordenadas ya trasladadas. */
export interface Door { axis: 'h' | 'v'; c: number; a: number; b: number }

export class Plant {
  readonly rooms: Room[];
  readonly byId: Record<string, Room> = {};
  readonly doors: Door[];
  readonly origin: { x: number; y: number };
  readonly modes: RoomModes;

  constructor(data: PlantData) {
    const { x: ofx, y: ofy } = data.meta.origin;
    this.origin = data.meta.origin;
    this.modes = data.roomModes;

    this.rooms = data.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      short: r.short,
      x0: r.x0 - ofx,
      y0: r.y0 - ofy,
      x1: r.x1 - ofx,
      y1: r.y1 - ofy,
      area: r.area,
      kind: r.kind,
      label: r.label ? [r.label[0] - ofx, r.label[1] - ofy] : null,
      base: r.base ?? 'ok',
      inc: null,
      act: false,
      clean: 0,
      mode: null,
      product: null,
      adj: new Set<Room>(),
      // Solo las salas de producción están instrumentadas.
      sens: r.kind === 'prod'
        ? { t: 21 + Math.random() * 1.2, rh: 44 + Math.random() * 5, dp: 10 + Math.random() * 4 }
        : null,
    }));
    for (const r of this.rooms) this.byId[r.id] = r;

    const sala = this.byId[this.modes.room];
    if (sala) {
      sala.mode = this.modes.default.state;
      sala.product = this.modes.default.type;
    }

    this.doors = data.doors.map((d: DoorData) => {
      const h = d.axis === 'h';
      return {
        axis: d.axis,
        c: d.c - (h ? ofy : ofx),
        a: d.a - (h ? ofx : ofy),
        b: d.b - (h ? ofx : ofy),
      };
    });

    // Cada puerta une las dos salas que tiene a un lado y a otro.
    for (const d of this.doors) {
      const m = (d.a + d.b) / 2;
      const A = d.axis === 'h' ? this.roomAt(m, d.c - 2) : this.roomAt(d.c - 2, m);
      const B = d.axis === 'h' ? this.roomAt(m, d.c + 2) : this.roomAt(d.c + 2, m);
      if (A && B && A !== B) {
        A.adj.add(B);
        B.adj.add(A);
      }
    }
  }

  /** Sala que contiene el punto, en coordenadas de plano trasladadas. */
  roomAt(x: number, y: number): Room | null {
    for (const r of this.rooms) {
      if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return r;
    }
    return null;
  }

  /**
   * Estado efectivo. Una desviación manda sobre todo; después el estado elegido
   * a mano, que es información de planta y pesa más que lo que deduzca la
   * simulación; y por último la actividad y el estado base.
   */
  stateOf(r: Room): RoomState {
    if (r.inc) return r.inc;
    const manual = this.modeState(r);
    if (manual) return manual.token as RoomState;
    return r.act ? 'prod' : r.base;
  }

  /** Definición del estado manual de una sala, si tiene uno puesto. */
  modeState(r: Room): RoomModeState | null {
    if (!r.mode || this.modes.room !== r.id) return null;
    return this.modes.states.find((s) => s.id === r.mode) ?? null;
  }

  /** Tipo de producto de una sala, si procede. */
  modeType(r: Room): RoomModeType | null {
    if (!r.product || this.modes.room !== r.id) return null;
    return this.modes.types.find((t) => t.id === r.product) ?? null;
  }
}
