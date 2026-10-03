import assert from 'node:assert/strict';
import {
  BOARD_THEMES, DEFAULT_BOARD_THEME, THEME_STORAGE_KEY, findTheme, legacyThemeKey,
  migrateLegacyTheme, parseThemeId, readStoredTheme, readStoredThemeId, storeTheme
} from '../src/app/core/board-themes.ts';

/** localStorage simulado, con la misma interfaz que usa board-themes.ts. */
const fakeStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value))
  };
};

/** Almacenamiento roto: modo privado, cuota llena o WebView sin DOM storage. */
const brokenStorage = () => ({
  getItem() { throw new Error('SecurityError: storage is not available'); },
  setItem() { throw new Error('QuotaExceededError'); }
});

const theme = (id) => findTheme(id);
const LAVANDA = DEFAULT_BOARD_THEME;

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// El tema por defecto es Lavanda, fijo, y el "Lavanda" de las listas es otra cosa.
check('el tema por defecto es Lavanda (id lavender)', () => {
  assert.equal(LAVANDA.id, 'lavender');
  assert.equal(LAVANDA.name, 'Lavanda');
  assert.equal(BOARD_THEMES.find((t) => t.id === 'lavender'), LAVANDA);
  // No es el color "Lavanda" de las listas (#cfd8ff), que vive en otro sitio.
  assert.notEqual(LAVANDA.background, '#cfd8ff');
});

// 1. Guardar y leer devuelve el mismo tema, y se guarda solo el id.
check('guardar y leer devuelve el mismo tema', () => {
  const storage = fakeStorage();
  for (const elegido of BOARD_THEMES) {
    storeTheme(elegido, storage);
    assert.equal(readStoredTheme(storage).id, elegido.id);
  }
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'butter');
  assert.equal(readStoredThemeId(storage), 'butter');
});

// 2. La clave no depende del usuario: todas las cuentas del dispositivo comparten el color.
check('la clave es la misma para cualquier cuenta', () => {
  const storage = fakeStorage();
  storeTheme(theme('rose'), storage);
  // Ni leer ni escribir reciben ya el usuario: no hay nada por usuario que se mezcle.
  assert.equal(storage.data.size, 1);
  assert.equal([...storage.data.keys()][0], 'the-lister-theme-v1');
  assert.equal(readStoredTheme(storage).id, 'rose');
  // "Salir y entrar con otra cuenta" no borra nada: solo se llama a storeTheme/readStoredTheme.
  assert.equal(readStoredTheme(storage).id, 'rose');
  assert.equal(readStoredTheme(storage).id, 'rose');
});

// 3. Ausente o inválido: Lavanda, siempre el mismo y sin azar.
check('ausente o invalido devuelve Lavanda, y no cambia entre llamadas', () => {
  const storage = fakeStorage();
  assert.equal(readStoredTheme(storage).id, LAVANDA.id);
  assert.equal(readStoredThemeId(storage), null);
  for (const basura of ['no-existe', 'LAVENDER', '42', 'null', '', '   ', '{"id":"inventado"}', '{roto']) {
    storage.setItem(THEME_STORAGE_KEY, basura);
    assert.equal(readStoredTheme(storage).id, LAVANDA.id, `basura: ${basura}`);
    assert.equal(readStoredTheme(storage).id, LAVANDA.id, `basura (2ª vez): ${basura}`);
  }
  // Instalación nueva: nada guardado -> Lavanda, y el default es siempre el mismo.
  const nuevo = fakeStorage();
  assert.equal(readStoredTheme(nuevo), LAVANDA);
  assert.equal(readStoredTheme(nuevo), readStoredTheme(fakeStorage()));
  assert.equal(readStoredTheme(nuevo), DEFAULT_BOARD_THEME);
});

// 4. Storage que lanza excepción: Lavanda y ningún error.
check('si localStorage lanza, la app sigue con Lavanda', () => {
  const roto = brokenStorage();
  assert.equal(readStoredTheme(roto).id, LAVANDA.id);
// 5. Migración de las claves antiguas (por usuario) a la clave única del dispositivo.
check('migracion desde la clave antigua de la sesion actual', () => {
  const storage = fakeStorage();
  storage.setItem(legacyThemeKey('user-1'), 'mint');
  storage.setItem(legacyThemeKey('user-2'), 'rose');
  assert.equal(migrateLegacyTheme('user-1', storage).id, 'mint');   // gana la de la sesión
  assert.equal(readStoredTheme(storage).id, 'mint');
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'mint');
  // No borra nada: las claves viejas siguen intactas.
  assert.equal(storage.getItem(legacyThemeKey('user-1')), 'mint');
  assert.equal(storage.getItem(legacyThemeKey('user-2')), 'rose');
});

check('migracion sin clave de sesion usa la antigua sin usuario', () => {
  const storage = fakeStorage();
  storage.setItem(legacyThemeKey(null), 'butter');
  assert.equal(migrateLegacyTheme(null, storage).id, 'butter');
  assert.equal(migrateLegacyTheme('user-9', storage).id, 'butter');  // ya migrado: estable
});

check('migracion sin clave antigua deja Lavanda sin escribir', () => {
  const storage = fakeStorage();
  assert.equal(migrateLegacyTheme('user-1', storage).id, LAVANDA.id);
  assert.equal(storage.data.size, 0, 'no debe escribir nada si no hay nada que migrar');
  // Una clave antigua inválida tampoco se adopta.
  storage.setItem(legacyThemeKey('user-1'), 'color-que-no-existe');
  assert.equal(migrateLegacyTheme('user-1', storage).id, LAVANDA.id);
  assert.equal(storage.data.size, 1);
});

// 6. La migración no pisa un color ya elegido en este dispositivo y es idempotente.
check('la migracion respeta el color ya guardado y solo corre una vez', () => {
  const storage = fakeStorage();
  storeTheme(theme('peach'), storage);                 // el usuario ya eligió aquí
  storage.setItem(legacyThemeKey('user-1'), 'mint');    // queda una clave vieja
  assert.equal(migrateLegacyTheme('user-1', storage).id, 'peach');
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'peach');
  const antes = [...storage.data.entries()];
  for (let i = 0; i < 5; i++) assert.equal(migrateLegacyTheme('user-1', storage).id, 'peach');
  assert.deepEqual([...storage.data.entries()], antes, 'no debe reescribir nada');
});

// 7. Nada borra la clave: las únicas operaciones son getItem/setItem.
check('nada borra la clave del tema', () => {
  const storage = fakeStorage();
  storeTheme(theme('sky'), storage);
  const usadas = new Set();
  const vigilante = {
    getItem: (key) => { usadas.add('getItem'); return storage.getItem(key); },
    setItem: (key, value) => { usadas.add('setItem'); storage.setItem(key, value); }
  };
  readStoredTheme(vigilante);
  migrateLegacyTheme('user-1', vigilante);
  storeTheme(theme('rose'), vigilante);
  assert.deepEqual([...usadas].sort(), ['getItem', 'setItem']);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'rose');
});

console.log(`board-theme: ${cases} cases passed`);

  assert.equal(readStoredThemeId(roto), null);
  storeTheme(theme('mint'), roto);                 // no debe lanzar
  storeTheme(theme('no-existe'), roto);            // tampoco con un tema inválido
  assert.equal(migrateLegacyTheme('user-1', roto).id, LAVANDA.id);
  assert.equal(parseThemeId(null), null);
  // Y sin localStorage en el entorno (Node) tampoco falla.
  assert.equal(readStoredTheme().id, LAVANDA.id);
});
