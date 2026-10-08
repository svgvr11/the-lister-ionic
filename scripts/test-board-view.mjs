import assert from 'node:assert/strict';
import {
  BOARD_VIEW_STORAGE_KEY, parseBoardView, readStoredBoardView, storeBoardView
} from '../src/app/core/board-view.ts';

const fakeStorage = () => {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value))
  };
};

const brokenStorage = () => ({
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); }
});

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

check('parseBoardView valida correctamente', () => {
  assert.equal(parseBoardView('cards'), 'cards');
  assert.equal(parseBoardView('list'), 'list');
  assert.equal(parseBoardView('invalid'), null);
  assert.equal(parseBoardView(null), null);
  assert.equal(parseBoardView(undefined), null);
});

check('en web (isNative = false) siempre devuelve list sin importar storage', () => {
  const storage = fakeStorage();
  storage.setItem(BOARD_VIEW_STORAGE_KEY, 'cards');
  assert.equal(readStoredBoardView(false, storage), 'list');
  storage.setItem(BOARD_VIEW_STORAGE_KEY, 'list');
  assert.equal(readStoredBoardView(false, storage), 'list');
  storage.setItem(BOARD_VIEW_STORAGE_KEY, 'basura');
  assert.equal(readStoredBoardView(false, storage), 'list');
});

check('en nativo (isNative = true) el valor por defecto es cards', () => {
  const storage = fakeStorage();
  assert.equal(readStoredBoardView(true, storage), 'cards');
});

check('en nativo se lee y guarda correctamente', () => {
  const storage = fakeStorage();
  storeBoardView('list', storage);
  assert.equal(readStoredBoardView(true, storage), 'list');
  assert.equal(storage.getItem(BOARD_VIEW_STORAGE_KEY), 'list');

  storeBoardView('cards', storage);
  assert.equal(readStoredBoardView(true, storage), 'cards');
  assert.equal(storage.getItem(BOARD_VIEW_STORAGE_KEY), 'cards');
});

check('en nativo un valor invalido en storage devuelve cards', () => {
  const storage = fakeStorage();
  storage.setItem(BOARD_VIEW_STORAGE_KEY, 'otro');
  assert.equal(readStoredBoardView(true, storage), 'cards');
});

check('si localStorage lanza error, en nativo devuelve cards y no rompe', () => {
  const roto = brokenStorage();
  assert.equal(readStoredBoardView(true, roto), 'cards');
  storeBoardView('list', roto); // no debe lanzar
});

console.log(`board-view: ${cases} cases passed`);
