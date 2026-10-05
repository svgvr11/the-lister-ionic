/**
 * ÚNICA fuente de la versión de la app. Ningún otro archivo la escribe a mano: para
 * subirla se usa `npm run version:bump`, que reescribe la línea de APP_VERSION.
 * El formato es `MAYOR.MENOR[-SUFIJO]`, por ejemplo 1.10-alpha.
 */
export const APP_VERSION = '1.12-alpha';

/** Lo que se muestra en la interfaz: la versión con la "v" delante. */
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
