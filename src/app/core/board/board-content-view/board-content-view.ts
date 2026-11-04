export type BoardContentView = 'checklists' | 'notes';

export const BOARD_CONTENT_VIEW_STORAGE_KEY = 'the-lister-board-content-v1';

export interface BoardContentViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): BoardContentViewStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function parseBoardContentView(value: unknown): BoardContentView | null {
  return value === 'checklists' || value === 'notes' ? value : null;
}

export function readBoardContentView(storage?: BoardContentViewStorage | null): BoardContentView {
  try {
    const raw = (storage ?? browserStorage())?.getItem(BOARD_CONTENT_VIEW_STORAGE_KEY);
    return parseBoardContentView(raw) ?? 'checklists';
  } catch {
    return 'checklists';
  }
}

export function storeBoardContentView(
  view: BoardContentView,
  storage?: BoardContentViewStorage | null
): void {
  try {
    (storage ?? browserStorage())?.setItem(BOARD_CONTENT_VIEW_STORAGE_KEY, view);
  } catch {
    // La preferencia local no debe impedir el cambio de vista.
  }
}
