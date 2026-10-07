import type { PlantSnapshot } from '../engine/types';

interface Props {
  snapshot: PlantSnapshot;
  stages: string[];
  onFocusLot: (id: string) => void;
}

/** Color que resume la situación de un lote de un vistazo. */
function lotColor(lot: PlantSnapshot['lots'][number]): string {
  if (lot.held) return 'var(--alert)';
  if (lot.queued) return 'var(--clean)';
  return lot.working ? 'var(--prod)' : 'var(--ok)';
}

/** Seguimiento de los lotes en planta: etapas, ubicación y estado. */
export function LotPanel({ snapshot, stages, onFocusLot }: Props) {
  const { lots, focusedLotId, lastLotId, lastStageDone, nextLotId } = snapshot;
  const lot = lots.find((l) => l.id === focusedLotId) ?? null;

  const title = lot
    ? `Lote ${lot.id}`
    : lastStageDone ? `Último lote ${lastLotId}` : 'Lotes en curso';

  const estado = lot
    ? lot.held ? 'Retenido por desviación'
      : lot.queued ? `Esperando turno · ${stages[lot.stage]}`
        : `En curso · ${stages[lot.stage]}`
    : lastStageDone ? 'Completado, a la espera del siguiente camión' : 'Esperando camión';

  const sub = lots.length
    ? `${lots.length} ${lots.length === 1 ? 'lote' : 'lotes'} en planta · ${estado}`
    : estado;

  const current = lot ? lot.stage : -1;

  return (
    <article className="panel" aria-live="polite">
      <h2>{title}</h2>
      <p className="sub">{sub}</p>

      {lots.length > 0 && (
        <div className="lots" role="group" aria-label="Lotes en planta">
          {lots.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={l.id === focusedLotId}
              onClick={() => onFocusLot(l.id)}
              title={`${l.id} · ${l.location}`}
            >
              <i className="mark" style={{ background: lotColor(l) }} />
              {l.id.slice(-3)}
            </button>
          ))}
        </div>
      )}

      <ol className="steps">
        {stages.map((name, i) => {
          // Sin lotes y con el anterior cerrado, las cinco etapas quedan hechas.
          const cls = lastStageDone && !lot
            ? 'done'
            : i < current
              ? 'done'
              : i === current && lot
                ? (lot.held ? 'held' : 'now')
                : '';
          return (
            <li key={name} className={cls}>
              <span className="dot">{cls === 'done' ? '✓' : i + 1}</span>
              {name}
            </li>
          );
        })}
      </ol>

      <div className="status">
        {lot ? (
          <>
            <span>Ubicación <b>{lot.location}</b></span>
            <span>Etapa <b>{lot.stage + 1} de {stages.length}</b></span>
            <span className="pill" style={{ color: lotColor(lot) }}>
              {lot.held ? 'Retenido'
                : lot.queued ? 'Esperando sala'
                  : lot.working ? 'En proceso' : 'En movimiento'}
            </span>
          </>
        ) : (
          <span>Siguiente lote <b>{nextLotId}</b></span>
        )}
      </div>
    </article>
  );
}
