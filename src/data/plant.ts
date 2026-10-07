/**
 * Elige qué plano se compila.
 *
 * `plant.local.json` es el plano real de la instalación: información sensible,
 * fuera de git y fuera de cualquier build público. Si existe, manda. Si no
 * —en un clon recién hecho o en el despliegue—, se usa la planta de ejemplo.
 *
 * `import.meta.glob` devuelve un objeto vacío cuando el patrón no casa con
 * nada, así que la ausencia del fichero no rompe la compilación.
 */

import demo from './plant.demo.json';
import type { PlantData } from '../engine/types';

const locales = import.meta.glob<{ default: unknown }>('./plant.local.json', { eager: true });
const local = Object.values(locales)[0]?.default;

/** True cuando se está mostrando la planta ficticia, no la real. */
export const usingDemoPlant = local === undefined;

export const plantData = (local ?? demo) as unknown as PlantData;
