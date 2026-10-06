import assert from 'node:assert/strict';
import { MAX_LIST_TITLE_LENGTH, normalizeListTitle } from '../src/app/core/limits.ts';

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. Recorta a 90 caracteres
check('recorta a 90 caracteres', () => {
  const long = 'a'.repeat(100);
  const result = normalizeListTitle(long);
  assert.equal(result.length, MAX_LIST_TITLE_LENGTH);
  assert.equal(result, 'a'.repeat(90));
});

// 2. Texto de 89 caracteres no se recorta
check('89 caracteres no se recorta', () => {
  const text = 'a'.repeat(89);
  const result = normalizeListTitle(text);
  assert.equal(result.length, 89);
  assert.equal(result, text);
});

// 3. Texto de 90 caracteres no se recorta
check('90 caracteres no se recorta', () => {
  const text = 'a'.repeat(90);
  const result = normalizeListTitle(text);
  assert.equal(result.length, 90);
  assert.equal(result, text);
});

// 4. Texto de 91 caracteres se recorta a 90
check('91 caracteres se recorta a 90', () => {
  const text = 'a'.repeat(91);
  const result = normalizeListTitle(text);
  assert.equal(result.length, 90);
  assert.equal(result, 'a'.repeat(90));
});

// 5. Espacios y saltos de línea colapsados
check('colapsa espacios y saltos de línea', () => {
  const text = '  hola   mundo\n\n\t  test  ';
  const result = normalizeListTitle(text);
  assert.equal(result, 'hola mundo test');
});

// 6. Trim al inicio y final
check('trim al inicio y final', () => {
  const text = '   título   ';
  const result = normalizeListTitle(text);
  assert.equal(result, 'título');
});

// 7. Vacío tras normalizar devuelve ''
check('vacío tras normalizar devuelve string vacío', () => {
  assert.equal(normalizeListTitle(''), '');
  assert.equal(normalizeListTitle('   \n\t  '), '');
});

// 8. Emojis no se parten en el corte (un emoji = 1 code point, pero 2 code units UTF-16)
check('emojis simples no se parten', () => {
  const emoji = '😀';
  const text = 'a'.repeat(89) + emoji; // 89 + 1 = 90 code points
  const result = normalizeListTitle(text);
  assert.equal(Array.from(result).length, 90);
  // Verificar que no hay surrogates sueltos en la representación UTF-16
  // Usamos el string directamente para iterar code units
  for (let i = 0; i < result.length; i++) {
    const cu = result.charCodeAt(i);
    const isHigh = cu >= 0xD800 && cu <= 0xDBFF;
    const isLow = cu >= 0xDC00 && cu <= 0xDFFF;
    if (isHigh) {
      // High surrogate debe tener low surrogate siguiente
      assert.ok(i + 1 < result.length, 'High surrogate al final');
      const nextCu = result.charCodeAt(i + 1);
      assert.ok(nextCu >= 0xDC00 && nextCu <= 0xDFFF, 'High surrogate sin low siguiente');
    }
    if (isLow) {
      // Low surrogate debe tener high surrogate previo
      assert.ok(i > 0, 'Low surrogate al inicio');
      const prevCu = result.charCodeAt(i - 1);
      assert.ok(prevCu >= 0xD800 && prevCu <= 0xDBFF, 'Low surrogate sin high previo');
    }
  }
});

// 9. Emojis compuestos (familia, bandera, tono de piel) - usar Array.from para code points
check('emojis compuestos (pares sustitutos) no se parten', () => {
  // Familia: 👨‍👩‍👧‍👦 = 7 code points (4 emojis + 3 ZWJ)
  const family = '👨‍👩‍👧‍👦';
  assert.equal(Array.from(family).length, 7);
  
  const text = 'a'.repeat(80) + family; // 80 + 7 = 87 code points
  const result = normalizeListTitle(text);
  assert.equal(Array.from(result).length, 87);
  // Verificar que no hay surrogates sueltos en UTF-16
  for (let i = 0; i < result.length; i++) {
    const cu = result.charCodeAt(i);
    const isHigh = cu >= 0xD800 && cu <= 0xDBFF;
    const isLow = cu >= 0xDC00 && cu <= 0xDFFF;
    if (isHigh) {
      assert.ok(i + 1 < result.length, 'High surrogate al final');
      const nextCu = result.charCodeAt(i + 1);
      assert.ok(nextCu >= 0xDC00 && nextCu <= 0xDFFF, 'High surrogate sin low siguiente');
    }
    if (isLow) {
      assert.ok(i > 0, 'Low surrogate al inicio');
      const prevCu = result.charCodeAt(i - 1);
      assert.ok(prevCu >= 0xD800 && prevCu <= 0xDBFF, 'Low surrogate sin high previo');
    }
  }
});

// 10. Texto de 5000 caracteres (pegado masivo)
check('pegado de 5000 caracteres se recorta a 90', () => {
  const text = 'x'.repeat(5000);
  const result = normalizeListTitle(text);
  assert.equal(result.length, 90);
  assert.equal(result, 'x'.repeat(90));
});

// 11. JSON largo sin espacios (simula el bug reportado)
check('JSON largo sin espacios se recorta correctamente', () => {
  const json = '{"a":1,"b":2,"c":3,"d":4,"e":5,"f":6,"g":7,"h":8,"i":9,"j":10}';
  const longJson = json.repeat(20); // ~1000+ caracteres
  const result = normalizeListTitle(longJson);
  assert.equal(result.length, 90);
  // No debe partir en medio de un carácter
  assert.ok(!result.endsWith('\\'));
});

// 12. Caracteres Unicode fuera del BMP (astral planes)
check('caracteres astrales (𝄞, 𝌆) no se parten', () => {
  const musical = '𝄞'; // U+1D11E - 1 code point (astral), 2 UTF-16 code units
  const text = 'a'.repeat(89) + musical; // 89 + 1 = 90 code points
  const result = normalizeListTitle(text);
  assert.equal(Array.from(result).length, 90);
  // Verificar que no hay surrogates sueltos en UTF-16
  for (let i = 0; i < result.length; i++) {
    const cu = result.charCodeAt(i);
    const isHigh = cu >= 0xD800 && cu <= 0xDBFF;
    const isLow = cu >= 0xDC00 && cu <= 0xDFFF;
    if (isHigh) {
      assert.ok(i + 1 < result.length, 'High surrogate al final');
      const nextCu = result.charCodeAt(i + 1);
      assert.ok(nextCu >= 0xDC00 && nextCu <= 0xDFFF, 'High surrogate sin low siguiente');
    }
    if (isLow) {
      assert.ok(i > 0, 'Low surrogate al inicio');
      const prevCu = result.charCodeAt(i - 1);
      assert.ok(prevCu >= 0xD800 && prevCu <= 0xDBFF, 'Low surrogate sin high previo');
    }
  }
});

// 13. Múltiples espacios y tabs se colapsan a uno
check('tabs y múltiples espacios se colapsan', () => {
  const text = 'uno\t\t\tdos\n\n\ntres   cuatro';
  const result = normalizeListTitle(text);
  assert.equal(result, 'uno dos tres cuatro');
});

console.log(`\nlimits: ${cases} cases passed`);