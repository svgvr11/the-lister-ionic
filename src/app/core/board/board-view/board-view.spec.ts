import { describe, expect, it } from 'vitest';
import { BOARD_VIEW_STORAGE_KEY, parseBoardView, readStoredBoardView, storeBoardView } from './board-view';
import type { BoardViewStorage } from './board-view';

/**
 * Pruebas del modo de vista del tablero (tarjetas vs lista). Migrado desde
 * scripts/test-board-view.mjs. En web siempre es lista; en nativo se guarda la elección.
 */

const fakeStorage = (): BoardViewStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => data.set(key, String(value))
  };
};

const brokenStorage = (): BoardViewStorage => ({
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  }
});

describe('board-view', () => {
  it('parseBoardView valida correctamente', () => {
    expect(parseBoardView('cards')).toBe('cards');
    expect(parseBoardView('list')).toBe('list');
    expect(parseBoardView('invalid')).toBeNull();
    expect(parseBoardView(null)).toBeNull();
    expect(parseBoardView(undefined)).toBeNull();
  });

  it('en web (isNative = false) siempre devuelve list sin importar storage', () => {
    const storage = fakeStorage();
    storage.setItem(BOARD_VIEW_STORAGE_KEY, 'cards');
    expect(readStoredBoardView(false, storage)).toBe('list');
    storage.setItem(BOARD_VIEW_STORAGE_KEY, 'list');
    expect(readStoredBoardView(false, storage)).toBe('list');
    storage.setItem(BOARD_VIEW_STORAGE_KEY, 'basura');
    expect(readStoredBoardView(false, storage)).toBe('list');
  });

  it('en nativo (isNative = true) el valor por defecto es cards', () => {
    const storage = fakeStorage();
    expect(readStoredBoardView(true, storage)).toBe('cards');
  });

  it('en nativo se lee y guarda correctamente', () => {
    const storage = fakeStorage();
    storeBoardView('list', storage);
    expect(readStoredBoardView(true, storage)).toBe('list');
    expect(storage.getItem(BOARD_VIEW_STORAGE_KEY)).toBe('list');

    storeBoardView('cards', storage);
    expect(readStoredBoardView(true, storage)).toBe('cards');
    expect(storage.getItem(BOARD_VIEW_STORAGE_KEY)).toBe('cards');
  });

  it('en nativo un valor inválido en storage devuelve cards', () => {
    const storage = fakeStorage();
    storage.setItem(BOARD_VIEW_STORAGE_KEY, 'otro');
    expect(readStoredBoardView(true, storage)).toBe('cards');
  });

  it('si localStorage lanza error, en nativo devuelve cards y no rompe', () => {
    const roto = brokenStorage();
    expect(readStoredBoardView(true, roto)).toBe('cards');
    expect(() => storeBoardView('list', roto)).not.toThrow(); // no debe lanzar
  });
});
