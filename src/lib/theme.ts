/**
 * Tema de la interfaz. `sistema` deja mandar a prefers-color-scheme; las otras
 * dos fijan `data-theme` en <html>, que es lo que miran tanto el CSS como el
 * motor para releer la paleta del canvas.
 */

export type Theme = 'sistema' | 'claro' | 'oscuro';

const KEY = 'planta-tema';
const ATTR: Record<Theme, string | null> = { sistema: null, claro: 'light', oscuro: 'dark' };

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'claro' || v === 'oscuro') return v;
  } catch {
    // Sin almacenamiento (ventana privada, cookies bloqueadas): se usa el sistema.
  }
  return 'sistema';
}

export function applyTheme(t: Theme): void {
  const attr = ATTR[t];
  if (attr) document.documentElement.dataset['theme'] = attr;
  else delete document.documentElement.dataset['theme'];
  try {
    if (t === 'sistema') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // El tema se aplica igual, solo que no se recuerda.
  }
}
