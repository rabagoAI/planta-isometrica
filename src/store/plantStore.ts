/**
 * Store externo que alimenta el motor a ~4 Hz. Los paneles se suscriben con
 * useSyncExternalStore, así el canvas puede dibujar a 60 fps sin arrastrar
 * a React en cada fotograma.
 */

import { useSyncExternalStore } from 'react';
import type { PlantSnapshot } from '../engine/types';

type Listener = () => void;

export class PlantStore {
  private snapshot: PlantSnapshot | null = null;
  private listeners = new Set<Listener>();

  /** La llama el motor en cada tick de interfaz. */
  set = (s: PlantSnapshot): void => {
    this.snapshot = s;
    for (const l of this.listeners) l();
  };

  get = (): PlantSnapshot | null => this.snapshot;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
}

/** Snapshot actual, o null hasta que el motor publique el primero. */
export function usePlantSnapshot(store: PlantStore): PlantSnapshot | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
