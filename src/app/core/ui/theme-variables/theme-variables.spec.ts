import { describe, expect, it } from 'vitest';
import { BOARD_THEMES } from '../../board/board-themes/board-themes';
import { onAccentToken, pickOnAccent } from '../edit-contrast/edit-contrast';
import { THEME_CARD_SURFACE, boardThemeVariables } from './theme-variables';

describe('theme-variables: mapa puro del tema', () => {
  it('reconstruye las variables que board.page declara en su :host', () => {
    const theme = BOARD_THEMES[0];
    const vars = boardThemeVariables(theme);

    expect(vars['--board-bg']).toBe(theme.background);
    expect(vars['--topbar-bg']).toBe(theme.toolbar);
    expect(vars['--accent']).toBe(theme.accent);
    expect(vars['--on-accent']).toBe(onAccentToken(pickOnAccent(theme.accent)));
    expect(vars['--fab-color']).toBe(theme.fab);
    expect(vars['--fab-hover']).toBe(theme.accent);
    expect(vars['--card-surface']).toBe(THEME_CARD_SURFACE);
    expect(vars['--focus-muted-text']).toBe(
      `color-mix(in srgb, ${theme.accent} 60%, transparent)`
    );
  });

  it('cada tema produce su propio acento y su propio texto sobre acento', () => {
    for (const theme of BOARD_THEMES) {
      const vars = boardThemeVariables(theme);
      expect(vars['--accent']).toBe(theme.accent);
      expect(vars['--on-accent']).toBe(onAccentToken(pickOnAccent(theme.accent)));
      expect(vars['--board-bg']).toBe(theme.background);
    }
  });

  it('no muta el tema recibido', () => {
    const theme = { ...BOARD_THEMES[0] };
    boardThemeVariables(theme);
    expect(theme).toEqual(BOARD_THEMES[0]);
  });
});
