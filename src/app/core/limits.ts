/**
 * Límites y normalización de textos de la app.
 *
 * Este módulo centraliza las constantes de longitud máxima y la función de
 * normalización para títulos de lista, para que todos los caminos de entrada
 * (crear, editar, restaurar, importar) apliquen exactamente la misma regla.
 */

/** Longitud máxima permitida para el título de una lista, en puntos de código Unicode. */
export const MAX_LIST_TITLE_LENGTH = 90;

/**
 * Normaliza un título de lista en bruto.
 *
 * Reglas:
 * 1. Recorta espacios en blanco al inicio y al final (trim).
 * 2. Colapsa saltos de línea y espacios consecutivos a un solo espacio.
 * 3. Recorta a MAX_LIST_TITLE_LENGTH puntos de código Unicode sin partir
 *    pares sustitutos (surrogates) ni emojis compuestos.
 *
 * @param raw Título en bruto (puede venir de pegado, input, importación, etc.)
 * @returns Título normalizado, listo para guardar o mostrar.
 */
export function normalizeListTitle(raw: string): string {
  if (!raw) return '';

  // 1. Trim
  let normalized = raw.trim();

  // 2. Colapsar saltos de línea y espacios consecutivos a un solo espacio
  normalized = normalized.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');

  // 3. Recortar a MAX_LIST_TITLE_LENGTH puntos de código sin partir surrogates
  if (normalized.length > MAX_LIST_TITLE_LENGTH) {
    // Usar Array.from para iterar por puntos de código (maneja surrogates y emojis)
    const codePoints = Array.from(normalized);
    normalized = codePoints.slice(0, MAX_LIST_TITLE_LENGTH).join('');
  }

  return normalized;
}