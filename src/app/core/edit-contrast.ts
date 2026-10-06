/**
 * Contraste del modo edición (PARTE C).
 *
 * Función pura que elige el color del icono sobre el acento del tema.
 * Devuelve 'light' | 'dark' y el llamador lo mapea a tokens existentes del
 * proyecto (sin hex nuevos): light → #fff, dark → #172236.
 */

/** Tokens existentes reutilizados (ya presentes en board.page.scss). */
export const ON_ACCENT_LIGHT = '#fff';
export const ON_ACCENT_DARK = '#172236';

/** Texto del campo de edición (token existente) y su fondo. */
export const EDIT_FIELD_TEXT = '#172236';
export const EDIT_FIELD_BG = '#ffffff';

/** Iconos neutro y de peligro (tokens ya usados en la app). */
export const CANCEL_ICON = '#5c6372';
export const DELETE_ICON = '#e11d48';

export type OnAccent = 'light' | 'dark';

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa WCAG 2.1 de un hex #rrggbb. */
export function luminanceOf(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre dos hex (1..21). */
export function contrastRatio(a: string, b: string): number {
  const l1 = luminanceOf(a);
  const l2 = luminanceOf(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Elige 'light' (icono #fff) o 'dark' (icono #172236) según qué contraste
 * sobre el relleno sea mayor. Pura y sin DOM.
 */
export function pickOnAccent(accentHex: string): OnAccent {
  const light = contrastRatio(ON_ACCENT_LIGHT, accentHex);
  const dark = contrastRatio(ON_ACCENT_DARK, accentHex);
  return light >= dark ? 'light' : 'dark';
}

/** Mapea el resultado a un token existente (sin hex nuevos). */
export function onAccentToken(choice: OnAccent): string {
  return choice === 'light' ? ON_ACCENT_LIGHT : ON_ACCENT_DARK;
}
