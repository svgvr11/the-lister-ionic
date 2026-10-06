/**
 * Enlaces legales públicos (páginas estáticas en la raíz de thelister.atenis.app).
 *
 * Son URLs absolutas a propósito: el footer y el login se ven también dentro del APK,
 * donde un `routerLink` interno no serviría para la ficha de Google Play. En nativo se
 * abren con el plugin Browser de Capacitor; en web, con `target="_blank"`.
 */
export const PRIVACY_PAGE_URL = 'https://thelister.atenis.app/privacidad.html';
export const DELETE_ACCOUNT_PAGE_URL = 'https://thelister.atenis.app/eliminar-cuenta.html';
