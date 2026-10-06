import assert from 'node:assert/strict';
import { editKeyAction, normalizePastedEditText, splitEditOnNewline } from '../src/app/core/inline-edit.ts';

let cases = 0;
const check = (label, fn) => { fn(); cases++; console.log(`  ok  ${label}`); };

check('Enter guarda', () => assert.equal(editKeyAction({ key: 'Enter' }), 'save'));
check('Shift+Enter no inserta salto', () => assert.equal(editKeyAction({ key: 'Enter', shiftKey: true }), 'ignore-newline'));
check('Escape cancela', () => assert.equal(editKeyAction({ key: 'Escape' }), 'cancel'));
check('Enter en composicion no guarda (Android/acentos)', () => {
  assert.equal(editKeyAction({ key: 'Enter', isComposing: true }), 'none');
  assert.equal(editKeyAction({ key: 'Enter', shiftKey: true, isComposing: true }), 'none');
});
check('Escape cancela incluso en composicion', () => assert.equal(editKeyAction({ key: 'Escape', isComposing: true }), 'cancel'));
check('otras teclas no hacen nada', () => {
  assert.equal(editKeyAction({ key: 'a' }), 'none');
  assert.equal(editKeyAction({ key: 'Tab' }), 'none');
});
check('pegado: saltos y tabs a espacios', () => {
  assert.equal(normalizePastedEditText('hola\nmundo'), 'hola mundo');
  assert.equal(normalizePastedEditText('a\r\nb\tc'), 'a b c');
  assert.equal(normalizePastedEditText('uno   dos'), 'uno dos');
  assert.equal(normalizePastedEditText(''), '');
});
check('respaldo Android: salto tras input se trata como Enter', () => {
  assert.deepEqual(splitEditOnNewline('comprar pan'), { before: 'comprar pan', hadNewline: false });
  assert.deepEqual(splitEditOnNewline('comprar\npan resto'), { before: 'comprar', hadNewline: true });
  const r = splitEditOnNewline('a\rb');
  assert.equal(r.hadNewline, true);
  assert.equal(r.before, 'a');
});

console.log(`inline-edit: ${cases} cases passed`);
