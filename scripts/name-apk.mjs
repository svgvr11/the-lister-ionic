/**
 * Copia el APK de depuración a un archivo con la versión en el nombre:
 *   android/app/build/outputs/apk/debug/app-debug.apk
 *     → thelister-v{APP_VERSION}.apk (en el mismo directorio).
 *
 * La versión sale SOLO de src/app/core/app-version.ts, leída con leerVersion()
 * de scripts/bump-version.mjs (mismo método/regex, nada escrito a mano).
 * No borra app-debug.apk; sobrescribe el destino si ya existe.
 *
 * Uso:
 *   node scripts/name-apk.mjs        (normalmente al final de `npm run apk`)
 *
 * Falla sin escribir nada si la versión no cumple MAYOR.FEATURE.BUILD-sufijo
 * o si app-debug.apk no existe (primero hay que compilar).
 */
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { FORMATO, leerVersion } from './bump-version.mjs';

export const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
export const DIR_APK = join(raiz, 'android', 'app', 'build', 'outputs', 'apk', 'debug');
export const APK_ORIGEN = join(DIR_APK, 'app-debug.apk');

/**
 * Función pura: construye el nombre del APK versionado.
 * Lanza si la versión no tiene el formato MAYOR.FEATURE.BUILD-sufijo.
 *
 * @param {string} version versión sin la "v", p. ej. '1.16.2-a'
 * @returns {string} p. ej. 'thelister-v1.16.2-a.apk'
 */
export function apkFileName(version) {
  if (!FORMATO.test(version)) {
    throw new Error(
      `La versión "${version}" no tiene el formato esperado ` +
        `(MAYOR.FEATURE.BUILD-sufijo, por ejemplo 1.16.2-a). No se ha copiado nada.`
    );
  }
  return `thelister-v${version}.apk`;
}

/** Copia app-debug.apk al nombre versionado; imprime ruta absoluta y tamaño. */
export function ejecutar() {
  const { actual } = leerVersion();
  const nombre = apkFileName(actual);
  if (!existsSync(APK_ORIGEN)) {
    throw new Error(
      `No se encontró ${APK_ORIGEN}. Primero hay que compilar ` +
        `(\`npm run apk\` o \`./gradlew assembleDebug\` en android/). No se ha copiado nada.`
    );
  }
  const destino = join(DIR_APK, nombre);
  copyFileSync(APK_ORIGEN, destino);
  const { size } = statSync(destino);
  const mb = (size / (1024 * 1024)).toFixed(2);
  console.log(`APK versionado: ${destino} (${size} bytes, ${mb} MB)`);
  return destino;
}

// Solo se ejecuta si este archivo es el punto de entrada: así los tests pueden
// importar apkFileName sin disparar la copia.
const invocadoComoScript =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invocadoComoScript) {
  try {
    ejecutar();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
