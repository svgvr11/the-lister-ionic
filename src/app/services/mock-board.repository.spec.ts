import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { MockBoardRepository } from './mock-board.repository';
import { ChecklistBoard } from '../models/board.model';

const latestBoard = (repository: MockBoardRepository): Promise<ChecklistBoard> =>
  firstValueFrom(repository.watchBoard());

describe('MockBoardRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('carga una copia nueva del fixture en memoria', async () => {
    const repository = new MockBoardRepository();
    const board = await latestBoard(repository);

    expect(board.id).toBe('mock-board-id');
    expect(board.lists).toHaveLength(6);
    expect(board.pinnedListId).toBe('mock-list-compras');
  });

  it('saveBoard emite una copia y no expone referencias mutables', async () => {
    const repository = new MockBoardRepository();
    const emitted: ChecklistBoard[] = [];
    repository.watchBoard().subscribe((board) => emitted.push(board));
    const changed = structuredClone(emitted[0]);
    changed.title = 'Tablero editado';

    await repository.saveBoard(changed);

    expect(emitted.at(-1)).not.toBe(changed);
    expect(emitted.at(-1)).toEqual(changed);
    changed.title = 'Mutación externa';
    expect(await latestBoard(repository)).toMatchObject({ title: 'Tablero editado' });
  });

  it('dos instancias mantienen estados separados', async () => {
    const first = new MockBoardRepository();
    const second = new MockBoardRepository();
    const changed = await latestBoard(first);
    changed.title = 'Solo primera instancia';
    await first.saveBoard(changed);

    expect(await latestBoard(second)).toMatchObject({ title: 'Mi tablero de prueba' });
  });

  it('no consulta ni escribe en localStorage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const repository = new MockBoardRepository();
    const board = await latestBoard(repository);
    await repository.initializeForUser('mock-user-id');
    await repository.saveBoard(board);
    await repository.refresh();

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
