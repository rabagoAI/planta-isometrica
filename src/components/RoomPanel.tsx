import { Fragment } from 'react';
import type { RoomSnapshot } from '../engine/types';

interface Props {
  room: RoomSnapshot;
  options: { id: string; name: string }[];
  onSelect: (id: string) => void;
}

/** Superficies en m² con coma decimal, como el resto de la interfaz. */
function m2(area: number | null): string {
  return area === null ? '—' : area.toFixed(2).replace('.', ',') + ' m²';
}

/** Ficha de la sala seleccionada en el plano o en el desplegable. */
export function RoomPanel({ room, options, onSelect }: Props) {
  const rows: [string, string][] = [
    ['Superficie', m2(room.area)],
    ['Personas', room.people ? String(room.people) : 'Ninguna'],
    ['Lotes', room.lotIds.length ? room.lotIds.join(', ') : '—'],
  ];
  if (room.sensors) {
    rows.push(
      ['Temperatura', room.sensors.t.toFixed(1).replace('.', ',') + ' °C'],
      ['Humedad', Math.round(room.sensors.rh) + ' %'],
      ['Presión dif.', '+' + Math.round(room.sensors.dp) + ' Pa'],
    );
  }
  if (room.restricted) rows.push(['Acceso', 'Restringido']);

  return (
    <article className="panel">
      <div className="roomhead">
        <h2>{room.name}</h2>
        <span
          className="pill"
          style={{ color: room.state === 'ok' ? 'var(--ok)' : `var(--${room.state})` }}
        >
          {room.stateLabel}
        </span>
      </div>
      <p className="sub">
        <label htmlFor="roomSel">Sala seleccionada</label> ·{' '}
        <select id="roomSel" value={room.id} onChange={(e) => onSelect(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </p>
      <dl>
        {rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </Fragment>
        ))}
      </dl>
    </article>
  );
}
