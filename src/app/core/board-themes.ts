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

export const DEFAULT_BOARD_THEME = BOARD_THEMES[0];

export function themeStorageKey(userId: string | null): string {
  return `checklist-trello-theme-v1:${userId ?? 'local'}`;
}

/** Tema guardado en el dispositivo; si no existe o no es válido, devuelve el tema por defecto. */
export function readStoredTheme(userId: string | null): BoardTheme {
  const savedThemeId = localStorage.getItem(themeStorageKey(userId));
  return BOARD_THEMES.find((theme) => theme.id === savedThemeId) ?? DEFAULT_BOARD_THEME;
}

export function storeTheme(userId: string | null, theme: BoardTheme): void {
  localStorage.setItem(themeStorageKey(userId), theme.id);
}