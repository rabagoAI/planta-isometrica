/**
 * Simulación de planta, sin React ni DOM: reloj de turno, registro de eventos,
 * recorrido del lote, camión, operarios, toro y propagación de desviaciones.
 */

import { Plant } from './plant';
import type { LogEntry, PlantData, Room } from './types';

export interface LotState {
  id: string;
  /** Índice del tramo de ruta en curso. */
  i: number;
  x: number;
  y: number;
  /** Dirección unitaria; coloca al operario detrás del palé. */
  dx: number;
  dy: number;
  /** Segundos de proceso que quedan en esta parada. */
  wait: number;
  stage: number;
  held: boolean;
  moving: boolean;
  /** Hueco de cuarentena reservado para este lote. */
  slot: number;
  /** x final, ya resuelta a partir del hueco. */
  slotX: number;
  /** Esperando a que se libere la sala de destino. */
  queued: boolean;
}

export interface ForkliftState {
  x: number;
  y: number;
  dir: number;
  wait: number;
  y0: number;
  y1: number;
  speed: number;
  pause: number;
}

export interface WalkerState {
  points: [number, number][];
  i: number;
  x: number;
  y: number;
  wait: number;
  color: string;
  phase: number;
  lab: boolean;
  moving: boolean;
}

type TruckPhase = 'in' | 'dock' | 'out' | null;

export class Simulation {
  readonly plant: Plant;
  private readonly data: PlantData;

  playing = true;
  speed = 1;
  /** Minutos simulados desde el inicio del turno. */
  simMinutes = 0;

  logs: LogEntry[] = [];
  private logSeq = 0;

  lotNumber: number;
  done: number;
  lastLotId = '—';
  /** El último lote llegó a cuarentena y no hay otro en curso. */
  lastLotFinished = false;

  /** Lotes en planta, por orden de entrada. */
  lots: LotState[] = [];
  /** Lote que siguen los paneles; null si no hay ninguno. */
  focusedLotId: string | null = null;
  /** Palés en cuarentena; `null` es hueco libre. */
  quarantine: (string | null)[];
  /** Huecos ya adjudicados a lotes que aún están en ruta. */
  private reserved = new Set<number>();

  truck: { x: number; y: number; phase: TruckPhase };
  forklifts: ForkliftState[];
  walkers: WalkerState[];

  private truckWait = 0;
  /** El camión ya ha soltado su palé en esta parada. */
  private truckUnloaded = false;
  /** Segundos desde la última descarga; `lot.spawnGap` fija la cadencia. */
  private sinceSpawn = Infinity;

  incident = {
    on: false,
    containing: false,
    ring: 0,
    t: 0,
    /** Distancia en salas desde el foco, por BFS sobre las puertas. */
    dist: null as Map<Room, number> | null,
  };

  constructor(data: PlantData, plant: Plant) {
    this.data = data;
    this.plant = plant;
    this.lotNumber = data.lot.firstNumber;
    this.done = data.lot.completedToday;
    this.quarantine = [...data.quarantine.slots];
    this.truck = { x: data.truck.x, y: data.truck.y, phase: 'in' };
    this.forklifts = data.forklifts.map((f) => ({
      x: f.x, y: f.dir > 0 ? f.y0 : f.y1, dir: f.dir, wait: 0,
      y0: f.y0, y1: f.y1, speed: f.speed, pause: f.pause,
    }));
    this.walkers = data.walkers.map((w) => {
      const start = w.points[w.start ?? 0]!;
      return {
        points: w.points,
        i: 0,
        x: start[0],
        y: start[1],
        wait: 0,
        color: w.color,
        phase: w.phase,
        lab: w.lab ?? false,
        moving: false,
      };
    });
    this.log('Turno de mañana iniciado');
  }

  /* ---------- reloj y registro ---------- */

  clock(): string {
    const m = this.data.meta.shiftStartMinutes + Math.floor(this.simMinutes);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  log(m: string): void {
    this.logs.unshift({ t: this.clock(), m, key: this.logSeq++ });
    if (this.logs.length > 40) this.logs.pop();
  }

  /* ---------- cuarentena ---------- */

  slotX(i: number): number {
    return this.data.quarantine.slotX0 + i * this.data.quarantine.slotStep;
  }

  nextLotId(): string {
    return this.data.lot.idPrefix + String(this.lotNumber + 1).padStart(3, '0');
  }

  /* ---------- lote ---------- */

  /**
   * ¿Cabe otro lote? Limita tanto el aforo de la planta como la cadencia, para
   * que la separación entre lotes no dependa de los tiempos del camión.
   */
  canSpawn(): boolean {
    return this.lots.length < this.data.lot.maxConcurrent
      && this.sinceSpawn >= this.data.lot.spawnGap;
  }

  /**
   * Adjudica un hueco de cuarentena. Hay que reservarlo al entrar el lote y no
   * al salir: con varios lotes en ruta, todos elegirían el mismo hueco libre.
   */
  private reserveSlot(): number {
    for (let i = 0; i < this.quarantine.length; i++) {
      if (this.quarantine[i] === null && !this.reserved.has(i)) {
        this.reserved.add(i);
        return i;
      }
    }
    // Todo ocupado: Calidad libera el palé más antiguo para hacer sitio.
    for (let i = this.quarantine.length - 1; i >= 0; i--) {
      if (this.quarantine[i] !== null) {
        this.log('Palé ' + this.quarantine[i] + ' liberado por Calidad');
        this.quarantine[i] = null;
        this.reserved.add(i);
        return i;
      }
    }
    return 0;
  }

  private spawnLot(): void {
    this.sinceSpawn = 0;
    const k = this.reserveSlot();
    this.lotNumber++;
    const id = this.data.lot.idPrefix + String(this.lotNumber).padStart(3, '0');
    const first = this.data.lot.route[0]!;
    const lot: LotState = {
      id,
      i: 0,
      x: first.x!,
      y: first.y,
      dx: 0,
      dy: -1,
      wait: first.wait ?? 0,
      stage: 0,
      held: false,
      moving: false,
      queued: false,
      slot: k,
      slotX: this.slotX(k),
    };
    this.lots.push(lot);
    this.focusedLotId ??= id;
    this.lastLotFinished = false;
    this.log('Lote ' + id + ': ' + first.msg);
  }

  private finishLot(lot: LotState): void {
    this.quarantine[lot.slot] = lot.id;
    this.reserved.delete(lot.slot);
    this.done++;
    this.lastLotId = lot.id;
    this.lastLotFinished = true;
    this.log('Lote ' + lot.id + ' en cuarentena. Pendiente de liberación');
    this.lots = this.lots.filter((l) => l !== lot);
    if (this.focusedLotId === lot.id) this.focusedLotId = this.lots[0]?.id ?? null;
  }

  /** Lote que está trabajando ahora mismo dentro de una sala, si lo hay. */
  private workingIn(room: Room, except: LotState): LotState | null {
    for (const l of this.lots) {
      if (l !== except && l.wait > 0 && this.roomOf(l) === room) return l;
    }
    return null;
  }

  /** Puesto en la cola de una sala: cuántos lotes anteriores esperan ya por ella. */
  private queueRank(lot: LotState, room: Room): number {
    let n = 0;
    for (const other of this.lots) {
      if (other === lot) break;
      if (other.queued && this.targetRoom(other) === room) n++;
    }
    return n;
  }

  /** Sala en la que está un lote. */
  roomOf(lot: LotState): Room | null {
    const { x: ofx, y: ofy } = this.plant.origin;
    return this.plant.roomAt(lot.x - ofx, lot.y - ofy);
  }

  /** Sala del tramo al que se dirige el lote. */
  private targetRoom(lot: LotState): Room | null {
    const step = this.data.lot.route[lot.i];
    if (!step) return null;
    const { x: ofx, y: ofy } = this.plant.origin;
    return this.plant.roomAt(this.stepX(lot.i, lot) - ofx, step.y - ofy);
  }

  /** x de un tramo, resolviendo el hueco de cuarentena del último. */
  private stepX(i: number, lot: LotState): number {
    const step = this.data.lot.route[i]!;
    return step.xFromSlot ? lot.slotX : step.x!;
  }

  /** Factor aleatorio del tiempo de proceso de una parada. */
  private jitter(): number {
    const j = this.data.lot.processJitter;
    return j.min + Math.random() * (j.max - j.min);
  }

  private updateLot(lot: LotState, dt: number): void {
    const here = this.roomOf(lot);
    const held = here?.inc === 'alert';

    if (held !== lot.held) {
      lot.held = held;
      this.log(held
        ? 'Lote ' + lot.id + ' retenido por desviación en ' + (here!.short || here!.name)
        : 'Lote ' + lot.id + ' puede continuar');
    }
    lot.moving = false;
    if (held) return;

    if (lot.wait > 0) {
      lot.wait -= dt;
      if (lot.wait <= 0) {
        lot.wait = 0;
        lot.i++;
        if (lot.i >= this.data.lot.route.length) this.finishLot(lot);
      }
      return;
    }

    const step = this.data.lot.route[lot.i]!;
    const tx = this.stepX(lot.i, lot);
    const dx = tx - lot.x;
    const dy = step.y - lot.y;
    const dist = Math.hypot(dx, dy);
    const adv = this.data.lot.speed * dt;

    // Una sala de producción procesa un lote cada vez: si está ocupada, el que
    // llega se detiene antes de entrar y hace cola según su turno.
    if (step.wait) {
      const dest = this.targetRoom(lot);
      if (dest && dest.kind === 'prod' && this.workingIn(dest, lot)) {
        const hold = this.data.lot.queueGap * (1 + this.queueRank(lot, dest));
        if (dist <= hold) {
          if (!lot.queued) {
            lot.queued = true;
            this.log('Lote ' + lot.id + ' espera turno para ' + (dest.short || dest.name));
          }
          return;
        }
      }
    }
    lot.queued = false;

    if (dist <= adv) {
      lot.x = tx;
      lot.y = step.y;
      if (step.wait) {
        lot.wait = step.wait * this.jitter();
        lot.stage = step.stage!;
        this.log(step.msg!);
      } else {
        lot.i++;
      }
    } else {
      lot.x += (dx / dist) * adv;
      lot.y += (dy / dist) * adv;
      lot.dx = dx / dist;
      lot.dy = dy / dist;
      lot.moving = true;
    }
  }

  /* ---------- operarios, toro, camión ---------- */

  private updateWalkers(dt: number): void {
    for (const w of this.walkers) {
      w.moving = false;
      if (w.wait > 0) { w.wait -= dt; continue; }
      const n = w.points[w.i]!;
      const dx = n[0] - w.x;
      const dy = n[1] - w.y;
      const dist = Math.hypot(dx, dy);
      const adv = 42 * dt;
      if (dist <= adv) {
        w.x = n[0];
        w.y = n[1];
        w.i = (w.i + 1) % w.points.length;
        w.wait = 1.5 + Math.random() * 3;
      } else {
        w.x += (dx / dist) * adv;
        w.y += (dy / dist) * adv;
        w.moving = true;
      }
    }
  }

  private updateForklifts(dt: number): void {
    for (const f of this.forklifts) {
      if (f.wait > 0) { f.wait -= dt; continue; }
      f.y += f.dir * f.speed * dt;
      if (f.y >= f.y1) { f.y = f.y1; f.dir = -1; f.wait = f.pause; }
      if (f.y <= f.y0) { f.y = f.y0; f.dir = 1; f.wait = f.pause; }
    }
  }

  /**
   * Ciclo del camión: entra, atraca, descarga un lote y se va. Si la planta ya
   * está al máximo de lotes, espera en el muelle hasta que haya sitio.
   */
  private updateTruck(dt: number): void {
    const cfg = this.data.truck;
    switch (this.truck.phase) {
      case 'in':
        this.truck.x += cfg.speed * dt;
        if (this.truck.x >= cfg.dockX) {
          this.truck.x = cfg.dockX;
          this.truck.phase = 'dock';
          this.truckWait = cfg.dwell;
          this.truckUnloaded = false;
        }
        break;

      case 'dock':
        if (this.truckWait > 0) { this.truckWait -= dt; break; }
        if (!this.truckUnloaded) {
          if (!this.canSpawn()) break; // planta llena: sigue esperando
          this.spawnLot();
          this.truckUnloaded = true;
          this.truckWait = cfg.unload;
        } else {
          this.truck.phase = 'out';
        }
        break;

      case 'out':
        this.truck.x += cfg.speed * dt;
        if (this.truck.x > cfg.exitX) { this.truck.phase = null; this.truckWait = cfg.gap; }
        break;

      default:
        this.truckWait -= dt;
        if (this.truckWait <= 0) { this.truck.x = cfg.resetX; this.truck.phase = 'in'; }
    }
  }

  /* ---------- desviación ---------- */

  private applyIncident(): void {
    for (const r of this.plant.rooms) if (r.inc !== 'clean') r.inc = null;
    this.incident.dist!.forEach((d, r) => {
      if (d <= this.incident.ring) r.inc = d === 0 ? 'alert' : 'risk';
    });
  }

  private startIncident(): void {
    const inc = this.incident;
    if (inc.on) return;
    const origin = this.plant.byId[this.data.incident.room]!;
    inc.on = true;
    inc.containing = false;
    inc.ring = 0;
    inc.t = 0;
    // BFS por puertas: cuántas salas hay entre el foco y cada sala.
    inc.dist = new Map([[origin, 0]]);
    const queue: Room[] = [origin];
    while (queue.length) {
      const a = queue.shift()!;
      for (const b of a.adj) {
        if (!inc.dist.has(b)) { inc.dist.set(b, inc.dist.get(a)! + 1); queue.push(b); }
      }
    }
    this.applyIncident();
    this.log('Desviación en ' + origin.name + '. Acceso restringido');
  }

  private updateIncident(dt: number): void {
    const cfg = this.data.incident;
    for (const r of this.plant.rooms) {
      if (r.inc !== 'clean') continue;
      r.clean -= dt;
      if (r.clean <= 0) {
        r.inc = null;
        this.log((r.short || r.name) + ' vuelve a estar operativa');
      }
    }

    const inc = this.incident;
    if (!inc.on) return;
    inc.t += dt;

    if (!inc.containing && inc.t >= cfg.spreadInterval && inc.ring < cfg.maxRing) {
      inc.t = 0;
      inc.ring++;
      const reached: string[] = [];
      inc.dist!.forEach((d, r) => { if (d === inc.ring) reached.push(r.short || r.name); });
      this.applyIncident();
      if (reached.length) {
        this.log('Riesgo de arrastre hacia ' + reached.slice(0, 3).join(', ') + (reached.length > 3 ? '…' : ''));
      }
    }

    if (inc.containing && inc.t >= cfg.containInterval) {
      inc.t = 0;
      inc.ring--;
      if (inc.ring < 0) {
        inc.on = false;
        const origin = this.plant.byId[cfg.room]!;
        origin.inc = 'clean';
        origin.clean = cfg.cleanDuration;
        this.log('Desviación contenida. Limpieza de ' + (origin.short || origin.name));
      } else {
        this.applyIncident();
      }
    }
  }

  /** Botón de desviación: primero la provoca, después inicia la contención. */
  toggleIncident(): void {
    if (!this.incident.on) this.startIncident();
    else if (!this.incident.containing) {
      this.incident.containing = true;
      this.incident.t = 0;
      this.log('Contención iniciada');
    }
  }

  /* ---------- paso de simulación ---------- */

  step(dt: number): void {
    this.sinceSpawn += dt;
    this.updateIncident(dt);
    this.updateTruck(dt);

    // Copia: finishLot modifica la lista mientras se recorre.
    for (const lot of [...this.lots]) this.updateLot(lot, dt);

    this.updateWalkers(dt);
    this.updateForklifts(dt);

    // Una sala está «en proceso» mientras algún lote trabaja dentro.
    for (const r of this.plant.rooms) r.act = false;
    for (const lot of this.lots) {
      if (lot.wait <= 0 || lot.held) continue;
      const r = this.roomOf(lot);
      if (r) r.act = true;
    }
  }

  /** Deriva los sensores dentro de su rango. Se llama al ritmo del panel. */
  jitterSensors(): void {
    for (const r of this.plant.rooms) {
      const s = r.sens;
      if (!s) continue;
      s.t = clamp(s.t + (Math.random() - 0.5) * 0.1, 20, 23);
      s.rh = clamp(s.rh + (Math.random() - 0.5) * 0.6, 40, 52);
      s.dp = clamp(s.dp + (Math.random() - 0.5) * 0.5, 8, 15);
    }
  }

  /** Personas dentro de una sala: operarios, sentados y quien lleva cada palé. */
  peopleIn(r: Room, seated: [number, number][]): number {
    const { x: ofx, y: ofy } = this.plant.origin;
    let n = 0;
    const count = (x: number, y: number) => {
      if (x - ofx >= r.x0 && x - ofx < r.x1 && y - ofy >= r.y0 && y - ofy < r.y1) n++;
    };
    for (const w of this.walkers) count(w.x, w.y);
    for (const s of seated) count(s[0], s[1]);
    for (const lot of this.lots) count(lot.x - lot.dx * 15, lot.y - lot.dy * 15);
    for (const f of this.forklifts) count(f.x, f.y);
    return n;
  }

  /** Lotes que hay ahora mismo en una sala. */
  lotsIn(r: Room): LotState[] {
    return this.lots.filter((l) => this.roomOf(l) === r);
  }

  /** Lote que siguen los paneles. */
  focusedLot(): LotState | null {
    return this.lots.find((l) => l.id === this.focusedLotId) ?? this.lots[0] ?? null;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
