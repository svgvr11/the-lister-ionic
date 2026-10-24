export type BoardViewMode = 'cards' | 'list';

export const BOARD_VIEW_STORAGE_KEY = 'the-lister-board-view-v1';

export interface BoardViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): BoardViewStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function parseBoardView(raw: unknown): BoardViewMode | null {
  if (raw === 'cards' || raw === 'list') return raw;
  return null;
}

export function readStoredBoardView(isNative: boolean, storage?: BoardViewStorage | null): BoardViewMode {
  if (!isNative) return 'list';
  try {
    const raw = (storage ?? browserStorage())?.getItem(BOARD_VIEW_STORAGE_KEY);
    const parsed = parseBoardView(raw);
    return parsed ?? 'cards';
  } catch {
    return 'cards';
  }
}

export function storeBoardView(mode: BoardViewMode, storage?: BoardViewStorage | null): void {
  const valid = parseBoardView(mode);
  if (!valid) return;
  try {
    (storage ?? browserStorage())?.setItem(BOARD_VIEW_STORAGE_KEY, valid);
  } catch {
    // noop
  }
}
