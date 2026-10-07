/** Tipos del plano (src/data/plant.json) y del snapshot que el motor publica al store. */

export type RoomKind = 'prod' | 'corr' | 'store' | 'amen' | 'serv';
export type RoomState = 'prod' | 'ok' | 'clean' | 'off' | 'risk' | 'alert';
export type Axis = 'h' | 'v';

/** Nombre de una variable CSS de color, sin el prefijo `--`. */
export type ColorToken = string;

export interface RoomData {
  id: string;
  name: string;
  short: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number | null;
  kind: RoomKind;
  /** Posición de la etiqueta; si falta se usa el centro de la sala. */
  label?: [number, number];
  /** Estado de partida cuando no es `ok` (el flujo laminar arranca parado). */
  base?: RoomState;
}

export interface DoorData {
  axis: Axis;
  /** Coordenada fija del hueco: y si es horizontal, x si es vertical. */
  c: number;
  a: number;
  b: number;
}

export interface Sensors {
  t: number;
  rh: number;
  dp: number;
}

/** Sala con el estado mutable que lleva la simulación. */
export interface Room extends Omit<RoomData, 'label'> {
  label: [number, number] | null;
  base: RoomState;
  /** Incidencia activa: desviación, riesgo de arrastre o limpieza. */
  inc: 'alert' | 'risk' | 'clean' | null;
  /** Hay un lote trabajando dentro ahora mismo. */
  act: boolean;
  /** Segundos de limpieza que quedan. */
  clean: number;
  /** Salas comunicadas por una puerta. */
  adj: Set<Room>;
  sens: Sensors | null;
}

export interface BoxItem {
  type: 'box';
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  token: ColorToken;
  z0?: number;
}
export interface CylItem {
  type: 'cyl';
  /** Sala que decide si el reactor burbujea. */
  room: string;
  x: number;
  y: number;
  r: number;
  h: number;
  token: ColorToken;
  phase: number;
  /** Cota de apoyo; sirve para subirlo a una plataforma. */
  z0?: number;
}
export interface RackItem {
  type: 'rack';
  x: number;
  y: number;
  len: number;
  dep: number;
  axis: 'x' | 'y';
}
export interface TreeItem { type: 'tree'; x: number; y: number }
export interface StackItem { type: 'stack'; x: number; y: number }
export interface SeatedItem {
  type: 'seated';
  x: number;
  y: number;
  token: ColorToken;
  /** Bata de laboratorio en vez de ropa de calle. */
  lab: boolean;
}
/** Separador documental dentro del array de equipos; el motor lo ignora. */
export interface NoteItem { note: string; type?: undefined }

export type EquipmentItem =
  | BoxItem | CylItem | RackItem | TreeItem | StackItem | SeatedItem | NoteItem;

export interface ZoneData {
  x0: number; y0: number; x1: number; y1: number;
  token: ColorToken;
  fill: number;
}

export interface MarkerData {
  text: string;
  x: number;
  y: number;
  token: ColorToken;
}

export interface LegendEntry { token: ColorToken; label: string }

export interface RouteStep {
  x?: number;
  /** El último tramo va al hueco libre de cuarentena, que varía por lote. */
  xFromSlot?: boolean;
  y: number;
  wait?: number;
  stage?: number;
  msg?: string;
}

export interface WalkerData {
  points: [number, number][];
  color: ColorToken;
  phase: number;
  lab?: boolean;
  /** Índice del punto de partida; por defecto el primero. */
  start?: number;
}

export interface PlantData {
  meta: {
    name: string;
    level: string;
    note: string;
    origin: { x: number; y: number };
    shiftStartMinutes: number;
  };
  view: {
    /** Factor vertical de la proyección; 0.5 es la isometría clásica. */
    tilt: number;
  };
  /** Código de colores de la ropa de trabajo, por departamento. */
  wear: {
    /** Token para las salas sin color propio. */
    default: ColorToken;
    /** Sala → token de color. */
    byRoom: Record<string, ColorToken>;
  };
  rooms: RoomData[];
  doors: DoorData[];
  walls: {
    defaultHeight: number;
    overrides: { axis: Axis; c: number; height: number }[];
    segmentLength: number;
    thickness: number;
  };
  ground: { x: number; y: number; w: number; d: number; h: number; z0: number; token: ColorToken };
  aisle: { y: number; x0: number; x1: number };
  /**
   * Suelos elevados. Se dibujan con los suelos de las salas y no como piezas
   * sueltas, para que todo lo que se apoya encima quede siempre por delante.
   */
  platforms: { x: number; y: number; w: number; d: number; h: number; token: ColorToken }[];
  equipment: EquipmentItem[];
  zones: ZoneData[];
  markers: MarkerData[];
  legend: LegendEntry[];
  quarantine: {
    y: number;
    slotX0: number;
    slotStep: number;
    slots: (string | null)[];
  };
  lot: {
    firstNumber: number;
    completedToday: number;
    idPrefix: string;
    speed: number;
    /** Lotes que puede haber a la vez en planta. */
    maxConcurrent: number;
    /** Segundos entre descargas de camión. */
    spawnGap: number;
    /** A qué distancia se detiene un lote si la sala de destino está ocupada. */
    queueGap: number;
    /** Variación de los tiempos de proceso entre lotes. */
    processJitter: { min: number; max: number };
    stages: string[];
    route: RouteStep[];
  };
  truck: {
    x: number; y: number; dockX: number; exitX: number; resetX: number; speed: number;
    /** Frena y abre antes de descargar. */
    dwell: number;
    /** Tiempo con el palé en el muelle. */
    unload: number;
    /** Fuera de cuadro antes de volver. */
    gap: number;
  };
  forklifts: {
    x: number; y0: number; y1: number; speed: number; pause: number;
    /** Sentido inicial de la marcha. */
    dir: number;
  }[];
  walkers: WalkerData[];
  tour: {
    /** Tope de acercamiento, para que las salas pequeñas no queden encima. */
    zoomLimit: number;
    stops: {
      /** Sala que se encuadra; null para el plano entero. */
      room: string | null;
      title: string;
      text: string;
      seconds: number;
    }[];
  };
  incident: {
    room: string;
    spreadInterval: number;
    containInterval: number;
    maxRing: number;
    cleanDuration: number;
  };
}

/* ---------- snapshot que leen los paneles de React (~4 Hz) ---------- */

export interface LotSnapshot {
  id: string;
  stage: number;
  held: boolean;
  /** El lote está parado trabajando en una sala, no desplazándose. */
  working: boolean;
  /** Esperando a que se libere la sala de destino. */
  queued: boolean;
  location: string;
}

export interface RoomSnapshot {
  id: string;
  name: string;
  state: RoomState;
  stateLabel: string;
  area: number | null;
  people: number;
  /** Lotes que hay ahora mismo en la sala. */
  lotIds: string[];
  sensors: Sensors | null;
  restricted: boolean;
}

export interface LogEntry {
  /** Hora de planta, HH:MM. */
  t: string;
  m: string;
  /** Clave estable para React; los mensajes se repiten entre lotes. */
  key: number;
}

export interface PlantSnapshot {
  clock: string;
  stats: { done: number; running: number; inProcess: number; quarantine: number; alerts: number };
  /** Lotes en planta, por orden de entrada. */
  lots: LotSnapshot[];
  /** Lote que detallan los paneles. */
  focusedLotId: string | null;
  /** Último lote cerrado, para cuando no hay ninguno en curso. */
  lastLotId: string;
  lastStageDone: boolean;
  nextLotId: string;
  room: RoomSnapshot;
  log: LogEntry[];
  playing: boolean;
  speed: number;
  incident: { on: boolean; containing: boolean };
  /** Estado de la cámara, para los controles de zoom. */
  view: { zoom: number; atFit: boolean; atMax: boolean };
  /** Recorrido guiado; `active` false cuando no se está presentando. */
  tour: {
    active: boolean;
    index: number;
    total: number;
    title: string;
    text: string;
    /** Avance de la parada actual, de 0 a 1. */
    progress: number;
  };
}
