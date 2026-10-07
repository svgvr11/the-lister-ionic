import assert from 'node:assert/strict';
import { parseAndroidVersion, leerAppVersion, FORMATO } from './android-version.mjs';

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. Formato válido básico
check('parsea correctamente una versión válida', () => {
  const res = parseAndroidVersion('1.31.1-a');
  assert.equal(res.versionName, '1.31.1-a');
  assert.equal(res.versionCode, 1031001);
});

// 2. Límites exactos: 999 pasa, 1000 falla (para feature y build), y mayor > 2099 falla
check('límites de feature y build (999 pasa, 1000 falla)', () => {
  // feature 999, build 999 pasa
  const r1 = parseAndroidVersion('1.999.999-a');
  assert.equal(r1.versionCode, 1999999);

  // feature 1000 falla
  assert.throws(() => parseAndroidVersion('1.1000.0-a'), /FEATURE.*999/);
  // build 1000 falla
  assert.throws(() => parseAndroidVersion('1.0.1000-a'), /BUILD.*999/);
});

check('límite de mayor (> 2099 falla)', () => {
  const rValid = parseAndroidVersion('2099.999.999-a');
  assert.equal(rValid.mayor, 2099);

  assert.throws(() => parseAndroidVersion('2100.0.0-a'), /MAYOR.*2099/);
});

// 3. Formatos inválidos
check('rechaza formatos inválidos', () => {
  const invalidos = [
    '1.31.1',         // sin sufijo
    'v1.31.1-a',      // con v
    '1.31-a',         // sin build
    '1.31.1.0-a',     // cuatro números
    '1.31.1-A',       // sufijo con mayúscula
    '1.31.1-alpha1',  // sufijo con número
    '',
    'abc'
  ];
  for (const v of invalidos) {
    assert.throws(() => parseAndroidVersion(v), /inválida/);
  }
});

// 4. Monotonía estricta en subidas de BUILD, FEATURE y MAYOR
check('versionCode es estrictamente creciente (monótono) en subidas', () => {
  const v1 = parseAndroidVersion('1.31.1-a');
  const v2 = parseAndroidVersion('1.31.2-a');
  const v3 = parseAndroidVersion('1.32.0-a');
  const v4 = parseAndroidVersion('2.0.0-a');

  assert.ok(v1.versionCode < v2.versionCode, 'build sube');
  assert.ok(v2.versionCode < v3.versionCode, 'feature sube');
  assert.ok(v3.versionCode < v4.versionCode, 'mayor sube');
});

// 5. Test de humo que parsee el app-version.ts real
check('test de humo: parsea correctamente el app-version.ts real', () => {
  const realVersion = leerAppVersion();
  const res = parseAndroidVersion(realVersion);
  assert.equal(res.versionName, realVersion);
  assert.ok(res.versionCode > 0);
  assert.ok(typeof res.versionCode === 'number');
});

console.log(`android-version: ${cases} cases passed`);
