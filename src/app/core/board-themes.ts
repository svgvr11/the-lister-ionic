export interface BoardTheme {
  id: string;
  name: string;
  background: string;
  toolbar: string;
  accent: string;
  fab: string;
  donation: string;
}

export const BOARD_THEMES: readonly BoardTheme[] = [
  { id: 'lavender', name: 'Lavanda', background: '#eee8f8', toolbar: '#ddd2ef', accent: '#8870ad', fab: '#9780bb', donation: '#e8eeff' },
  { id: 'sky', name: 'Celeste', background: '#e6f2fb', toolbar: '#d1e6f5', accent: '#5686ac', fab: '#739fbe', donation: '#dfe9f8' },
  { id: 'mint', name: 'Menta', background: '#e7f4ed', toolbar: '#d2e9dc', accent: '#52836a', fab: '#6a9b7f', donation: '#ddefe6' },
  { id: 'rose', name: 'Rosa', background: '#f8e9ed', toolbar: '#f0d6df', accent: '#ac657e', fab: '#bf7e94', donation: '#fae6ea' },
  { id: 'peach', name: 'Durazno', background: '#fbefe4', toolbar: '#f4dfca', accent: '#a8754e', fab: '#bd8c64', donation: '#fbeada' },
  { id: 'butter', name: 'Vainilla', background: '#f6f2da', toolbar: '#eae3b9', accent: '#928238', fab: '#b1a052', donation: '#f8f1d8' }
];

/**
 * Tema por defecto, fijo y sin azar: Lavanda (`id: 'lavender'`). Se busca por id para que
 * siga siendo Lavanda aunque alguien reordene la lista de temas.
 */
export const DEFAULT_BOARD_THEME: BoardTheme =
  BOARD_THEMES.find((theme) => theme.id === 'lavender') ?? BOARD_THEMES[0];

/**
 * Única clave del tema y es POR DISPOSITIVO: no lleva el usuario dentro, así que varias
 * cuentas en el mismo navegador o APK comparten el color y cerrar sesión no lo borra.
 * Guarda solo el id del tema, no el objeto completo.
 */
export const THEME_STORAGE_KEY = 'the-lister-theme-v1';

/** Prefijo de las claves antiguas, que sí eran por usuario. Solo se leen para migrar. */
const LEGACY_THEME_KEY_PREFIX = 'checklist-trello-theme-v1:';

/** Almacenamiento del tema, inyectable para poder probarlo sin navegador. */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function findTheme(id: unknown): BoardTheme | null {
  if (typeof id !== 'string') return null;
  return BOARD_THEMES.find((theme) => theme.id === id) ?? null;
}

/** Clave antigua del tema, la que se usaba cuando se guardaba por usuario. */
export function legacyThemeKey(userId: string | null): string {
  return `${LEGACY_THEME_KEY_PREFIX}${userId ?? 'local'}`;
}

/**
 * Interpreta un valor guardado y devuelve el id si corresponde a un tema existente.
 * Acepta el id tal cual (`"rose"`) y también el objeto con fecha que escribió una
 * versión intermedia (`{"id":"rose","at":"..."}`); cualquier otra cosa se descarta.
 */
export function parseThemeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value: unknown = raw;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      value = (JSON.parse(trimmed) as { id?: unknown }).id;
    } catch {
      return null;
    }
  }
  return findTheme(value)?.id ?? null;
}
/** localStorage real, o null si el entorno no lo ofrece. Nunca lanza. */
function browserStorage(): ThemeStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Algunos WebView/entornos sin almacenamiento lanzan al tocar el objeto.
    return null;
  }
}

function readItem(key: string, storage?: ThemeStorage | null): string | null {
  try {
    return (storage ?? browserStorage())?.getItem(key) ?? null;
  } catch {
    // Modo privado, almacenamiento lleno o WebView sin DOM storage: no hay tema guardado.
    return null;
  }
}

function writeItem(key: string, value: string, storage?: ThemeStorage | null): void {
  try {
    (storage ?? browserStorage())?.setItem(key, value);
  } catch {
    // Si no se puede guardar, el color elegido se mantiene solo en esta sesión.
  }
}

/** Id del tema guardado en este dispositivo, o null si no hay nada válido. */
export function readStoredThemeId(storage?: ThemeStorage | null): string | null {
  return parseThemeId(readItem(THEME_STORAGE_KEY, storage));
}

/**
 * Tema de este dispositivo. Si no hay nada guardado, o lo que hay no corresponde a un
 * tema existente, devuelve Lavanda: es fijo, así que nunca sale un color al azar.
 */
export function readStoredTheme(storage?: ThemeStorage | null): BoardTheme {
  return findTheme(readStoredThemeId(storage)) ?? DEFAULT_BOARD_THEME;
}

/** Guarda el id del tema elegido en este dispositivo. Solo el id, nunca el objeto. */
export function storeTheme(theme: BoardTheme, storage?: ThemeStorage | null): void {
  const valid = findTheme(theme?.id);
  if (!valid) return;
  writeItem(THEME_STORAGE_KEY, valid.id, storage);
}

/**
 * Migración única y silenciosa de las claves antiguas, que eran por usuario: si la clave
 * nueva está vacía, adopta el color que ya tenía el dispositivo (primero el de la sesión
 * actual, luego el guardado sin usuario) y lo copia a la clave nueva. No borra nada: las
 * claves viejas se dejan como estaban. Si no hay nada que adoptar, se queda Lavanda sin
 * escribir, para no estropear una migración futura. Es idempotente.
 */
export function migrateLegacyTheme(currentUserId: string | null, storage?: ThemeStorage | null): BoardTheme {
  const guardada = readStoredThemeId(storage);
  if (guardada) return findTheme(guardada)!;

  const candidatos = currentUserId ? [currentUserId, null] : [null];
  for (const userId of candidatos) {
    const heredado = parseThemeId(readItem(legacyThemeKey(userId), storage));
    if (!heredado) continue;
    writeItem(THEME_STORAGE_KEY, heredado, storage);
    return findTheme(heredado)!;
  }
  return DEFAULT_BOARD_THEME;
}

