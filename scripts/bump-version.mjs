/**
 * Sube la versión en src/app/core/app-version.ts (el único sitio donde está definida).
 *
 * Formato MAYOR.FEATURE.BUILD-a. El script NO decide nada: el tipo de subida se
 * indica siempre con un flag explícito (lo elige el usuario, tarea por tarea):
 *   --major:   MAYOR +1, FEATURE = 0, BUILD = 0
 *   --feature: MAYOR igual, FEATURE +1, BUILD = 0
 *   --build:   MAYOR igual, FEATURE igual, BUILD +1
 * El sufijo se conserva siempre. Sin flag de tipo (o con más de uno), falla.
 *
 * Uso:
 *   npm run version:bump -- --major
 *   npm run version:bump -- --feature
 *   npm run version:bump -- --build
 *   npm run version:bump -- --feature --dry-run   solo muestra "vieja → nueva (motivo)"
 *
 * Solo reescribe esa línea. No toca package.json ni el proyecto de Android.
 * Si el formato no se reconoce o los argumentos no son válidos, falla con un
 * mensaje claro y no escribe nada.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
export const ARCHIVO = join(raiz, 'src', 'app', 'core', 'app-version.ts');

const LINEA = /^export const APP_VERSION = '([^']*)';$/m;

/** Formato obligatorio: MAYOR.FEATURE.BUILD-a. */
export const FORMATO = /^(\d+)\.(\d+)\.(\d+)-([a-z]+)$/;

/** Tipos de subida válidos. */
export const TIPOS = ['major', 'feature', 'build'];

/**
 * Función pura: devuelve la versión siguiente a partir de la actual y del tipo pedido.
 * No lee ni escribe nada, así que se puede probar directamente.
 *
 * @param {string} current versión actual, p. ej. '1.9.4-a'
 * @param {'major'|'feature'|'build'} tipo tipo de subida elegido por el usuario
 * @returns {string} la versión siguiente, conservando el sufijo
 */
export function nextVersion(current, tipo) {
  if (!TIPOS.includes(tipo)) {
    throw new Error(
      `Tipo de subida "${tipo}" no válido. Usa uno de: ${TIPOS.map((t) => `--${t}`).join(', ')}. No se ha escrito nada.`
    );
  }
  const partes = FORMATO.exec(current);
  if (!partes) {
    throw new Error(
      `La versión actual "${current}" no tiene el formato esperado ` +
        `(MAYOR.FEATURE.BUILD-sufijo, por ejemplo 1.9.5-a). No se ha escrito nada.`
    );
  }
  // Number() y no parseInt sobre la cadena: los tres números suben como enteros
  // (1.9.9-a → 1.9.10-a, no como texto).
  const mayor = Number(partes[1]);
  const feature = Number(partes[2]);
  const build = Number(partes[3]);
  const sufijo = partes[4];

  if (tipo === 'major') return `${mayor + 1}.0.0-${sufijo}`;
  if (tipo === 'feature') return `${mayor}.${feature + 1}.0-${sufijo}`;
  return `${mayor}.${feature}.${build + 1}-${sufijo}`;
}

/** Función pura: el motivo que se muestra junto a la versión, según el tipo elegido. */
export function motivo(tipo) {
  if (tipo === 'major') return 'major: sube MAYOR y pone FEATURE y BUILD en 0';
  if (tipo === 'feature') return 'feature: sube FEATURE y pone BUILD en 0';
  if (tipo === 'build') return 'build: sube BUILD';
  throw new Error(`Tipo de subida "${tipo}" no válido. No se ha escrito nada.`);
}

/**
 * Función pura: interpreta los argumentos. Exige exactamente un tipo de subida
 * (--major, --feature o --build); --dry-run es opcional.
 *
 * @param {string[]} argv argumentos sin node ni el script
 * @returns {{ dryRun: boolean, tipo: 'major'|'feature'|'build' }}
 */
export function leerArgumentos(argv) {
  const validas = ['--dry-run', ...TIPOS.map((t) => `--${t}`)];
  const desconocidas = argv.filter((a) => !validas.includes(a));
  if (desconocidas.length > 0) {
    throw new Error(
      `Opción desconocida: ${desconocidas.join(', ')}. Opciones válidas: ${validas.join(', ')}. No se ha escrito nada.`
    );
  }
  const tipos = TIPOS.filter((t) => argv.includes(`--${t}`));
  if (tipos.length === 0) {
    throw new Error(
      'Falta el tipo de subida: indica exactamente uno de --major, --feature o --build ' +
        '(el script no lo decide solo). No se ha escrito nada.'
    );
  }
  if (tipos.length > 1) {
    throw new Error(
      `Tipos de subida incompatibles: ${tipos.map((t) => `--${t}`).join(', ')}. ` +
        'Indica solo uno. No se ha escrito nada.'
    );
  }
  return { dryRun: argv.includes('--dry-run'), tipo: tipos[0] };
}

/**
 * Función pura: reescribe solo la línea de APP_VERSION y devuelve el contenido nuevo.
 * Lanza si la línea no aparece (o el valor no ha cambiado).
 */
export function aplicarVersion(contenido, siguiente) {
  const actualizado = contenido.replace(LINEA, `export const APP_VERSION = '${siguiente}';`);
  if (actualizado === contenido) {
    throw new Error(
      'No se encontró la línea "export const APP_VERSION = ...;" o la versión no ha cambiado. No se ha escrito nada.'
    );
  }
  return actualizado;
}

/** Lee la versión actual del archivo; lanza si no está o no tiene el formato válido. */
export function leerVersion() {
  const contenido = readFileSync(ARCHIVO, 'utf8');
  const coincidencia = LINEA.exec(contenido);
  if (!coincidencia) {
    throw new Error(
      `No se encontró la línea "export const APP_VERSION = '...';" en ${ARCHIVO}. No se ha escrito nada.`
    );
  }
  const actual = coincidencia[1];
  if (!FORMATO.test(actual)) {
    throw new Error(
      `La versión actual "${actual}" no tiene el formato esperado ` +
        `(MAYOR.FEATURE.BUILD-sufijo, por ejemplo 1.9.5-a). No se ha escrito nada.`
    );
  }
  return { actual, contenido };
}

export function ejecutar(argv) {
  const { dryRun, tipo } = leerArgumentos(argv);

  const { actual, contenido } = leerVersion();
  const siguiente = nextVersion(actual, tipo);
  const razon = motivo(tipo);

  if (dryRun) {
    console.log(`[dry-run] ${actual} → ${siguiente} (${razon}). No se ha escrito nada.`);
    return;
  }

  writeFileSync(ARCHIVO, aplicarVersion(contenido, siguiente), 'utf8');
  console.log(`${actual} → ${siguiente} (${razon})`);
  console.log('Actualizada en src/app/core/app-version.ts');
}

// Solo se ejecuta si este archivo es el punto de entrada: así los tests pueden
// importar nextVersion/motivo/aplicarVersion sin disparar nada.
const invocadoComoScript =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invocadoComoScript) {
  try {
    ejecutar(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}