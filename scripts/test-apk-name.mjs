import assert from 'node:assert/strict';
import { apkFileName } from './name-apk.mjs';

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. El caso del enunciado: la versión sin "v" da el nombre con una sola "v".
check("apkFileName('1.16.2-a') → 'thelister-v1.16.2-a.apk'", () => {
  assert.equal(apkFileName('1.16.2-a'), 'thelister-v1.16.2-a.apk');
});

// 2. Versiones inválidas lanzan en vez de inventar un nombre.
check('una versión inválida lanza error', () => {
  const invalidas = [
    '1.16',          // sin BUILD ni sufijo
    '1.16.2',        // sin sufijo
    '1.16-alpha',    // formato anterior: sin BUILD
    '1.16.2-',       // sufijo vacío
    '1.16.2-A',      // sufijo con mayúscula
    'v1.16.2-a',     // con la "v" delante (el script la pone)
    '1.16.2.0-a',    // cuatro números
    '1.16.2-a ',     // espacio al final
    '1.0.0-rc1',     // el sufijo son solo letras minúsculas
    ''
  ];
  for (const version of invalidas) {
    assert.throws(() => apkFileName(version), /No se ha copiado nada/, `debería rechazar "${version}"`);
  }
});

// 3. La "v" aparece una sola vez: prefijo thelister-v + versión sin "v".
check('la "v" aparece una sola vez', () => {
  for (const version of ['1.16.2-a', '1.17.0-a', '2.0.0-beta']) {
    const nombre = apkFileName(version);
    assert.match(nombre, /^thelister-v\d+\.\d+\.\d+-[a-z]+\.apk$/);
    assert.equal(nombre.match(/v/g).length, 1, `"${nombre}" debería tener una sola "v"`);
    assert.ok(!nombre.includes('vv'), `"${nombre}" no debería tener "vv"`);
  }
});

console.log(`apk-name: ${cases} cases passed`);
