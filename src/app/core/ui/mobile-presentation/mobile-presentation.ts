/**
 * Presentación móvil (PARTE C4-C5).
 *
 * Única definición del umbral que decide si la app usa la presentación móvil
 * (≤700 px, el mismo que ya usaban los modales de board.page). La UI que necesita
 * un valor vivo (refresher, masonry) lo consume del servicio; los overlays
 * capturan una instantánea al abrirse para no cambiar a mitad de uso.
 */
export const MOBILE_PRESENTATION_MAX_WIDTH = 700;

/**
 * ¿Corresponde la presentación móvil a este ancho? Se escribe como `!(width > max)`
 * para que un ancho no finito caiga también del lado móvil, igual que
 * `welcomeVariant`.
 */
export function isMobilePresentationWidth(width: number): boolean {
  return !(width > MOBILE_PRESENTATION_MAX_WIDTH);
}
