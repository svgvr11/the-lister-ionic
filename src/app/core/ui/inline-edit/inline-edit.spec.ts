import { describe, expect, it } from 'vitest';
import {
  editKeyAction,
  maxInlineEditHeight,
  normalizePastedEditText,
  splitEditOnNewline
} from './inline-edit';

/**
 * Pruebas del editor en línea. Migrado desde scripts/test-inline-edit.mjs.
 * La composición IME (Android/acentos) se respeta: con isComposing no se guarda.
 */
describe('inline-edit: teclas', () => {
  it('Enter guarda', () => {
    expect(editKeyAction({ key: 'Enter' })).toBe('save');
  });

  it('Shift+Enter no inserta salto', () => {
    expect(editKeyAction({ key: 'Enter', shiftKey: true })).toBe('ignore-newline');
  });

  it('Escape cancela', () => {
    expect(editKeyAction({ key: 'Escape' })).toBe('cancel');
  });

  it('Enter en composición no guarda (Android/acentos)', () => {
    expect(editKeyAction({ key: 'Enter', isComposing: true })).toBe('none');
    expect(editKeyAction({ key: 'Enter', shiftKey: true, isComposing: true })).toBe('none');
  });

  it('Escape cancela incluso en composición', () => {
    expect(editKeyAction({ key: 'Escape', isComposing: true })).toBe('cancel');
  });

  it('otras teclas no hacen nada', () => {
    expect(editKeyAction({ key: 'a' })).toBe('none');
    expect(editKeyAction({ key: 'Tab' })).toBe('none');
  });
});

describe('inline-edit: pegado y saltos de línea', () => {
  it('pegado: saltos y tabs a espacios', () => {
    expect(normalizePastedEditText('hola\nmundo')).toBe('hola mundo');
    expect(normalizePastedEditText('a\r\nb\tc')).toBe('a b c');
    expect(normalizePastedEditText('uno   dos')).toBe('uno dos');
    expect(normalizePastedEditText('')).toBe('');
  });

  it('respaldo Android: salto tras input se trata como Enter', () => {
    expect(splitEditOnNewline('comprar pan')).toEqual({
      before: 'comprar pan',
      hadNewline: false
    });
    expect(splitEditOnNewline('comprar\npan resto')).toEqual({
      before: 'comprar',
      hadNewline: true
    });
    const r = splitEditOnNewline('a\rb');
    expect(r.hadNewline).toBe(true);
    expect(r.before).toBe('a');
  });
});

describe('inline-edit: altura máxima', () => {
  it('40vh del viewport', () => {
    expect(maxInlineEditHeight(1000)).toBe(400);
    expect(maxInlineEditHeight(0)).toBe(0);
    expect(maxInlineEditHeight(-10)).toBe(0);
  });
});