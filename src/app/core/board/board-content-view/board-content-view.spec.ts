import { describe, expect, it } from 'vitest';
import {
  BOARD_CONTENT_VIEW_STORAGE_KEY,
  parseBoardContentView,
  readBoardContentView,
  storeBoardContentView,
  type BoardContentViewStorage
} from './board-content-view';

function memoryStorage(): BoardContentViewStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  };
}

describe('board-content-view', () => {
  it('solo acepta las vistas definidas', () => {
    expect(parseBoardContentView('notes')).toBe('notes');
    expect(parseBoardContentView('checklists')).toBe('checklists');
    expect(parseBoardContentView('invalid')).toBeNull();
  });

  it('guarda y recupera la vista seleccionada', () => {
    const storage = memoryStorage();
    storeBoardContentView('notes', storage);
    expect(storage.getItem(BOARD_CONTENT_VIEW_STORAGE_KEY)).toBe('notes');
    expect(readBoardContentView(storage)).toBe('notes');
  });

  it('usa Checklists por defecto si no hay una preferencia válida', () => {
    expect(readBoardContentView(memoryStorage())).toBe('checklists');
    expect(readBoardContentView({
      getItem: () => 'invalid',
      setItem: () => undefined
    })).toBe('checklists');
  });

  it('no falla si el almacenamiento del navegador no está disponible', () => {
    const broken: BoardContentViewStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); }
    };
    expect(readBoardContentView(broken)).toBe('checklists');
    expect(() => storeBoardContentView('notes', broken)).not.toThrow();
  });
});
