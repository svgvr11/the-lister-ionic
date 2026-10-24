import { describe, expect, it } from 'vitest';
import {
  CANCEL_ICON,
  DELETE_ICON,
  EDIT_FIELD_BG,
  EDIT_FIELD_TEXT,
  contrastRatio,
  onAccentToken,
  pickOnAccent
} from './edit-contrast';
import { BOARD_THEMES } from '../../board-themes';

/**
 * Pruebas de contraste del modo edición. Migrado desde scripts/test-edit-contrast.mjs.
 * Se comprueba que cada tema cumple los umbrales WCAG que exige el diseño.
 */

// Fondos derivados con color-mix replicados aquí: mezclar un hex con
// blanco/negro en un porcentaje dado (espacio srgb, aproximación lineal por
// canal, suficiente para verificar umbrales WCAG).
const mix = (hex: string, other: string, pct: number): string => {
  const px = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [px(hex), px(other)];
  const t = pct / 100;
  return (
    '#' +
    a
      .map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0'))
      .join('')
  );
};

describe('edit-contrast: cada tema cumple los umbrales WCAG', () => {
  for (const theme of BOARD_THEMES) {
    describe(`${theme.id}`, () => {
      it('icono sobre acento >= 3:1', () => {
        const on = onAccentToken(pickOnAccent(theme.accent));
        expect(contrastRatio(on, theme.accent)).toBeGreaterThanOrEqual(3);
      });

      it('icono sobre acento:hover >= 3:1', () => {
        const on = onAccentToken(pickOnAccent(theme.accent));
        const hover = mix(theme.accent, '#ffffff', 85);
        expect(contrastRatio(on, hover)).toBeGreaterThanOrEqual(3);
      });

      it('texto del campo sobre su fondo >= 4.5:1', () => {
        expect(contrastRatio(EDIT_FIELD_TEXT, EDIT_FIELD_BG)).toBeGreaterThanOrEqual(4.5);
      });

      it('borde del campo contra tarjeta >= 3:1', () => {
        // Borde en acento pleno del tema (sin mezcla): único valor que pasa en
        // los 6 temas con margen (el mix al 85% queda en 3.01, demasiado justo).
        expect(contrastRatio(theme.accent, EDIT_FIELD_BG)).toBeGreaterThanOrEqual(3);
      });

      it('cancelar (neutro y hover) >= 3:1', () => {
        expect(contrastRatio(CANCEL_ICON, EDIT_FIELD_BG)).toBeGreaterThanOrEqual(3);
        const hoverBg = mix(theme.accent, '#ffffff', 10);
        expect(contrastRatio(CANCEL_ICON, hoverBg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(EDIT_FIELD_TEXT, hoverBg)).toBeGreaterThanOrEqual(3);
      });

      it('eliminar (reposo y hover) >= 3:1', () => {
        const bg = mix(DELETE_ICON, '#ffffff', 10);
        const hoverBg = mix(DELETE_ICON, '#ffffff', 18);
        expect(contrastRatio(DELETE_ICON, bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(DELETE_ICON, hoverBg)).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('pickOnAccent devuelve light o dark y mapea a tokens', () => {
    for (const theme of BOARD_THEMES) {
      const choice = pickOnAccent(theme.accent);
      expect(['light', 'dark']).toContain(choice);
      expect(['#fff', '#172236']).toContain(onAccentToken(choice));
    }
  });
});
