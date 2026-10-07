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

## Notas de desarrollo

Cosas que cuesta volver a descubrir:

- **El navegador suspende `requestAnimationFrame` en pestañas ocultas.** Si la
  ventana está detrás de otra, la simulación se congela y parece que el reloj,
  el reset de cámara o el recorrido guiado están rotos. No lo están: todo lo
  síncrono (botones, zoom) sigue respondiendo. Para probar sin ventana visible,
  llamar al bucle a mano con marcas de tiempo crecientes.
- **El orden de pintado usa una sola profundidad por pieza** (`x + y` del
  centro). Con una superficie grande y plana eso tapa por la base a lo que se
  apoya encima. Las superficies así van en `platforms`, que se dibujan con los
  suelos, y lo que se apoye lleva `z0`.
- **Los datos del plano se compilan dentro del bundle.** Sacar un fichero de git
  no lo saca de lo que se sirve al navegador.
- El encuadre no está codificado a mano: `engine/bounds.ts` proyecta todo lo
  dibujable y calcula el rectángulo, así que cambiar `view.tilt` reajusta el
  lienzo solo.

## Pendiente

Por orden de lo que más aporta respecto al trabajo que cuesta.

### Red de seguridad
1. **Pruebas del motor con Vitest.** `Plant` y `Simulation` son TypeScript puro
   sin DOM, así que se prueban directamente. Cubrir: que la reserva de hueco de
   cuarentena no adjudique el mismo a dos lotes; que la cola por sala respete el
   turno; que la desviación se propague por puertas y se recupere al contener;
   que ninguna ruta deje un lote colgado. Hoy todo esto se comprueba a mano en
   el navegador, y ya se ha roto alguna vez sin que saltara nada.

### Funcionalidad
2. **Trazabilidad por lote.** Un lote llega a cuarentena y desaparece: no se
   puede preguntar qué le pasó. Guardar hora de entrada en cada sala, duración
   por etapa, retenciones y motivo, y poder consultar lotes ya cerrados. Es
   además lo que define qué datos hacen falta para conectar un ERP.
3. **Modo editor del plano.** Mover salas y equipos desde la interfaz y exportar
   el JSON, en vez de editarlo a mano.
4. **Niveles conmutables.** Generalizar los datos a varias plantas con un
   selector, en vez de un único plano.

### Aspecto y legibilidad
5. **Muros que tapan.** Los muros miden 20 y algunas salas estrechas tienen
   menos fondo aparente que eso, así que su propio muro frontal se come lo que
   hay dentro. Opciones: bajar la altura, volverlos translúcidos cuando tapan la
   sala seleccionada, o girar la vista en cuatro orientaciones. Lo último toca
   el orden de profundidad, así que conviene hacerlo en solitario.
6. **Transiciones de estado.** Cuando una sala cambia de estado el velo de color
   aparece de golpe. Interpolarlo.
7. **Hora del día.** El reloj de turno avanza pero no cambia nada visual.
   Desplazar la paleta y la dirección de las sombras con la hora.
8. **Más vida.** Vapor en la sala técnica, extractores girando, cajas en más
   cintas.

### Infraestructura
9. **Desplegar en Vercel.** Importar el repositorio desde vercel.com/new. El
   `vercel.json` ya lo deja configurado y no hay variables de entorno.
10. **Repensar las dos ramas.** La rama de trabajo y la publicable divergen y
    hay que ir sincronizándolas a mano. Como el plano real ya nunca entra en
    git, a medio plazo lo sensato es trabajar solo en la rama limpia.
11. **Supabase.** Salas, puertas, lotes y eventos en base de datos, en vez de
    todo en el JSON.
12. **Revisar en móvil y tableta.** El diseño es de escritorio. Con la cámara ya
    se puede explorar en pantalla pequeña, pero no está comprobado.

@NOTAS-PLANTA.local.md
