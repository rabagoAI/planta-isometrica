# Consola isométrica de planta

Interfaz isométrica, estilo juego de estrategia, para ver y gestionar una planta
de fabricación: salas, recorrido de los lotes, personal y desviaciones, dibujado
en canvas 2D sobre un motor propio.

> **La planta que ves es ficticia.** Los lotes, sensores y cifras son inventados.
> El plano de una instalación real es información sensible y no se versiona aquí;
> abajo se explica cómo usar uno propio en local.

## Puesta en marcha

```bash
npm install
npm run dev
```

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm run build` | Comprueba tipos y genera `dist/` |
| `npm run preview` | Sirve `dist/` para revisarlo en local |
| `npm run typecheck` | Solo la comprobación de tipos |

## Cómo está organizado

```
src/
  data/plant.json     el plano entero: salas, puertas, equipos, recorridos, personal
  engine/             dibujo isométrico y simulación, TypeScript puro sin React
  store/              store externo que leen los paneles
  components/         canvas y paneles de React
  styles/             theme.css (variables de color) y app.css (layout)
```

**Cambiar el plano es editar `src/data/plant.json`.** Las coordenadas están en px
del plano original; el motor les resta `meta.origin` al cargarlas.

### Usar un plano propio

El repositorio compila `src/data/plant.demo.json`, una planta inventada. Para
trabajar con un plano real, se deja un `src/data/plant.local.json` con la misma
estructura: `src/data/plant.ts` lo detecta y lo usa en su lugar.

Ese fichero está en `.gitignore` y **no debe salir de tu máquina**. Si no existe
—en un clon recién hecho, en CI o en el despliegue— se compila la planta
ficticia, así que ningún build público puede contener un plano real. La insignia
de la cabecera dice cuál de los dos se está viendo.

Los suelos elevados van en `platforms`, no en `equipment`. El orden de pintado
usa una sola profundidad por pieza (`x + y` del centro), y con una plataforma
grande y plana eso tapaba por la base a los objetos del fondo que se apoyan en
ella. Dibujándola con los suelos, todo lo que está encima queda siempre por
delante. Lo que se apoye en una plataforma lleva `z0` con su altura.

### La simulación

Varios lotes circulan a la vez. Cada camión que atraca descarga uno; si la planta
está al aforo, el camión espera en el muelle. Los mandos están en `lot` dentro de
`plant.json`:

| Clave | Qué controla |
| --- | --- |
| `maxConcurrent` | Lotes que caben a la vez en planta |
| `spawnGap` | Segundos entre descargas; es el mando real de la cadencia |
| `queueGap` | A qué distancia espera un lote si su sala está ocupada |
| `processJitter` | Variación de los tiempos de proceso entre lotes |

Dos reglas hacen que no parezcan fantasmas que se atraviesan:

- **Un hueco de cuarentena se reserva al entrar el lote**, no al salir. Con varios
  lotes en ruta, si se buscara al final todos elegirían el mismo hueco.
- **Una sala de producción procesa un lote cada vez.** El que llega se detiene
  *antes* de entrar, a `queueGap` por cada lote que ya espera, de modo que hacen
  cola en fila en vez de amontonarse.

`processJitter` no es decoración: sin él todos los lotes tardan exactamente lo
mismo, mantienen la separación inicial para siempre y nunca llegan a coincidir en
una sala. Con la cadencia actual se forma cola alrededor del 6 % del tiempo, casi
siempre en Fabricación 1.

El color del palé dice en qué situación está: azul en proceso, ámbar esperando
turno, rojo retenido por una desviación.

### Ropa de trabajo

El color de la ropa es el de la planta real, y lo decide la sala, no la persona:

| Departamento | Color |
| --- | --- |
| Fabricación | Blanco |
| Envasado | Verde |
| Expedición de pedidos | Gris |
| Resto de áreas | Naranja de alta visibilidad |
| Laboratorio | Bata |

Se configura en `wear` dentro de `plant.json`, con `byRoom` por id de sala y un
`default` para las demás. Como manda la sala y no la persona, quien empuja un palé
cambia de color al pasar de una área a otra, igual que cambia de ropa al entrar.
Lo mismo vale para los carretilleros.

### Explorar el plano

| Gesto | Qué hace |
| --- | --- |
| Arrastrar | Desplaza la vista (solo cuando está acercada) |
| Ctrl + rueda | Acerca o aleja hacia el cursor |
| Rueda | Acerca o aleja, una vez ya estás acercado |
| Doble clic en una sala | La encuadra y la selecciona |
| Botones − / % / + | Alejar, volver a la vista general, acercar |
| Flechas, + / −, Esc | Lo mismo con el teclado (el plano admite foco) |
| Pellizco | Zoom en pantalla táctil |

Con el plano entero a la vista la rueda sola desplaza la página, para no secuestrar
el scroll; hace falta Ctrl. Ya acercado, la rueda manda. Por el mismo motivo el
canvas solo captura el gesto táctil (`touch-action: none`) cuando está acercado.

La cámara vive en `engine/camera.ts`: guarda el zoom y el punto de la escena que
queda en el centro, y recorta esa posición para que el plano no se despegue de los
bordes. Encuadrar una sala y volver a la vista general van interpolados; el
arrastre y la rueda son directos, sin retardo.

### Modo presentación

El botón «Presentación» arranca un recorrido guiado: la cámara pasa por las
etapas del proceso encuadrando cada sala, con un rótulo que explica qué ocurre
allí. La planta sigue funcionando mientras tanto, que es la gracia.

Las paradas están en `tour.stops` dentro de `plant.json` —sala, título, texto y
duración—, así que cambiar el guion no toca código. `room: null` encuadra el
plano entero. `tour.zoomLimit` topa el acercamiento: sin él, una sala pequeña
como Pesaje llenaría el lienzo al 740 % y se perdería el contexto.

Cualquier gesto manual (arrastrar, rueda, pellizco) corta el recorrido y deja la
cámara donde está, sin devolverla de golpe. `Esc` sale y vuelve a la vista
general.

### Inclinación de la vista

`view.tilt` controla el factor vertical de la proyección: cuánto baja en pantalla
un paso en el plano. `0.5` es la isometría clásica; bajarlo aplana la vista y
reduce bastante el alto que ocupa el plano, que en un portátil es lo que obliga a
hacer scroll.

| `tilt` | Alto del canvas a 1440 px de ancho |
| --- | --- |
| 0.50 | 793 px |
| 0.42 | 681 px |
| **0.36** (actual) | **597 px** |
| 0.30 | 513 px |

El encuadre no está codificado a mano: `engine/bounds.ts` proyecta todo lo que se
dibuja (solar, muros, equipos, arbolado, camión y recorridos) y calcula el
rectángulo que ocupa, así que al cambiar `tilt` el canvas se redimensiona solo sin
recortar ni dejar huecos. En desarrollo se puede probar en caliente desde la
consola con `__planta.setTilt(0.3)`.

### Separación de responsabilidades

El motor (`src/engine/`) es dueño del canvas, del bucle `requestAnimationFrame` y
de todo el estado mutable de la simulación. No importa React.

La animación **no pasa por el estado de React**: se dibuja directo en el canvas a
la frecuencia del navegador. El motor publica un *snapshot* al store unas 4 veces
por segundo, y de ahí leen los paneles con `useSyncExternalStore`. Los controles
(pausa, velocidad, desviación, selector de sala) llaman a métodos del motor.

### Colores y tema

Todos los colores salen de variables CSS definidas en `src/styles/theme.css`, con
tema claro, oscuro automático por `prefers-color-scheme` y override manual con
`data-theme` en `<html>`. El canvas no puede usar `var(--x)`, así que
`engine/colors.ts` lee los valores calculados de `:root` y los relee cuando cambia
el tema.

El selector de la cabecera (Sistema / Claro / Oscuro) escribe ese `data-theme` y
recuerda la elección en `localStorage`. Sin él, quien tenga el sistema en oscuro
no puede ver nunca el tema claro. Un script en `index.html` aplica el tema
guardado antes del primer pintado para que no parpadee al recargar.

## Despliegue

Configurado para Vercel (`vercel.json`): framework Vite, `npm run build`, salida
en `dist/`. No hay variables de entorno.

El despliegue muestra la planta ficticia, porque `plant.local.json` no sale de
tu máquina. Si alguna vez despliegas un plano real, protege el despliegue antes:
una URL de Vercel es pública por defecto.

```bash
npx vercel          # entorno de vista previa
npx vercel --prod   # producción
```

## Pendiente

1. Planta primera como segundo nivel conmutable.
2. Modo editor del plano.
3. Varios lotes a la vez y trazabilidad por lote.
4. Conectar una exportación de SAP Business One.
5. Supabase para salas, puertas, lotes y eventos.
