import { describe, expect, it } from 'vitest';
import { MAX_LIST_TITLE_LENGTH, normalizeListTitle } from './limits';

/**
 * Pruebas de la normalización de títulos. Migrado desde scripts/test-list-title.mjs.
 * Todos los caminos de entrada (crear, editar, restaurar, pegar) aplican esta misma regla.
 */

/** Comprueba que no queda ningún surrogante suelto en la representación UTF-16. */
const expectSinSurrogatesSueltos = (text: string): void => {
  for (let i = 0; i < text.length; i++) {
    const cu = text.charCodeAt(i);
    const isHigh = cu >= 0xd800 && cu <= 0xdbff;
    const isLow = cu >= 0xdc00 && cu <= 0xdfff;
    if (isHigh) {
      // High surrogate debe tener low surrogate siguiente
      expect(i + 1 < text.length, 'High surrogate al final').toBe(true);
      const nextCu = text.charCodeAt(i + 1);
      expect(nextCu >= 0xdc00 && nextCu <= 0xdfff, 'High surrogate sin low siguiente').toBe(true);
    }
    if (isLow) {
      // Low surrogate debe tener high surrogate previo
      expect(i > 0, 'Low surrogate al inicio').toBe(true);
      const prevCu = text.charCodeAt(i - 1);
      expect(prevCu >= 0xd800 && prevCu <= 0xdbff, 'Low surrogate sin high previo').toBe(true);
    }
  }
};

describe('limits: normalizeListTitle', () => {
  it('recorta a 90 caracteres', () => {
    const long = 'a'.repeat(100);
    const result = normalizeListTitle(long);
    expect(result.length).toBe(MAX_LIST_TITLE_LENGTH);
    expect(result).toBe('a'.repeat(90));
  });

  it('89 caracteres no se recorta', () => {
    const text = 'a'.repeat(89);
    const result = normalizeListTitle(text);
    expect(result.length).toBe(89);
    expect(result).toBe(text);
  });

  it('90 caracteres no se recorta', () => {
    const text = 'a'.repeat(90);
    const result = normalizeListTitle(text);
    expect(result.length).toBe(90);
    expect(result).toBe(text);
  });

  it('91 caracteres se recorta a 90', () => {
    const text = 'a'.repeat(91);
    const result = normalizeListTitle(text);
    expect(result.length).toBe(90);
    expect(result).toBe('a'.repeat(90));
  });

  it('colapsa espacios y saltos de línea', () => {
    const text = '  hola   mundo\n\n\t  test  ';
    const result = normalizeListTitle(text);
    expect(result).toBe('hola mundo test');
  });

  it('trim al inicio y final', () => {
    const text = '   título   ';
    const result = normalizeListTitle(text);
    expect(result).toBe('título');
  });

  it('vacío tras normalizar devuelve string vacío', () => {
    expect(normalizeListTitle('')).toBe('');
    expect(normalizeListTitle('   \n\t  ')).toBe('');
  });

  it('emojis simples no se parten', () => {
    const emoji = '😀';
    const text = 'a'.repeat(89) + emoji; // 89 + 1 = 90 code points
    const result = normalizeListTitle(text);
    expect(Array.from(result).length).toBe(90);
    // Verificar que no hay surrogates sueltos en la representación UTF-16
    expectSinSurrogatesSueltos(result);
  });

  it('emojis compuestos (pares sustitutos) no se parten', () => {
    // Familia: 👨‍👩‍👧‍👦 = 7 code points (4 emojis + 3 ZWJ)
    const family = '👨‍👩‍👧‍👦';
    expect(Array.from(family).length).toBe(7);

    const text = 'a'.repeat(80) + family; // 80 + 7 = 87 code points
    const result = normalizeListTitle(text);
    expect(Array.from(result).length).toBe(87);
    expectSinSurrogatesSueltos(result);
  });

  it('pegado de 5000 caracteres se recorta a 90', () => {
    const text = 'x'.repeat(5000);
    const result = normalizeListTitle(text);
    expect(result.length).toBe(90);
    expect(result).toBe('x'.repeat(90));
  });

  it('JSON largo sin espacios se recorta correctamente', () => {
    const json = '{"a":1,"b":2,"c":3,"d":4,"e":5,"f":6,"g":7,"h":8,"i":9,"j":10}';
    const longJson = json.repeat(20); // ~1000+ caracteres
    const result = normalizeListTitle(longJson);
    expect(result.length).toBe(90);
    // No debe partir en medio de un carácter
    expect(result.endsWith('\\')).toBe(false);
  });

  it('caracteres astrales (𝄞, 𝌆) no se parten', () => {
    const musical = '𝄞'; // U+1D11E - 1 code point (astral), 2 UTF-16 code units
    const text = 'a'.repeat(89) + musical; // 89 + 1 = 90 code points
    const result = normalizeListTitle(text);
    expect(Array.from(result).length).toBe(90);
    expectSinSurrogatesSueltos(result);
  });

  it('tabs y múltiples espacios se colapsan', () => {
    const text = 'uno\t\t\tdos\n\n\ntres   cuatro';
    const result = normalizeListTitle(text);
    expect(result).toBe('uno dos tres cuatro');
  });
});
