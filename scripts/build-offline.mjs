/**
 * Empaqueta la aplicación en un único fichero HTML que funciona con doble clic,
 * sin servidor y sin conexión.
 *
 * Hace falta incrustar el JavaScript dentro del HTML porque los navegadores
 * bloquean la carga de módulos desde file:// (el origen es "null" y salta CORS).
 * Un módulo escrito dentro de la página no se descarga, así que sí se ejecuta.
 *
 * El fichero resultante lleva el plano que haya compilado: si existe
 * plant.local.json, es el plano real. No lo subas a ningún sitio público.
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-offline';
const salida = 'planta-offline.html';

let html = readFileSync(join(dir, 'index.html'), 'utf8');

// Incrustar la hoja de estilos.
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, ruta) => {
  const css = readFileSync(join(dir, ruta), 'utf8');
  return `<style>\n${css}\n</style>`;
});

// Incrustar el módulo. El marcado de cierre se escapa por si aparece en el código.
html = html.replace(/<script[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, ruta) => {
  const js = readFileSync(join(dir, ruta), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});

writeFileSync(salida, html);
rmSync(dir, { recursive: true, force: true });

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`\n  ${salida}  ·  ${kb} KB  ·  un solo fichero, se abre con doble clic`);
console.log('  Lleva el plano compilado dentro. No lo publiques.\n');
