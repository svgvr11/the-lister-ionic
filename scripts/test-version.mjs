import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FORMATO, aplicarVersion, motivo, nextVersion } from './bump-version.mjs';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. Árbol limpio: sube FEATURE y pone BUILD en 0.
check('árbol limpio sube FEATURE y pone BUILD en 0', () => {
  assert.equal(nextVersion('1.9.3-a', true, false), '1.10.0-a');
  assert.deepEqual(nextVersion('1.9.3-a', true, false).split('-')[0].split('.'), ['1', '10', '0']);
  // FEATURE normalito y BUILD que se reinicia aunque tuviera valor.
  assert.equal(nextVersion('1.8.7-a', true, false), '1.9.0-a');
  assert.equal(nextVersion('1.8.0-a', true, false), '1.9.0-a');
  assert.equal(nextVersion('1.12.9-a', true, false), '1.13.0-a');
  assert.equal(nextVersion('1.12.9-a', true, false).split('-')[0].split('.')[2], '0');
});

// 2. Árbol con cambios: sube solo BUILD; MAYOR y FEATURE se quedan igual.
check('con cambios sube BUILD y no toca MAYOR ni FEATURE', () => {
  // El ejemplo del enunciado: 1.9.3-a (con cambios) → 1.9.4-a.
  assert.equal(nextVersion('1.9.3-a', false, false), '1.9.4-a');
  assert.equal(nextVersion('1.12.0-a', false, false), '1.12.1-a');
  // MAYOR y FEATURE se conservan: en 1.9.3-a el 9 es FEATURE y el 3 es BUILD.
  const [mayor, feature] = nextVersion('1.9.3-a', false, false).split('-')[0].split('.');
  assert.deepEqual([mayor, feature], ['1', '9']);
  // Con cambios y limpio dan resultados distintos: la regla depende del árbol.
  assert.notEqual(nextVersion('1.9.3-a', false, false), nextVersion('1.9.3-a', true, false));
});

// 3. --major manda sobre el estado del árbol: MAYOR +1, FEATURE = 0, BUILD = 0.
check('major sube MAYOR y pone FEATURE y BUILD en 0, esté el árbol como esté', () => {
  for (const treeIsClean of [true, false]) {
    assert.equal(nextVersion('1.10.2-a', treeIsClean, true), '2.0.0-a');
    assert.equal(nextVersion('1.9.4-a', treeIsClean, true), '2.0.0-a');
    assert.deepEqual(nextVersion('1.10.2-a', treeIsClean, true).split('-')[0].split('.'), ['2', '0', '0']);
  }
});

// 4. El ejemplo del enunciado: 1.9.4-a con árbol limpio → 1.10.0-a.
check('1.9.4-a con árbol limpio da 1.10.0-a', () => {
  assert.equal(nextVersion('1.9.4-a', true, false), '1.10.0-a');
  assert.deepEqual(nextVersion('1.9.4-a', true, false).split('-')[0].split('.'), ['1', '10', '0']);
});

// 5. Los números suben como enteros, no como texto: 1.9.9-a → 1.9.10-a.
check('los tres números suben como enteros, no como texto', () => {
  // BUILD 9 + 1 = 10 (con texto, "9" + 1 daría "91").
  assert.equal(nextVersion('1.9.9-a', false, false), '1.9.10-a');
  // FEATURE 9 + 1 = 10.
  assert.equal(nextVersion('1.9.9-a', true, false), '1.10.0-a');
  // Dos subidas encadenadas no se rompen.
  assert.equal(nextVersion(nextVersion('1.9.9-a', false, false), false, false), '1.9.11-a');
  assert.equal(nextVersion('1.99.99-a', true, false), '1.100.0-a');
});
// 6. El sufijo se conserva siempre al subir.
check('el sufijo existente se conserva al subir', () => {
  for (const treeIsClean of [true, false]) {
    const siguiente = nextVersion('2.3.4-beta', treeIsClean, false);
    assert.equal(siguiente, treeIsClean ? '2.4.0-beta' : '2.3.5-beta');
    assert.equal(nextVersion('2.3.4-beta', treeIsClean, true), '3.0.0-beta');
  }
  // Ni se cambia el sufijo ni se inventa uno cuando la versión no lo trae
  // (el formato exige sufijo: -a, -beta, -rc...).
  assert.ok(nextVersion('2.3.4-a', true, false).endsWith('-a'));
  assert.ok(nextVersion('2.3.4-a', false, false).endsWith('-a'));
});

// 7. Formatos inválidos fallan con mensaje claro, sin escribir nada.
check('un formato inválido falla en vez de adivinar', () => {
  const invalidos = [
    '1.12-alpha',     // formato anterior: sin BUILD
    '1.12',           // ni BUILD ni sufijo
    '1.12.0',         // sin sufijo
    '1.12.0-',        // sufijo vacío
    '1.12.0-A',       // sufijo con mayúscula
    'v1.12.0-a',      // con la "v" delante
    '1.12.0.4-a',     // cuatro números
    '1.12.0-alpha ',  // espacio al final
    '1.0.0-rc1',      // el sufijo son solo letras minúsculas
    ''
  ];
  for (const version of invalidos) {
    for (const [treeIsClean, major] of [[true, false], [false, false], [false, true]]) {
      assert.throws(() => nextVersion(version, treeIsClean, major), /No se ha escrito nada/,
        `debería rechazar "${version}"`);
    }
  }
  // El formato antiguo se dice explícitamente en el mensaje, para no perder tiempo.
  assert.throws(() => nextVersion('1.12-alpha', true, false), /MAYOR\.FEATURE\.BUILD/);
  // Los formatos válidos sí pasan el filtro.
  for (const version of ['0.0.0-a', '1.9.5-a', '12.34.56-beta', '2.0.0-rc']) {
    assert.ok(FORMATO.test(version), `"${version}" debería ser válido`);
  }
});

// 8. El motivo acompaña a cada regla.
check('el motivo dice qué regla se aplicó', () => {
  assert.match(motivo(true, false), /árbol limpio/);
  assert.match(motivo(false, false), /con cambios/);
  assert.match(motivo(true, true), /major/);
  assert.match(motivo(false, true), /major/);
  // El motivo de --major no depende del árbol: manda sobre él.
  assert.doesNotMatch(motivo(true, true), /árbol limpio/);
});

// 9. Solo se reescribe la línea de APP_VERSION; el resto del archivo no se toca.
check('se reescribe solo la línea de APP_VERSION', () => {
  const original = [
    '/**',
    ' * Comentario que menciona APP_VERSION dentro.',
    ' */',
    "export const APP_VERSION = '1.9.4-a';",
    '',
    '/** Lo que se muestra en la interfaz. */',
    'export const APP_VERSION_LABEL = `v${APP_VERSION}`;',
    ''
  ].join('\n');
  const actualizado = aplicarVersion(original, '1.10.0-a');
  assert.match(actualizado, /^export const APP_VERSION = '1\.10\.0-a';$/m);
  // Ni el comentario de arriba ni el label de abajo cambian.
  assert.match(actualizado, / \* Comentario que menciona APP_VERSION dentro\./);
  assert.match(actualizado, /export const APP_VERSION_LABEL = `v\$\{APP_VERSION\}`;/);
  // Volviendo a poner el valor viejo se recupera el archivo exacto.
  assert.equal(actualizado.replace('1.10.0-a', '1.9.4-a'), original);
  // Sin la línea que reescribir, falla en vez de escribir un archivo idéntico.
  assert.throws(() => aplicarVersion('export const OTRA = 1;\n', '1.10.0-a'), /No se ha escrito nada/);
});

// 10. El archivo real de la app está en el formato nuevo y es la única fuente.
check('src/app/core/app-version.ts está en el formato nuevo', () => {
  const contenido = readFileSync(join(raiz, 'src', 'app', 'core', 'app-version.ts'), 'utf8');
  const coincidencia = /^export const APP_VERSION = '([^']*)';$/m.exec(contenido);
  assert.ok(coincidencia, 'no se encontró la línea export const APP_VERSION = ...');
  assert.match(coincidencia[1], FORMATO, `"${coincidencia[1]}" no cumple MAYOR.FEATURE.BUILD-sufijo`);
  // El label se deriva de APP_VERSION: nada escrito a mano en la interfaz.
  assert.match(contenido, /export const APP_VERSION_LABEL = `v\$\{APP_VERSION\}`;/);
});

console.log(`version: ${cases} cases passed`);