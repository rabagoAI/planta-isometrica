import type { PlantSnapshot } from '../engine/types';

interface Props {
  tour: PlantSnapshot['tour'];
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}

/** Rótulo del recorrido guiado, superpuesto sobre el plano. */
export function TourOverlay({ tour, onPrev, onNext, onExit }: Props) {
  if (!tour.active) return null;

  return (
    <aside className="tour" aria-live="polite">
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${Math.round(tour.progress * 100)}%` }} />
      </div>
      <h3>{tour.title}</h3>
      <p>{tour.text}</p>
      <div className="row">
        <span className="step">Parada {tour.index + 1} de {tour.total}</span>
        <span className="seg" role="group" aria-label="Recorrido">
          <button type="button" onClick={onPrev} disabled={tour.index === 0} aria-label="Parada anterior">
            ‹
          </button>
          <button type="button" onClick={onNext} aria-label="Parada siguiente">
            ›
          </button>
          <button type="button" onClick={onExit}>Salir</button>
        </span>
      </div>
    </aside>
  );
}
