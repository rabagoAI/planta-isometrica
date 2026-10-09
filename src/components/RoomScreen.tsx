import type { PlantSnapshot } from '../engine/types';

interface Props {
  room: PlantSnapshot['room'];
  clock: string;
  onMode: (roomId: string, stateId: string) => void;
  onExit: () => void;
}

/**
 * Cabecera del modo pantalla: nombre de la sala, su estado en grande y el
 * desplegable para cambiarlo. Pensada para leerse de lejos.
 */
export function RoomScreen({ room, clock, onMode, onExit }: Props) {
  const m = room.modes;
  const grupos = [...new Set(m?.states.map((s) => s.group) ?? [])];
  const aviso = room.stateLabel.toUpperCase().includes('ALÉRGENOS');

  return (
    <header className="screen">
      <div className="screen-head">
        <p className="eyebrow">{room.name}</p>
        <p className={'screen-state' + (aviso ? ' warn' : '')}>
          {aviso && <span aria-hidden="true">⚠ </span>}
          {room.stateLabel}
        </p>
      </div>
      <div className="screen-controls">
        <span className="clock">{clock}</span>
        {m && (
          <select
            aria-label="Estado de la sala"
            value={m.stateId}
            onChange={(e) => onMode(room.id, e.target.value)}
          >
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {m.states.filter((o) => o.group === g).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <button type="button" onClick={onExit}>Salir</button>
      </div>
    </header>
  );
}
