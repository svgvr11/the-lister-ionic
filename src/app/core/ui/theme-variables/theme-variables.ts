import type { BoardTheme } from '../../board/board-themes/board-themes';
import { onAccentToken, pickOnAccent } from '../edit-contrast/edit-contrast';

/** Superficie de tarjetas/diálogos: la misma que usa board.page en su :host. */
export const THEME_CARD_SURFACE = '#fff';

/**
 * Variables CSS del tema activo (PARTE C1).
 *
 * El sheet vive en un portal bajo `document.body`, así que NO hereda las variables
 * del `:host` de board.page. Este mapa las reconstruye a partir de `BoardTheme`
 * para aplicarlas en el host del sheet. Es lógica pura: no toca el DOM.
 */
export function boardThemeVariables(theme: BoardTheme): Record<string, string> {
  return {
    '--board-bg': theme.background,
    '--topbar-bg': theme.toolbar,
    '--accent': theme.accent,
    '--on-accent': onAccentToken(pickOnAccent(theme.accent)),
    '--fab-color': theme.fab,
    '--fab-hover': theme.accent,
    '--card-surface': THEME_CARD_SURFACE,
    '--focus-muted-text': `color-mix(in srgb, ${theme.accent} 60%, transparent)`
  };
}
