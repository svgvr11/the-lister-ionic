/**
 * Sube la versión en src/app/core/app-version.ts (el único sitio donde está definida).
 *
 * Formato MAYOR.FEATURE.BUILD-a. El script decide solo, según el estado del árbol:
 *   - árbol limpio (git status --porcelain vacío): MAYOR igual, FEATURE +1, BUILD = 0
 *   - árbol con cambios:                      MAYOR igual, FEATURE igual, BUILD +1
 *   - --major:                                 MAYOR +1, FEATURE = 0, BUILD = 0
 * El sufijo se conserva siempre.
 *
 * Uso:
 *   npm run version:bump                  sube la versión y la escribe
 *   npm run version:bump -- --dry-run     solo muestra "vieja → nueva (motivo)"
 *   npm run version:bump -- --major       sube MAYOR (deja FEATURE y BUILD en 0)
 *
 * Solo reescribe esa línea. No toca package.json ni el proyecto de Android.
 * Si el formato no se reconoce, o si git no está disponible, falla con un mensaje
 * claro y no escribe nada.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
export const ARCHIVO = join(raiz, 'src', 'app', 'core', 'app-version.ts');

const LINEA = /^export const APP_VERSION = '([^']*)';$/m;

/** Formato obligatorio: MAYOR.FEATURE.BUILD-a. */
export const FORMATO = /^(\d+)\.(\d+)\.(\d+)-([a-z]+)$/;

/**
 * Función pura: devuelve la versión siguiente a partir de la actual y de las reglas.
 * No lee ni escribe nada, así que se puede probar directamente.
 *
 * @param {string} current      versión actual, p. ej. '1.9.4-a'
 * @param {boolean} treeIsClean árbol sin cambios (git status --porcelain vacío)
 * @param {boolean} major       el usuario ha pedido subir la versión mayor
 * @returns {string} la versión siguiente, conservando el sufijo
 */
export function nextVersion(current, treeIsClean, major) {
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

  if (major) return `${mayor + 1}.0.0-${sufijo}`;
  if (treeIsClean) return `${mayor}.${feature + 1}.0-${sufijo}`;
  return `${mayor}.${feature}.${build + 1}-${sufijo}`;
}

/** Función pura: el motivo que se muestra junto a la versión, según la regla aplicada. */
export function motivo(treeIsClean, major) {
  if (major) return 'major: sube MAYOR y pone FEATURE y BUILD en 0';
  if (treeIsClean) return 'árbol limpio: sube FEATURE y pone BUILD en 0';
  return 'con cambios: sube BUILD';
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
/**
 * Estado del árbol de trabajo. Falla (sin escribir nada) si git no está disponible
 * o si no estamos en un repositorio: el script no adivina.
 *
 * @returns {boolean} true si `git status --porcelain` no devuelve ninguna línea
 */
export function arbolLimpio() {
  const res = spawnSync('git', ['status', '--porcelain'], {
    cwd: raiz,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (res.error) {
    throw new Error(
      'No se pudo ejecutar "git status --porcelain" ' +
        `(${res.error.message}). El script necesita git para decidir la regla. No se ha escrito nada.`
    );
  }
  if (res.status !== 0) {
    const detalle = (res.stderr || '').trim();
    throw new Error(
      `"git status --porcelain" falló con código ${res.status}${detalle ? `: ${detalle}` : ''}. No se ha escrito nada.`
    );
  }
  return res.stdout.trim() === '';
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
  const dryRun = argv.includes('--dry-run');
  const major = argv.includes('--major');
  const desconocidas = argv.filter((a) => a !== '--dry-run' && a !== '--major');
  if (desconocidas.length > 0) {
    console.error(
      `Opción desconocida: ${desconocidas.join(', ')}. Opciones válidas: --dry-run, --major. No se ha escrito nada.`
    );
    process.exit(1);
  }

  const { actual, contenido } = leerVersion();
  const treeIsClean = arbolLimpio();
  const siguiente = nextVersion(actual, treeIsClean, major);
  const razon = motivo(treeIsClean, major);

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