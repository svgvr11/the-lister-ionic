import { describe, expect, it } from 'vitest';
import { mergeBoardAdditions } from './board-merge';
import type { ChecklistBoard, ChecklistList, ChecklistTask } from '../models/board.models';

/**
 * Pruebas del merge de adiciones. Migrado desde scripts/test-board-merge.mjs.
 * `mergeBoardAdditions` solo admite adiciones: cualquier edición, borrado o reorden
 * provoca un BoardMergeConflictError.
 */

const base: ChecklistBoard = {
  id: 'board-1',
  title: 'Board',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: [
    {
      id: 'list-1',
      boardId: 'board-1',
      title: 'List',
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      tasks: [
        {
          id: 'task-1',
          listId: 'list-1',
          text: 'Existing',
          completed: false,
          position: 0,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }
  ]
};

const newList = (id: string, title = id): ChecklistList => ({
  id,
  boardId: 'board-1',
  title,
  position: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  tasks: []
});

const newTask = (id: string, text = id): ChecklistTask => ({
  id,
  listId: 'list-1',
  text,
  completed: false,
  position: 1,
  createdAt: '2026-01-02T00:00:00.000Z'
});

describe('board-merge', () => {
  it('una lista añadida en local entra en el resultado', () => {
    const local = structuredClone(base);
    local.lists.push(newList('local-list'));
    const result = mergeBoardAdditions(base, local, structuredClone(base));
    expect(result.lists.map((list) => list.id)).toEqual(['list-1', 'local-list']);
  });

  it('una lista añadida en remoto entra en el resultado', () => {
    const remote = structuredClone(base);
    remote.lists.push(newList('remote-list'));
    const result = mergeBoardAdditions(base, structuredClone(base), remote);
    expect(result.lists.map((list) => list.id)).toEqual(['list-1', 'remote-list']);
  });

  it('tareas añadidas en ambos dispositivos se combinan', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists[0].tasks.push(newTask('local-task'));
    remote.lists[0].tasks.push(newTask('remote-task'));
    const result = mergeBoardAdditions(base, local, remote);
    expect(result.lists[0].tasks.map((task) => task.id)).toEqual([
      'task-1',
      'remote-task',
      'local-task'
    ]);
  });

  it('la misma adición en los dos lados no se duplica', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists[0].tasks.push(newTask('shared-task', 'Same addition'));
    remote.lists[0].tasks.push(newTask('shared-task', 'Same addition'));
    const result = mergeBoardAdditions(base, local, remote);
    expect(result.lists[0].tasks.filter((task) => task.id === 'shared-task').length).toBe(1);
  });

  it('una tarea existente editada en ambos lados es un conflicto', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists[0].tasks[0].text = 'Local edit';
    remote.lists[0].tasks[0].text = 'Remote edit';
    expect(() => mergeBoardAdditions(base, local, remote)).toThrow(/no son adiciones|editadas/i);
  });

  it('una lista existente editada en remoto se conserva y la nueva local también', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists.push(newList('local-list'));
    remote.lists[0].title = 'Remote edit';
    const result = mergeBoardAdditions(base, local, remote);
    expect(result.lists[0].title).toBe('Remote edit');
    expect(result.lists[1].id).toBe('local-list');
  });
});

/**
 * El `updatedAt` de la lista viaja dentro de `board_data`, y cada dispositivo escribe la fecha
 * de SU reloj en cada acción. Si se comparara como un campo más, dos dispositivos que añaden
 * tareas distintas a la misma lista parecerían haber editado la lista y la fusión seria un
 * conflicto inventado. Estos casos fijan esa regla.
 */
describe('board-merge: updatedAt de las listas', () => {
  it('tareas distintas en la misma lista no son un conflicto y gana la fecha mayor', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists[0].updatedAt = '2026-01-05T10:00:00.000Z';
    remote.lists[0].updatedAt = '2026-01-04T09:00:00.000Z';
    local.lists[0].tasks.push(newTask('local-task'));
    remote.lists[0].tasks.push(newTask('remote-task'));

    const result = mergeBoardAdditions(base, local, remote);

    expect(result.lists[0].tasks.map((task) => task.id)).toEqual([
      'task-1',
      'remote-task',
      'local-task'
    ]);
    expect(result.lists[0].updatedAt).toBe('2026-01-05T10:00:00.000Z');
  });

  it('la fecha más reciente puede ser la del remoto', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists[0].updatedAt = '2026-01-03T10:00:00.000Z';
    remote.lists[0].updatedAt = '2026-01-04T09:00:00.000Z';
    local.lists[0].tasks.push(newTask('local-task'));
    remote.lists[0].tasks.push(newTask('remote-task'));

    const result = mergeBoardAdditions(base, local, remote);

    expect(result.lists[0].updatedAt).toBe('2026-01-04T09:00:00.000Z');
  });

  it('si un lado no tiene updatedAt, sobrevive el del otro', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    // El remoto se guardó antes de que existiera el campo.
    remote.lists[0].updatedAt = undefined;
    local.lists[0].updatedAt = '2026-01-05T10:00:00.000Z';
    local.lists[0].tasks.push(newTask('local-task'));
    remote.lists[0].tasks.push(newTask('remote-task'));

    const result = mergeBoardAdditions(base, local, remote);

    expect(result.lists[0].updatedAt).toBe('2026-01-05T10:00:00.000Z');
  });

  it('si ningún lado tiene updatedAt, la lista fusionada no gana el campo', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    delete base.lists[0].updatedAt;
    local.lists[0].tasks.push(newTask('local-task'));
    remote.lists[0].tasks.push(newTask('remote-task'));

    const result = mergeBoardAdditions(base, local, remote);

    expect(result.lists[0].updatedAt).toBeUndefined();
  });

  it('la lista que solo tocó el local conserva su fecha', () => {
    // El local añadió una lista completa: viaja tal cual, con su fecha.
    const local = structuredClone(base);
    local.lists[0].tasks.push(newTask('local-task'));
    local.lists.push(newList('local-list'));
    local.lists[1].updatedAt = '2026-01-05T10:00:00.000Z';

    const result = mergeBoardAdditions(base, local, structuredClone(base));

    expect(result.lists[1].id).toBe('local-list');
    expect(result.lists[1].updatedAt).toBe('2026-01-05T10:00:00.000Z');
  });

  it('una lista existente editada de verdad en local sigue siendo un conflicto', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists[0].updatedAt = '2026-01-05T10:00:00.000Z';
    local.lists[0].title = 'Local edit';
    remote.lists[0].title = 'Remote edit';
    expect(() => mergeBoardAdditions(base, local, remote)).toThrow(/editadas/i);
  });
});
