/**
 * Sube el número de versión en src/app/core/app-version.ts (el único sitio donde está
 * definida) conservando el sufijo: 1.9-alpha → 1.10-alpha → 1.11-alpha.
 *
 * Solo reescribe esa línea. No toca package.json ni el proyecto de Android.
 * Si el formato no se reconoce, falla con un mensaje claro y no escribe nada.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const archivo = join(raiz, 'src', 'app', 'core', 'app-version.ts');

const LINEA = /^export const APP_VERSION = '([^']*)';$/m;

const contenido = readFileSync(archivo, 'utf8');
const coincidencia = LINEA.exec(contenido);
if (!coincidencia) {
  console.error(`No se encontró la línea "export const APP_VERSION = '...';" en ${archivo}. No se ha escrito nada.`);
  process.exit(1);
}

const actual = coincidencia[1];
// Formato esperado: 1.9, 1.9-alpha, 1.10-rc1... Se separa en número y sufijo opcional.
const formato = /^(\d+)\.(\d+)([-.][A-Za-z0-9.-]+)?$/;
const partes = formato.exec(actual);
if (!partes) {
  console.error(`La versión actual "${actual}" no tiene el formato esperado (MAYOR.MENOR[-SUFIJO], por ejemplo 1.9-alpha). No se ha escrito nada.`);
  process.exit(1);
}

const siguiente = `${partes[1]}.${Number(partes[2]) + 1}${partes[3] ?? ''}`;

const actualizado = contenido.replace(LINEA, `export const APP_VERSION = '${siguiente}';`);
if (actualizado === contenido) {
  console.error('El archivo no ha cambiado; revisa la línea de APP_VERSION. No se ha escrito nada.');
  process.exit(1);
}

writeFileSync(archivo, actualizado, 'utf8');
console.log(`Versión actualizada: ${actual} → ${siguiente} (src/app/core/app-version.ts)`);
