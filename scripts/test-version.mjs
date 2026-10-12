import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FORMATO, aplicarVersion, leerArgumentos, motivo, nextVersion } from './bump-version.mjs';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. --feature: sube FEATURE y pone BUILD en 0.
check('feature sube FEATURE y pone BUILD en 0', () => {
  assert.equal(nextVersion('1.9.3-a', 'feature'), '1.10.0-a');
  assert.deepEqual(nextVersion('1.9.3-a', 'feature').split('-')[0].split('.'), ['1', '10', '0']);
  // BUILD se reinicia aunque tuviera valor.
  assert.equal(nextVersion('1.8.7-a', 'feature'), '1.9.0-a');
  assert.equal(nextVersion('1.8.0-a', 'feature'), '1.9.0-a');
  assert.equal(nextVersion('1.12.9-a', 'feature'), '1.13.0-a');
  assert.equal(nextVersion('1.12.9-a', 'feature').split('-')[0].split('.')[2], '0');
});

// 2. --build: sube solo BUILD; MAYOR y FEATURE se quedan igual.
check('build sube BUILD y no toca MAYOR ni FEATURE', () => {
  assert.equal(nextVersion('1.9.3-a', 'build'), '1.9.4-a');
  assert.equal(nextVersion('1.12.0-a', 'build'), '1.12.1-a');
  // En 1.9.3-a el 9 es FEATURE y el 3 es BUILD.
  const [mayor, feature] = nextVersion('1.9.3-a', 'build').split('-')[0].split('.');
  assert.deepEqual([mayor, feature], ['1', '9']);
  // Cada tipo da un resultado distinto: la regla depende solo del tipo elegido.
  assert.notEqual(nextVersion('1.9.3-a', 'build'), nextVersion('1.9.3-a', 'feature'));
});

// 3. --major: MAYOR +1, FEATURE = 0, BUILD = 0.
check('major sube MAYOR y pone FEATURE y BUILD en 0', () => {
  assert.equal(nextVersion('1.10.2-a', 'major'), '2.0.0-a');
  assert.equal(nextVersion('1.9.4-a', 'major'), '2.0.0-a');
  assert.deepEqual(nextVersion('1.10.2-a', 'major').split('-')[0].split('.'), ['2', '0', '0']);
});

// 4. El resultado depende solo de la versión y del tipo (no del estado del árbol).
check('el resultado es determinista: mismo tipo, misma versión', () => {
  assert.equal(nextVersion('1.9.4-a', 'feature'), nextVersion('1.9.4-a', 'feature'));
  assert.equal(nextVersion('1.9.4-a', 'build'), '1.9.5-a');
  assert.equal(nextVersion('1.9.4-a', 'feature'), '1.10.0-a');
  assert.equal(nextVersion('1.9.4-a', 'major'), '2.0.0-a');
});

// 5. Los números suben como enteros, no como texto: 1.9.9-a → 1.9.10-a.
check('los tres números suben como enteros, no como texto', () => {
  // BUILD 9 + 1 = 10 (con texto, "9" + 1 daría "91").
  assert.equal(nextVersion('1.9.9-a', 'build'), '1.9.10-a');
  // FEATURE 9 + 1 = 10.
  assert.equal(nextVersion('1.9.9-a', 'feature'), '1.10.0-a');
  // Dos subidas encadenadas no se rompen.
  assert.equal(nextVersion(nextVersion('1.9.9-a', 'build'), 'build'), '1.9.11-a');
  assert.equal(nextVersion('1.99.99-a', 'feature'), '1.100.0-a');
  assert.equal(nextVersion('9.9.9-a', 'major'), '10.0.0-a');
});

// 6. El sufijo se conserva siempre al subir.
check('el sufijo existente se conserva al subir', () => {
  assert.equal(nextVersion('2.3.4-beta', 'feature'), '2.4.0-beta');
  assert.equal(nextVersion('2.3.4-beta', 'build'), '2.3.5-beta');
  assert.equal(nextVersion('2.3.4-beta', 'major'), '3.0.0-beta');
  for (const tipo of ['major', 'feature', 'build']) {
    assert.ok(nextVersion('2.3.4-a', tipo).endsWith('-a'));
  }
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
    for (const tipo of ['major', 'feature', 'build']) {
      assert.throws(() => nextVersion(version, tipo), /No se ha escrito nada/,
        `debería rechazar "${version}"`);
    }
  }
  // El mensaje dice el formato esperado, para no perder tiempo.
  assert.throws(() => nextVersion('1.12-alpha', 'feature'), /MAYOR\.FEATURE\.BUILD/);
  // Los formatos válidos sí pasan el filtro.
  for (const version of ['0.0.0-a', '1.9.5-a', '12.34.56-beta', '2.0.0-rc']) {
    assert.ok(FORMATO.test(version), `"${version}" debería ser válido`);
  }
});

// 8. Un tipo de subida desconocido falla.
check('un tipo de subida desconocido falla', () => {
  for (const tipo of [undefined, null, '', 'minor', 'patch', 'MAJOR', true, false]) {
    assert.throws(() => nextVersion('1.9.4-a', tipo), /No se ha escrito nada/,
      `debería rechazar el tipo ${String(tipo)}`);
  }
});

// 9. El motivo acompaña a cada tipo.
check('el motivo dice qué tipo se aplicó', () => {
  assert.match(motivo('major'), /major/);
  assert.match(motivo('feature'), /feature/);
  assert.match(motivo('build'), /build/);
  assert.notEqual(motivo('feature'), motivo('build'));
  assert.throws(() => motivo('minor'), /No se ha escrito nada/);
});

// 10. Argumentos: exactamente un tipo; --dry-run es opcional.
check('leerArgumentos exige exactamente un tipo de subida', () => {
  assert.deepEqual(leerArgumentos(['--major']), { dryRun: false, tipo: 'major' });
  assert.deepEqual(leerArgumentos(['--feature']), { dryRun: false, tipo: 'feature' });
  assert.deepEqual(leerArgumentos(['--build']), { dryRun: false, tipo: 'build' });
  // --dry-run en cualquier posición.
  assert.deepEqual(leerArgumentos(['--build', '--dry-run']), { dryRun: true, tipo: 'build' });
  assert.deepEqual(leerArgumentos(['--dry-run', '--feature']), { dryRun: true, tipo: 'feature' });
  // Sin tipo: el script no decide solo.
  assert.throws(() => leerArgumentos([]), /Falta el tipo de subida/);
  assert.throws(() => leerArgumentos(['--dry-run']), /Falta el tipo de subida/);
  // Más de un tipo: incompatibles.
  assert.throws(() => leerArgumentos(['--major', '--build']), /incompatibles/);
  assert.throws(() => leerArgumentos(['--feature', '--build']), /incompatibles/);
  assert.throws(() => leerArgumentos(['--major', '--feature', '--build']), /incompatibles/);
  // Opciones desconocidas.
  assert.throws(() => leerArgumentos(['--minor']), /Opción desconocida/);
  assert.throws(() => leerArgumentos(['--build', '--force']), /Opción desconocida/);
});

// 11. Solo se reescribe la línea de APP_VERSION; el resto del archivo no se toca.
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

// 12. El archivo real de la app está en el formato nuevo y es la única fuente.
check('src/app/core/app-version.ts está en el formato nuevo', () => {
  const contenido = readFileSync(join(raiz, 'src', 'app', 'core', 'app-version.ts'), 'utf8');
  const coincidencia = /^export const APP_VERSION = '([^']*)';$/m.exec(contenido);
  assert.ok(coincidencia, 'no se encontró la línea export const APP_VERSION = ...');
  assert.match(coincidencia[1], FORMATO, `"${coincidencia[1]}" no cumple MAYOR.FEATURE.BUILD-sufijo`);
  // El label se deriva de APP_VERSION: nada escrito a mano en la interfaz.
  assert.match(contenido, /export const APP_VERSION_LABEL = `v\$\{APP_VERSION\}`;/);
});

console.log(`version: ${cases} cases passed`);