/**
 * Encuadre de la escena. Proyecta todo lo que se dibuja (solar, muros, equipos,
 * arbolado, camión y recorridos) y devuelve el rectángulo que ocupa en pantalla
 * a escala 1. Con esto el canvas se ajusta solo cuando cambia la inclinación,
 * en vez de depender de constantes calculadas a mano para un ángulo concreto.
 */

import type { Plant } from './plant';
import type { Scene } from './scene';
import type { PlantData } from './types';

const COS = Math.cos(Math.PI / 6);

/**
 * Proyecta un punto del plano al espacio de la escena, sin escala ni origen.
 * Es el espacio en el que se expresan los límites y el centro de la cámara.
 */
export function unitPoint(x: number, y: number, z: number, tilt: number): [number, number] {
  return [(x - y) * COS, (x + y) * tilt - z];
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Holgura para etiquetas y contornos, que se dibujan en píxeles de pantalla. */
const MARGIN = 12;
/** Una persona de pie sobresale esto por encima de su punto de apoyo. */
const PERSON_UP = 28;
const PERSON_SIDE = 7;

export function sceneBounds(data: PlantData, plant: Plant, scene: Scene, tilt: number): Bounds {
  const { x: ofx, y: ofy } = data.meta.origin;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  /** Añade un punto del plano ya trasladado, con holgura en pantalla. */
  const add = (x: number, y: number, z: number, padSide = 0, padUp = 0): void => {
    const [sx, sy] = unitPoint(x, y, z, tilt);
    if (sx - padSide < minX) minX = sx - padSide;
    if (sx + padSide > maxX) maxX = sx + padSide;
    if (sy - padUp < minY) minY = sy - padUp;
    if (sy > maxY) maxY = sy;
  };

  const addBox = (
    x: number, y: number, w: number, d: number, z0: number, z1: number,
    padSide = 0, padUp = 0,
  ): void => {
    for (const px of [x, x + w]) {
      for (const py of [y, y + d]) {
        for (const pz of [z0, z1]) add(px, py, pz, padSide, padUp);
      }
    }
  };

  // Solar.
  const g = data.ground;
  addBox(g.x, g.y, g.w, g.d, g.z0, g.z0 + g.h);

  // Suelos elevados.
  for (const pl of data.platforms) addBox(pl.x - ofx, pl.y - ofy, pl.w, pl.d, 0, pl.h);

  // Salas, a la altura del muro más alto.
  const wallTop = Math.max(
    data.walls.defaultHeight,
    ...data.walls.overrides.map((o) => o.height),
  );
  for (const r of plant.rooms) addBox(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 0, wallTop);

  // Equipos.
  for (const item of data.equipment) {
    if (!item.type) continue;
    const x = item.x - ofx;
    const y = item.y - ofy;
    switch (item.type) {
      case 'box':
        addBox(x, y, item.w, item.d, item.z0 ?? 0, (item.z0 ?? 0) + item.h);
        break;
      case 'cyl':
        addBox(x - item.r, y - item.r, 2 * item.r, 2 * item.r, 0, item.h);
        break;
      case 'rack': {
        const w = item.axis === 'x' ? item.len : item.dep;
        const d = item.axis === 'y' ? item.len : item.dep;
        addBox(x, y, w, d, 0, 28);
        break;
      }
      case 'stack':
        addBox(x - 9, y - 9, 18, 18, 0, 13);
        break;
      case 'tree':
        // La copa es una elipse en pantalla alrededor del punto a cota 26.
        add(x, y, 26, 12, 14);
        add(x, y, 0, 12, 0);
        break;
      case 'seated':
        add(x, y, 0, PERSON_SIDE, PERSON_UP);
        break;
    }
  }

  // Sombras: se desplazan en el plano según la altura de la pieza.
  for (const s of scene.shadows) {
    const o = s.h * 0.45;
    addBox(s.x + o, s.y + o, s.w, s.d, 0, 0);
  }

  // Camión en el muelle (al salir se va fuera de cuadro a propósito).
  const t = data.truck;
  addBox(t.dockX - ofx - 34, t.y - ofy - 13, 62, 27, 0, 32);

  // Recorrido del lote, huecos de cuarentena, operarios y toro.
  for (const step of data.lot.route) {
    const x = (step.xFromSlot ? data.quarantine.slotX0 : step.x!) - ofx;
    add(x, step.y - ofy, 0, 10, PERSON_UP);
  }
  data.quarantine.slots.forEach((_, i) => {
    const x = data.quarantine.slotX0 + i * data.quarantine.slotStep - ofx;
    addBox(x - 9, data.quarantine.y - ofy - 9, 18, 18, 0, 15);
  });
  for (const w of data.walkers) {
    for (const p of w.points) add(p[0] - ofx, p[1] - ofy, 0, PERSON_SIDE, PERSON_UP);
  }
  for (const f of data.forklifts) {
    for (const fy of [f.y0, f.y1]) addBox(f.x - ofx - 6, fy - ofy - 22, 12, 36, 0, 33);
  }

  return {
    minX: minX - MARGIN,
    maxX: maxX + MARGIN,
    minY: minY - MARGIN,
    maxY: maxY + MARGIN,
  };
}
