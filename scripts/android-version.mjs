/**
 * Deriva la versión de Android (versionName y versionCode) a partir de
 * src/app/core/app-version.ts y genera android/app/version.properties para Gradle.
 *
 * Fórmula versionCode: MAYOR * 1_000_000 + FEATURE * 1_000 + BUILD
 * Límites:
 * - 0 <= MAYOR <= 2099 (mayor de 2099 lanza error)
 * - 0 <= FEATURE <= 999 (mayor de 999 lanza error, 999 pasa)
 * - 0 <= BUILD <= 999 (mayor de 999 lanza error, 999 pasa)
 * Formato: MAYOR.FEATURE.BUILD-sufijo (ej. 1.31.1-a)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
export const ARCHIVO_VERSION = join(raiz, 'src', 'app', 'core', 'app-version.ts');
export const ARCHIVO_PROPERTIES = join(raiz, 'android', 'app', 'version.properties');

const LINEA_VERSION = /^export const APP_VERSION = '([^']*)';$/m;
export const FORMATO = /^(\d+)\.(\d+)\.(\d+)-([a-z]+)$/;

/**
 * Función pura: valida y calcula versionName y versionCode a partir del string de versión.
 * Lanza Error si no cumple formato o límites.
 */
export function parseAndroidVersion(versionStr) {
  const match = FORMATO.exec(versionStr);
  if (!match) {
    throw new Error(
      `Versión "${versionStr}" inválida. Debe cumplir el formato MAYOR.FEATURE.BUILD-sufijo (ej. 1.31.1-a).`
    );
  }

  const mayor = Number(match[1]);
  const feature = Number(match[2]);
  const build = Number(match[3]);
  const sufijo = match[4];

  if (mayor > 2099) {
    throw new Error(`MAYOR (${mayor}) no puede ser mayor que 2099.`);
  }
  if (feature > 999) {
    throw new Error(`FEATURE (${feature}) no puede ser mayor que 999.`);
  }
  if (build > 999) {
    throw new Error(`BUILD (${build}) no puede ser mayor que 999.`);
  }

  const versionCode = mayor * 1_000_000 + feature * 1_000 + build;
  const versionName = versionStr;

  return { mayor, feature, build, sufijo, versionName, versionCode };
}

/**
 * Lee la versión desde src/app/core/app-version.ts
 */
export function leerAppVersion() {
  const contenido = readFileSync(ARCHIVO_VERSION, 'utf8');
  const match = LINEA_VERSION.exec(contenido);
  if (!match) {
    throw new Error(`No se encontró APP_VERSION en ${ARCHIVO_VERSION}.`);
  }
  return match[1];
}

/**
 * Genera el contenido de android/app/version.properties
 */
export function generarPropertiesContent(versionName, versionCode) {
  return [
    `# Generado automáticamente por scripts/android-version.mjs`,
    `# No editar a mano. La única fuente de verdad es src/app/core/app-version.ts`,
    `VERSION_NAME=${versionName}`,
    `VERSION_CODE=${versionCode}`,
    ''
  ].join('\n');
}

export function ejecutar() {
  const versionStr = leerAppVersion();
  const info = parseAndroidVersion(versionStr);
  const content = generarPropertiesContent(info.versionName, info.versionCode);
  writeFileSync(ARCHIVO_PROPERTIES, content, 'utf8');
  console.log(`Android version synced: versionName=${info.versionName}, versionCode=${info.versionCode} -> android/app/version.properties`);
}

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
