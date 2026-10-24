import { describe, expect, it } from 'vitest';
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  THEME_STORAGE_KEY,
  findTheme,
  legacyThemeKey,
  migrateLegacyTheme,
  parseThemeId,
  readStoredTheme,
  readStoredThemeId,
  storeTheme
} from './board-themes';
import type { BoardTheme, ThemeStorage } from './board-themes';

/**
 * Pruebas del tema del tablero. Migrado desde scripts/test-board-theme.mjs.
 * El almacenamiento se inyecta, así que no hace falta navegador.
 */

/** localStorage simulado, con la misma interfaz que usa board-themes.ts. */
const fakeStorage = (): ThemeStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => data.set(key, String(value))
  };
};

/** Almacenamiento roto: modo privado, cuota llena o WebView sin DOM storage. */
const brokenStorage = (): ThemeStorage => ({
  getItem() {
    throw new Error('SecurityError: storage is not available');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  }
});

const theme = (id: string): BoardTheme | null => findTheme(id);
const LAVANDA = DEFAULT_BOARD_THEME;

describe('board-themes: tema por defecto', () => {
  it('el tema por defecto es Lavanda (id lavender)', () => {
    expect(LAVANDA.id).toBe('lavender');
    expect(LAVANDA.name).toBe('Lavanda');
    expect(BOARD_THEMES.find((t) => t.id === 'lavender')).toBe(LAVANDA);
    // No es el color "Lavanda" de las listas (#cfd8ff), que vive en otro sitio.
    expect(LAVANDA.background).not.toBe('#cfd8ff');
  });
});

describe('board-themes: guardar y leer', () => {
  it('guardar y leer devuelve el mismo tema', () => {
    const storage = fakeStorage();
    for (const elegido of BOARD_THEMES) {
      storeTheme(elegido, storage);
      expect(readStoredTheme(storage).id).toBe(elegido.id);
    }
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('butter');
    expect(readStoredThemeId(storage)).toBe('butter');
  });

  it('la clave es la misma para cualquier cuenta', () => {
    const storage = fakeStorage();
    storeTheme(theme('rose')!, storage);
    // Ni leer ni escribir reciben ya el usuario: no hay nada por usuario que se mezcle.
    expect(storage.data.size).toBe(1);
    expect([...storage.data.keys()][0]).toBe('the-lister-theme-v1');
    expect(readStoredTheme(storage).id).toBe('rose');
    // "Salir y entrar con otra cuenta" no borra nada: solo se llama a storeTheme/readStoredTheme.
    expect(readStoredTheme(storage).id).toBe('rose');
    expect(readStoredTheme(storage).id).toBe('rose');
  });
});

describe('board-themes: valores ausentes o inválidos', () => {
  it('ausente o inválido devuelve Lavanda, y no cambia entre llamadas', () => {
    const storage = fakeStorage();
    expect(readStoredTheme(storage).id).toBe(LAVANDA.id);
    expect(readStoredThemeId(storage)).toBeNull();
    for (const basura of [
      'no-existe',
      'LAVENDER',
      '42',
      'null',
      '',
      '   ',
      '{"id":"inventado"}',
      '{roto'
    ]) {
      storage.setItem(THEME_STORAGE_KEY, basura);
      expect(readStoredTheme(storage).id, `basura: ${basura}`).toBe(LAVANDA.id);
      expect(readStoredTheme(storage).id, `basura (2ª vez): ${basura}`).toBe(LAVANDA.id);
    }
    // Instalación nueva: nada guardado -> Lavanda, y el default es siempre el mismo.
    const nuevo = fakeStorage();
    expect(readStoredTheme(nuevo)).toBe(LAVANDA);
    expect(readStoredTheme(nuevo)).toBe(readStoredTheme(fakeStorage()));
    expect(readStoredTheme(nuevo)).toBe(DEFAULT_BOARD_THEME);
  });
});

describe('board-themes: almacenamiento que lanza', () => {
  it('si localStorage lanza, la app sigue con Lavanda', () => {
    const roto = brokenStorage();
    expect(readStoredTheme(roto).id).toBe(LAVANDA.id);
    expect(readStoredThemeId(roto)).toBeNull();
    storeTheme(theme('mint')!, roto); // no debe lanzar
    storeTheme(theme('no-existe')!, roto); // tampoco con un tema inválido
    expect(migrateLegacyTheme('user-1', roto).id).toBe(LAVANDA.id);
    expect(parseThemeId(null)).toBeNull();
    // Y sin localStorage en el entorno tampoco falla.
    expect(readStoredTheme().id).toBe(LAVANDA.id);
  });
});

describe('board-themes: migración de las claves antiguas', () => {
  it('migración desde la clave antigua de la sesión actual', () => {
    const storage = fakeStorage();
    storage.setItem(legacyThemeKey('user-1'), 'mint');
    storage.setItem(legacyThemeKey('user-2'), 'rose');
    expect(migrateLegacyTheme('user-1', storage).id).toBe('mint'); // gana la de la sesión
    expect(readStoredTheme(storage).id).toBe('mint');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('mint');
    // No borra nada: las claves viejas siguen intactas.
    expect(storage.getItem(legacyThemeKey('user-1'))).toBe('mint');
    expect(storage.getItem(legacyThemeKey('user-2'))).toBe('rose');
  });

  it('migración sin clave de sesión usa la antigua sin usuario', () => {
    const storage = fakeStorage();
    storage.setItem(legacyThemeKey(null), 'butter');
    expect(migrateLegacyTheme(null, storage).id).toBe('butter');
    expect(migrateLegacyTheme('user-9', storage).id).toBe('butter'); // ya migrado: estable
  });

  it('migración sin clave antigua deja Lavanda sin escribir', () => {
    const storage = fakeStorage();
    expect(migrateLegacyTheme('user-1', storage).id).toBe(LAVANDA.id);
    expect(storage.data.size).toBe(0); // no debe escribir nada si no hay nada que migrar
    // Una clave antigua inválida tampoco se adopta.
    storage.setItem(legacyThemeKey('user-1'), 'color-que-no-existe');
    expect(migrateLegacyTheme('user-1', storage).id).toBe(LAVANDA.id);
    expect(storage.data.size).toBe(1);
  });

  it('la migración respeta el color ya guardado y solo corre una vez', () => {
    const storage = fakeStorage();
    storeTheme(theme('peach')!, storage); // el usuario ya eligió aquí
    storage.setItem(legacyThemeKey('user-1'), 'mint'); // queda una clave vieja
    expect(migrateLegacyTheme('user-1', storage).id).toBe('peach');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('peach');
    const antes = [...storage.data.entries()];
    for (let i = 0; i < 5; i++) expect(migrateLegacyTheme('user-1', storage).id).toBe('peach');
    expect([...storage.data.entries()]).toEqual(antes); // no debe reescribir nada
  });

  it('nada borra la clave del tema', () => {
    const storage = fakeStorage();
    storeTheme(theme('sky')!, storage);
    const usadas = new Set<string>();
    const vigilante: ThemeStorage = {
      getItem: (key) => {
        usadas.add('getItem');
        return storage.getItem(key);
      },
      setItem: (key, value) => {
        usadas.add('setItem');
        storage.setItem(key, value);
      }
    };
    readStoredTheme(vigilante);
    migrateLegacyTheme('user-1', vigilante);
    storeTheme(theme('rose')!, vigilante);
    expect([...usadas].sort()).toEqual(['getItem', 'setItem']);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('rose');
  });
});
