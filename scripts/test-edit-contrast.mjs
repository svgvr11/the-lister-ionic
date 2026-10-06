import assert from 'node:assert/strict';
import { BOARD_THEMES } from '../src/app/core/board-themes.ts';
import {
  CANCEL_ICON, DELETE_ICON, EDIT_FIELD_BG, EDIT_FIELD_TEXT,
  contrastRatio, onAccentToken, pickOnAccent,
} from '../src/app/core/edit-contrast.ts';

let cases = 0;
const check = (label, fn) => { fn(); cases++; console.log(`  ok  ${label}`); };

// Fondos derivados con color-mix replicados en Node: mezclar un hex con
// blanco/negro en un porcentaje dado (espacio srgb, aproximacion lineal por
// canal, suficiente para verificar umbrales WCAG).
const mix = (hex, other, pct) => {
  const px = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [px(hex), px(other)];
  const t = pct / 100;
  return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
};

for (const theme of BOARD_THEMES) {
  const on = onAccentToken(pickOnAccent(theme.accent));
  check(`${theme.id}: icono sobre acento >= 3:1`, () => {
    assert.ok(contrastRatio(on, theme.accent) >= 3, `${on} vs ${theme.accent}`);
  });
  check(`${theme.id}: icono sobre acento:hover >= 3:1`, () => {
    const hover = mix(theme.accent, '#ffffff', 85);
    assert.ok(contrastRatio(on, hover) >= 3, `${on} vs ${hover}`);
  });
  check(`${theme.id}: texto del campo sobre su fondo >= 4.5:1`, () => {
    assert.ok(contrastRatio(EDIT_FIELD_TEXT, EDIT_FIELD_BG) >= 4.5);
  });
  check(`${theme.id}: borde del campo contra tarjeta >= 3:1`, () => {
    // Borde en acento pleno del tema (sin mezcla): único valor que pasa en
    // los 6 temas con margen (el mix al 85% queda en 3.01, demasiado justo).
    assert.ok(contrastRatio(theme.accent, EDIT_FIELD_BG) >= 3, `${theme.accent} vs fondo`);
  });
  check(`${theme.id}: cancelar (neutro y hover) >= 3:1`, () => {
    assert.ok(contrastRatio(CANCEL_ICON, EDIT_FIELD_BG) >= 3);
    const hoverBg = mix(theme.accent, '#ffffff', 10);
    assert.ok(contrastRatio(CANCEL_ICON, hoverBg) >= 3, `cancelar vs ${hoverBg}`);
    assert.ok(contrastRatio(EDIT_FIELD_TEXT, hoverBg) >= 3, `cancelar:hover vs ${hoverBg}`);
  });
  check(`${theme.id}: eliminar (reposo y hover) >= 3:1`, () => {
    const bg = mix(DELETE_ICON, '#ffffff', 10);
    const hoverBg = mix(DELETE_ICON, '#ffffff', 18);
    assert.ok(contrastRatio(DELETE_ICON, bg) >= 3, `eliminar vs ${bg}`);
    assert.ok(contrastRatio(DELETE_ICON, hoverBg) >= 3, `eliminar:hover vs ${hoverBg}`);
  });
}

check('pickOnAccent devuelve light o dark y mapea a tokens', () => {
  for (const theme of BOARD_THEMES) {
    const choice = pickOnAccent(theme.accent);
    assert.ok(choice === 'light' || choice === 'dark');
    assert.ok(['#fff', '#172236'].includes(onAccentToken(choice)));
  }
});

console.log(`edit-contrast: ${cases} cases passed`);
