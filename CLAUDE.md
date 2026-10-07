# Consola isométrica de planta

Interfaz isométrica, estilo juego de estrategia, para ver y gestionar una planta
de fabricación. Nació como un prototipo en un solo HTML y se convirtió en un
proyecto mantenible: datos del plano en archivo, motor de dibujo y simulación
separado de React, paneles en React.

## Stack
- Vite + React + TypeScript
- Canvas 2D para el plano (sin Three.js por ahora)
- Supabase más adelante (salas, puertas, lotes, eventos)
- Despliegue en Vercel

## Estructura
- `src/data/plant.demo.json`: planta ficticia que se compila por defecto.
- `src/data/plant.local.json`: plano real, si existe. **Fuera de git.**
- `src/data/plant.ts`: elige cuál de los dos se usa.
- `src/engine/`: proyección isométrica, dibujo, cámara y simulación. TypeScript
  puro, sin React.
- `src/components/PlantCanvas.tsx`: monta el canvas y el bucle `requestAnimationFrame`.
- `src/components/`: resumen, seguimiento de lote, ficha de sala, registro.
- `src/store/`: estado para los paneles, actualizado ~4 veces por segundo.

## Reglas
- La animación NO pasa por el estado de React. Se dibuja directo en el canvas.
- Los colores salen de variables CSS (tema claro y oscuro). No uses colores fijos.
- Idioma de la interfaz: español. Superficies en m² con coma decimal.
- Los datos de lotes, sensores y cifras son de ejemplo. No los presentes como reales.
- **Nada que identifique una instalación real entra en el repositorio**: ni el
  plano, ni el nombre del cliente, ni su ubicación. El repositorio y el
  despliegue muestran siempre la planta ficticia.

## Pendiente
1. Modo editor del plano.
2. Trazabilidad por lote: historial de etapas, tiempos y retenciones.
3. Pruebas del motor con Vitest.
4. Legibilidad: los muros tapan parte de las salas estrechas.

@NOTAS-PLANTA.local.md
