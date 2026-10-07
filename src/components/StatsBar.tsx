import type { PlantSnapshot } from '../engine/types';

/** Cuatro cifras de cabecera: resumen del turno. */
export function StatsBar({ stats }: { stats: PlantSnapshot['stats'] }) {
  return (
    <section className="stats" aria-label="Resumen de planta">
      <div className="stat">
        <div className="k">Lotes completados</div>
        <div className="v">{stats.done}<small>hoy</small></div>
      </div>
      <div className="stat">
        <div className="k">Lotes en planta</div>
        <div className="v">{stats.running}</div>
      </div>
      <div className="stat">
        <div className="k">Salas en proceso</div>
        <div className="v">{stats.inProcess}</div>
      </div>
      <div className="stat">
        <div className="k">Palés en cuarentena</div>
        <div className="v">{stats.quarantine}</div>
      </div>
      <div className="stat">
        <div className="k">Desviaciones abiertas</div>
        <div className="v">{stats.alerts}</div>
      </div>
    </section>
  );
}
