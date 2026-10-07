import type { LogEntry } from '../engine/types';

/** Últimos eventos de planta, los más recientes arriba. */
export function LogPanel({ log }: { log: LogEntry[] }) {
  return (
    <article className="panel">
      <h2>Registro</h2>
      <p className="sub">Últimos eventos de la planta</p>
      <ul className="log">
        {log.map((l) => (
          <li key={l.key}>
            <time>{l.t}</time>
            <span>{l.m}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
