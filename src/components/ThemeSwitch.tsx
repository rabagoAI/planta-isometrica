import { useState } from 'react';
import { applyTheme, readTheme } from '../lib/theme';
import type { Theme } from '../lib/theme';

const OPCIONES: { id: Theme; label: string; title: string }[] = [
  { id: 'sistema', label: 'Sistema', title: 'Seguir la preferencia del sistema' },
  { id: 'claro', label: 'Claro', title: 'Forzar el tema claro' },
  { id: 'oscuro', label: 'Oscuro', title: 'Forzar el tema oscuro' },
];

/** Selector de tema. El canvas se repinta solo: el motor vigila data-theme. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const elegir = (t: Theme) => {
    applyTheme(t);
    setTheme(t);
  };

  return (
    <span className="seg" role="group" aria-label="Tema">
      {OPCIONES.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={theme === o.id}
          title={o.title}
          onClick={() => elegir(o.id)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
