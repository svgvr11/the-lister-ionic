/**
 * ÚNICA fuente de la versión de la app. Ningún otro archivo la escribe a mano: para
 * subirla se usa `npm run version:bump`, que reescribe la línea de APP_VERSION.
 *
 * Formato: MAYOR.FEATURE.BUILD-a (por ejemplo 1.9.5-a).
 * - MAYOR: versión importante; solo sube si el usuario lo pide (`--major`).
 * - FEATURE: el feature en desarrollo; sube cuando el árbol está limpio.
 * - BUILD: compilación dentro del feature; sube cuando hay cambios sin commitear.
 * El sufijo se conserva al subir. La interfaz muestra APP_VERSION_LABEL (con la "v").
 */
export const APP_VERSION = '1.51.0-a';

/** Lo que se muestra en la interfaz: la versión con la "v" delante. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
