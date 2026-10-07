import type { LegendEntry, PlantSnapshot } from '../engine/types';

const SPEEDS = [1, 2, 4];

interface Props {
  legend: LegendEntry[];
  view: PlantSnapshot['view'];
  tourActive: boolean;
  onTour: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  playing: boolean;
  speed: number;
  incident: PlantSnapshot['incident'];
  incidentRoom: string;
  onTogglePlaying: () => void;
  onSpeed: (v: number) => void;
  onToggleIncident: () => void;
}

/** Leyenda de estados y controles de la simulación. */
export function Toolbar({
  legend, view, tourActive, playing, speed, incident, incidentRoom,
  onZoomIn, onZoomOut, onResetView, onTour, onTogglePlaying, onSpeed, onToggleIncident,
}: Props) {
  // El botón de desviación tiene tres fases: provocar, contener y esperar.
  const incidentLabel = !incident.on
    ? `Simular desviación en ${incidentRoom}`
    : incident.containing
      ? 'Conteniendo…'
      : 'Contener desviación';
  const incidentDisabled = incident.on && incident.containing;

  return (
    <div className="toolbar">
      <ul className="legend">
        {legend.map((l) => (
          <li key={l.token}>
            <span className="sw" style={{ background: `var(--${l.token})` }} />
            {l.label}
          </li>
        ))}
      </ul>
      <div className="controls">
        <span className="seg" role="group" aria-label="Zoom del plano">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={view.atFit}
            title="Alejar (tecla −)"
            aria-label="Alejar"
          >
            −
          </button>
          <button
            type="button"
            onClick={onResetView}
            disabled={view.atFit}
            title="Ver el plano entero (Esc)"
            style={{ minWidth: '4.2em', fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(view.zoom * 100)} %
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={view.atMax}
            title="Acercar (tecla +). Doble clic en una sala para encuadrarla"
            aria-label="Acercar"
          >
            +
          </button>
        </span>
        <button
          type="button"
          aria-pressed={tourActive}
          onClick={onTour}
          title="Recorrido guiado por las etapas del proceso"
        >
          {tourActive ? 'Salir de la presentación' : 'Presentación'}
        </button>
        <button type="button" aria-pressed={!playing} onClick={onTogglePlaying}>
          {playing ? 'Pausar' : 'Reanudar'}
        </button>
        <span className="seg" role="group" aria-label="Velocidad">
          {SPEEDS.map((v) => (
            <button key={v} type="button" aria-pressed={speed === v} onClick={() => onSpeed(v)}>
              {v}×
            </button>
          ))}
        </span>
        <button
          type="button"
          className="danger"
          aria-pressed={incident.on}
          disabled={incidentDisabled}
          style={{ opacity: incidentDisabled ? 0.6 : 1 }}
          onClick={onToggleIncident}
        >
          {incidentLabel}
        </button>
      </div>
    </div>
  );
}
