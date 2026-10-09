/**
 * PlantEngine: dueño del canvas, del bucle de animación y del estado de la
 * simulación. No importa React. Publica un snapshot ~4 veces por segundo
 * mediante el callback `onSnapshot`; el dibujo va directo al canvas y nunca
 * pasa por el estado de React.
 */

import { Colors } from './colors';
import { Iso } from './iso';
import { Plant, STATE_LABEL } from './plant';
import { Simulation } from './sim';
import { buildScene } from './scene';
import { sceneBounds, unitPoint } from './bounds';
import { Camera } from './camera';
import { drawFrame } from './draw';
import { plantData } from '../data/plant';
import type { Bounds } from './bounds';
import type { Scene } from './scene';
import type { PlantData, PlantSnapshot, Room } from './types';

export { STATE_LABEL } from './plant';
export type * from './types';

const DATA = plantData as unknown as PlantData;

const PAD = 18;
/** Alto mínimo del lienzo: en pantallas estrechas se explora con zoom. */
const MIN_HEIGHT = 340;
/** Un gesto que se mueve menos que esto se interpreta como clic, no arrastre. */
const DRAG_SLOP = 4;
const WHEEL_STEP = 1.0015;
const BUTTON_STEP = 1.6;
/** Límites de inclinación admitidos, para no degenerar la proyección. */
const TILT_RANGE = { min: 0.18, max: 0.5 };

/** Periodo de publicación del snapshot a los paneles: 4 Hz. */
const UI_PERIOD = 0.25;

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** Contenedor con scroll horizontal; de él se toma la anchura disponible. */
  viewport: HTMLElement;
  onSnapshot: (s: PlantSnapshot) => void;
  /** Avisa del cambio de sala al pasar el puntero, para el tooltip. */
  onHover: (info: { name: string; state: string; x: number; y: number } | null) => void;
  /** Factor vertical de la proyección; por defecto el del plano. */
  tilt?: number;
}

export class PlantEngine {
  readonly plant: Plant;
  readonly sim: Simulation;
  readonly data: PlantData = DATA;

  private colors = new Colors();
  private iso: Iso;
  private scene: Scene;
  private bounds: Bounds;
  private camera: Camera;
  private opts: EngineOptions;

  private width = 1000;
  private height = 600;
  private dpr = 1;

  private hover: Room | null = null;
  private selected: Room;

  /** Punteros activos, para distinguir arrastre de pellizco. */
  private pointers = new Map<number, { x: number; y: number }>();
  private dragging = false;
  /** Distancia recorrida desde pointerdown; separa el clic del arrastre. */
  private dragDist = 0;
  private pinchDist = 0;

  /** Recorrido guiado: parada actual y segundos transcurridos en ella. */
  private tour = { active: false, index: 0, elapsed: 0 };

  private raf = 0;
  private lastTs = 0;
  private uiAcc = 0;
  private stopped = false;

  private cleanup: (() => void)[] = [];

  constructor(opts: EngineOptions) {
    this.opts = opts;
    const g = opts.canvas.getContext('2d');
    if (!g) throw new Error('El canvas 2D no está disponible');

    this.colors.read();
    this.iso = new Iso(g, this.colors);
    this.plant = new Plant(DATA);
    this.sim = new Simulation(DATA, this.plant);
    this.scene = buildScene(DATA, this.plant);
    this.iso.tilt = clampTilt(opts.tilt ?? DATA.view.tilt);
    this.bounds = sceneBounds(DATA, this.plant, this.scene, this.iso.tilt);
    this.camera = new Camera(this.bounds);
    this.selected = this.plant.byId[DATA.incident.room]!;

    // Con movimiento reducido, se arranca en pausa y el plano queda quieto.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.sim.playing = false;

    this.bind();
    this.resize();
    this.publish();
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ---------- ciclo de vida ---------- */

  private bind(): void {
    const { canvas, viewport } = this.opts;

    /** Posición del puntero relativa al lienzo. */
    const local = (ev: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };

    const onDown = (ev: PointerEvent) => {
      this.pointers.set(ev.pointerId, local(ev));
      if (this.pointers.size === 2) {
        this.pinchDist = this.pointerGap();
        this.dragging = false;
      } else if (this.pointers.size === 1) {
        this.dragging = true;
        this.dragDist = 0;
        canvas.setPointerCapture(ev.pointerId);
      }
      this.syncCursor();
    };

    const onMove = (ev: PointerEvent) => {
      const pos = local(ev);
      const prev = this.pointers.get(ev.pointerId);
      if (prev) this.pointers.set(ev.pointerId, pos);

      // Pellizco con dos dedos.
      if (this.pointers.size === 2) {
        const gap = this.pointerGap();
        if (this.pinchDist > 0 && gap > 0) {
          this.cancelTour();
          const mid = this.pointerMid();
          this.camera.zoomBy(gap / this.pinchDist, this.width, this.height, PAD, mid.x, mid.y);
          this.applyView();
        }
        this.pinchDist = gap;
        return;
      }

      if (this.dragging && prev) {
        const dx = pos.x - prev.x;
        const dy = pos.y - prev.y;
        this.dragDist += Math.hypot(dx, dy);
        if (this.dragDist > DRAG_SLOP) this.cancelTour();
        // Con el plano entero a la vista no hay nada que desplazar.
        if (!this.camera.atFit) {
          this.camera.panBy(dx, dy, this.iso.view.s);
          this.applyView();
        }
        return;
      }

      const p = this.iso.toPlan(pos.x, pos.y);
      this.hover = this.plant.roomAt(p.x, p.y);
      this.syncCursor();
      this.opts.onHover(this.hover
        ? { name: this.hover.name, state: STATE_LABEL[this.plant.stateOf(this.hover)], x: pos.x, y: pos.y }
        : null);
    };

    const onUp = (ev: PointerEvent) => {
      this.pointers.delete(ev.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 0) this.dragging = false;
      this.syncCursor();
    };

    const onLeave = () => { this.hover = null; this.opts.onHover(null); this.syncCursor(); };

    const onClick = (ev: MouseEvent) => {
      // Un arrastre termina en click: solo cuenta si apenas se movió.
      if (this.dragDist > DRAG_SLOP) return;
      const pos = local(ev);
      const p = this.iso.toPlan(pos.x, pos.y);
      const r = this.plant.roomAt(p.x, p.y);
      if (r) { this.selected = r; this.publish(); }
    };

    const onDoubleClick = (ev: MouseEvent) => {
      const pos = local(ev);
      const p = this.iso.toPlan(pos.x, pos.y);
      const r = this.plant.roomAt(p.x, p.y);
      if (r) { this.selected = r; this.focusRoom(r.id); }
      else this.resetView();
    };

    const onWheel = (ev: WheelEvent) => {
      // Con el plano entero a la vista, la rueda sola desplaza la página; hace
      // falta Ctrl (o el pellizco del panel táctil). Ya acercado, la rueda manda.
      if (this.camera.atFit && !ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      this.cancelTour();
      const pos = local(ev);
      this.camera.zoomBy(Math.pow(WHEEL_STEP, -ev.deltaY), this.width, this.height, PAD, pos.x, pos.y);
      this.applyView();
    };

    const onKey = (ev: KeyboardEvent) => {
      const step = 60;
      const handled = () => { ev.preventDefault(); this.applyView(); this.publish(); };
      switch (ev.key) {
        case 'ArrowLeft': this.camera.panBy(step, 0, this.iso.view.s); return handled();
        case 'ArrowRight': this.camera.panBy(-step, 0, this.iso.view.s); return handled();
        case 'ArrowUp': this.camera.panBy(0, step, this.iso.view.s); return handled();
        case 'ArrowDown': this.camera.panBy(0, -step, this.iso.view.s); return handled();
        case '+': case '=': this.camera.zoomBy(BUTTON_STEP, this.width, this.height, PAD); return handled();
        case '-': case '_': this.camera.zoomBy(1 / BUTTON_STEP, this.width, this.height, PAD); return handled();
        case 'Escape': case '0':
          if (this.tour.active) this.stopTour(); else this.resetView();
          return ev.preventDefault();
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
    });

    // El canvas se redimensiona con el contenedor.
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(viewport);
    this.cleanup.push(() => ro.disconnect());

    // Releer la paleta cuando cambia el tema (atributo o preferencia del sistema).
    const reread = () => this.colors.read();
    const mo = new MutationObserver(reread);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', reread);
    this.cleanup.push(() => { mo.disconnect(); mq.removeEventListener('change', reread); });
  }

  destroy(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
  }

  /* ---------- medidas ---------- */

  resize(): void {
    const cw = Math.max(this.opts.viewport.clientWidth, 320);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    // El alto del lienzo sale del encuadre a escala de ajuste, para que con
    // el zoom al mínimo se vea el plano entero sin recortes.
    const b = this.bounds;
    const fit = this.camera.fitScale(cw, PAD);
    const necesario = Math.ceil((b.maxY - b.minY) * fit + 2 * PAD);
    // El mínimo da margen para acercarse, pero se recorta por dos lados: nunca
    // más de media pantalla —en un móvil en horizontal el plano se iría fuera de
    // cuadro— ni más del doble de lo que ocupa el plano, para no dejar el lienzo
    // medio vacío cuando la planta es mucho más ancha que alta.
    const holgura = Math.min(MIN_HEIGHT, Math.round(window.innerHeight * 0.5), necesario * 2);
    const ch = Math.max(necesario, holgura);

    const canvas = this.opts.canvas;
    canvas.width = Math.round(cw * this.dpr);
    canvas.height = Math.round(ch * this.dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    this.width = cw;
    this.height = ch;
    this.applyView();
  }

  /** Vuelca la cámara sobre la proyección. */
  private applyView(): void {
    this.iso.view = this.camera.view(this.width, this.height, PAD);
    this.syncCursor();
  }

  private syncCursor(): void {
    const canvas = this.opts.canvas;
    const fit = this.camera.atFit;
    canvas.style.cursor = this.dragging ? 'grabbing' : fit ? (this.hover ? 'pointer' : 'default') : 'grab';
    // Con el plano entero a la vista, el dedo debe seguir desplazando la página.
    canvas.style.touchAction = fit ? 'auto' : 'none';
  }

  /* ---------- controles que usan los paneles ---------- */

  /** Distancia entre los dos punteros activos, para el pellizco. */
  private pointerGap(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private pointerMid(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: this.width / 2, y: this.height / 2 };
  }

  zoomIn(): void {
    this.camera.zoomBy(BUTTON_STEP, this.width, this.height, PAD);
    this.applyView();
    this.publish();
  }

  zoomOut(): void {
    this.camera.zoomBy(1 / BUTTON_STEP, this.width, this.height, PAD);
    this.applyView();
    this.publish();
  }

  /** Vuelve a la vista general, con transición. */
  resetView(): void {
    this.camera.reset();
    this.publish();
  }

  /** Encuadra una sala: centra y acerca hasta que llena el lienzo. */
  focusRoom(id: string, zoomLimit?: number): void {
    const r = this.plant.byId[id];
    if (!r) return;
    const wallTop = Math.max(DATA.walls.defaultHeight, ...DATA.walls.overrides.map((o) => o.height));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [r.x0, r.x1]) {
      for (const y of [r.y0, r.y1]) {
        for (const z of [0, wallTop]) {
          const [ux, uy] = unitPoint(x, y, z, this.iso.tilt);
          minX = Math.min(minX, ux); maxX = Math.max(maxX, ux);
          minY = Math.min(minY, uy); maxY = Math.max(maxY, uy);
        }
      }
    }
    this.camera.focus({ minX, maxX, minY, maxY }, this.width, this.height, PAD, zoomLimit);
    this.publish();
  }

  /** Cambia la inclinación: reencuadra y redimensiona el canvas. */
  setTilt(v: number): void {
    this.iso.tilt = clampTilt(v);
    this.bounds = sceneBounds(DATA, this.plant, this.scene, this.iso.tilt);
    this.camera.setBounds(this.bounds);
    this.resize();
  }

  get tilt(): number { return this.iso.tilt; }

  togglePlaying(): void { this.sim.playing = !this.sim.playing; this.publish(); }
  setSpeed(v: number): void { this.sim.speed = v; this.publish(); }
  toggleIncident(): void { this.sim.toggleIncident(); this.publish(); }
  selectRoom(id: string): void {
    const r = this.plant.byId[id];
    if (!r) return;
    this.selected = r;
    // Si ya estamos acercados, llevar la vista a la sala elegida.
    if (!this.camera.atFit) this.focusRoom(id);
    else this.publish();
  }

  /* ---------- recorrido guiado ---------- */

  startTour(): void {
    this.tour = { active: true, index: 0, elapsed: 0 };
    this.applyTourStop();
  }

  stopTour(): void {
    if (!this.tour.active) return;
    this.tour.active = false;
    this.camera.reset();
    this.publish();
  }

  /**
   * Corta el recorrido dejando la cámara donde está: el usuario ha tomado el
   * mando con un gesto y sería molesto devolverle la vista de golpe.
   */
  private cancelTour(): void {
    if (!this.tour.active) return;
    this.tour.active = false;
    this.publish();
  }

  /** Salta a una parada. Fuera de rango, termina el recorrido. */
  tourGo(index: number): void {
    if (!this.tour.active) return;
    if (index < 0 || index >= DATA.tour.stops.length) { this.stopTour(); return; }
    this.tour.index = index;
    this.tour.elapsed = 0;
    this.applyTourStop();
  }

  private applyTourStop(): void {
    const stop = DATA.tour.stops[this.tour.index]!;
    if (stop.room) {
      const r = this.plant.byId[stop.room];
      if (r) this.selected = r;
      this.focusRoom(stop.room, DATA.tour.zoomLimit);
    } else {
      this.camera.reset();
      this.publish();
    }
  }

  /** Pone a mano el estado de una sala: limpia, en limpieza, sucia, parada. */
  setRoomMode(roomId: string, stateId: string): void {
    const r = this.plant.byId[roomId];
    if (!r || this.plant.modes.room !== roomId) return;
    if (r.mode === stateId) return;
    r.mode = stateId;
    this.sim.rebuildModeCrew();
    const def = this.plant.modes.states.find((x) => x.id === stateId);
    if (def) this.sim.log((r.short || r.name) + ': ' + def.label.toLowerCase());
    this.publish();
  }

  /** Cambia el tipo de producto que se fabrica en una sala. */
  setRoomProduct(roomId: string, typeId: string): void {
    const r = this.plant.byId[roomId];
    if (!r || this.plant.modes.room !== roomId) return;
    if (r.product === typeId) return;
    r.product = typeId;
    const def = this.plant.modes.types.find((x) => x.id === typeId);
    if (def) this.sim.log((r.short || r.name) + ': fabricación ' + def.label);
    this.publish();
  }

  /** Cambia el lote que detallan los paneles. */
  focusLot(id: string): void {
    this.sim.focusedLotId = id;
    this.publish();
  }

  /** Lista de salas para el desplegable. Estable, no entra en el snapshot. */
  roomOptions(): { id: string; name: string }[] {
    return this.plant.rooms.map((r) => ({ id: r.id, name: r.name }));
  }

  /* ---------- bucle ---------- */

  private frame = (ts: number): void => {
    if (this.stopped) return;
    // La petición del siguiente fotograma va fuera del try: un fallo puntual
    // de dibujo no puede dejar la planta congelada para siempre.
    try {
      this.tick(ts);
    } catch (err) {
      if (!this.frameErrorLogged) {
        this.frameErrorLogged = true;
        console.error('[planta] fallo al dibujar el fotograma', err);
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Primera excepción de dibujo; solo se registra una vez para no inundar. */
  private frameErrorLogged = false;

  private tick(ts: number): void {
    const dt = Math.min(0.05, Math.max(0, (ts - (this.lastTs || ts)) / 1000));
    this.lastTs = ts;

    if (this.sim.playing) {
      const d = dt * this.sim.speed;
      // El reloj de animación se acelera como mucho ×2 para que no parpadee.
      this.iso.t += dt * Math.min(this.sim.speed, 2);
      this.sim.simMinutes += d;
      this.sim.step(d);
    }

    if (this.tour.active) {
      this.tour.elapsed += dt;
      const stop = DATA.tour.stops[this.tour.index]!;
      if (this.tour.elapsed >= stop.seconds) this.tourGo(this.tour.index + 1);
    }

    if (this.camera.animate(dt)) this.applyView();

    this.uiAcc += dt;
    if (this.uiAcc > UI_PERIOD) {
      this.uiAcc = 0;
      this.sim.jitterSensors();
      this.publish();
    }

    drawFrame({
      iso: this.iso,
      plant: this.plant,
      sim: this.sim,
      scene: this.scene,
      data: DATA,
      hover: this.hover,
      selected: this.selected,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
    });
  }

  /* ---------- snapshot ---------- */

  private publish(): void {
    const { plant, sim } = this;
    let inProcess = 0;
    let alerts = 0;
    for (const r of plant.rooms) {
      if (plant.stateOf(r) === 'prod') inProcess++;
      if (r.inc === 'alert') alerts++;
    }
    const quarantine = sim.quarantine.filter(Boolean).length;

    const r = this.selected;
    const state = plant.stateOf(r);
    // Con un estado puesto a mano manda su nombre, que es el que se usa en
    // planta, no el genérico del motor.
    const modoSala = plant.modeState(r);
    const focused = sim.focusedLot();

    this.opts.onSnapshot({
      clock: sim.clock(),
      stats: { done: sim.done, running: sim.lots.length, inProcess, quarantine, alerts },
      lots: sim.lots.map((l) => {
        const room = sim.roomOf(l);
        return {
          id: l.id,
          stage: l.stage,
          held: l.held,
          working: l.wait > 0,
          queued: l.queued,
          location: room ? room.short || room.name : 'En tránsito',
        };
      }),
      focusedLotId: focused?.id ?? null,
      lastLotId: sim.lastLotId,
      lastStageDone: sim.lastLotFinished,
      nextLotId: sim.nextLotId(),
      room: {
        id: r.id,
        name: r.name,
        state,
        stateLabel: r.inc ? STATE_LABEL[state] : (modoSala?.label ?? STATE_LABEL[state]),
        area: r.area,
        people: sim.peopleIn(r, this.scene.seated),
        lotIds: sim.lotsIn(r).map((l) => l.id),
        modes: plant.modes.room === r.id
          ? {
              stateId: r.mode ?? '',
              typeId: r.product ?? '',
              states: plant.modes.states.map((x) => ({ id: x.id, label: x.label })),
              types: plant.modes.types.map((x) => ({ id: x.id, label: x.label, warn: !!x.warn })),
            }
          : null,
        sensors: r.sens ? { ...r.sens } : null,
        restricted: r.inc === 'alert',
      },
      log: sim.logs.slice(0, 7),
      playing: sim.playing,
      speed: sim.speed,
      incident: { on: sim.incident.on, containing: sim.incident.containing },
      view: {
        zoom: this.camera.zoom,
        atFit: this.camera.atFit,
        atMax: this.camera.atMax,
      },
      tour: (() => {
        const stops = DATA.tour.stops;
        const stop = stops[this.tour.index];
        return {
          active: this.tour.active,
          index: this.tour.index,
          total: stops.length,
          title: stop?.title ?? '',
          text: stop?.text ?? '',
          progress: stop ? Math.min(1, this.tour.elapsed / stop.seconds) : 0,
        };
      })(),
    });
  }
}

function clampTilt(v: number): number {
  return Math.max(TILT_RANGE.min, Math.min(TILT_RANGE.max, v));
}
