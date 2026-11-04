import { describe, expect, it } from 'vitest';
import { purgeExpiredLists } from '../../list/trash/trash';
import { createMockBoard } from './mock-board';

const NOW = new Date('2026-03-15T12:00:00.000Z');

describe('createMockBoard', () => {
  it('crea posiciones coherentes, pin existente y los escenarios necesarios', () => {
    const board = createMockBoard(NOW);

    expect(board.lists.map((list) => list.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(board.lists.every((list) =>
      list.tasks.every((task, index) => task.listId === list.id && task.position === index)
    )).toBe(true);
    expect(board.lists.some((list) => list.id === board.pinnedListId)).toBe(true);
    expect(board.lists.some((list) => list.tasks.length === 0)).toBe(true);
    expect(board.lists.some((list) =>
      list.tasks.length > 0 && list.tasks.every((task) => task.completed)
    )).toBe(true);
    expect(board.lists.some((list) =>
      list.tasks.filter((task) => task.completed).length > 2
    )).toBe(true);
    expect(board.lists.some((list) => list.title.length > 50)).toBe(true);
    expect(board.lists.map((list) => list.visualColor).filter(Boolean).length).toBeGreaterThanOrEqual(5);
  });

  it('incluye una lista restaurable y otra vencida con fechas relativas al now', () => {
    const board = createMockBoard(NOW);
    const actual = board.trashedLists ?? [];

    expect(actual).toHaveLength(2);
    expect(Date.parse(actual[0].deletedAt)).toBeGreaterThan(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(Date.parse(actual[1].deletedAt)).toBeLessThan(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);

    expect(purgeExpiredLists(board, NOW)).toBe(true);
    expect(board.trashedLists?.map((entry) => entry.list.id)).toEqual(['mock-list-restaurable']);
  });

  it('no comparte estado mutable entre llamadas', () => {
    const first = createMockBoard(NOW);
    first.lists[0].tasks[0].text = 'editada';

    expect(createMockBoard(NOW).lists[0].tasks[0].text).toBe('Frutas y verduras');
  });
});
