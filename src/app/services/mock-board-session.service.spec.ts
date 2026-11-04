import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ChecklistBoard } from '../models/board.model';
import { AuthService } from './auth.service';
import { BoardRepository } from './board.repository';
import { MockBoardSessionService } from './mock-board-session.service';

describe('MockBoardSessionService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('abre y delega guardar/refrescar en el repositorio simulado', async () => {
    const board: ChecklistBoard = {
      id: 'board',
      title: 'Demo',
      createdAt: new Date().toISOString(),
      lists: []
    };
    const subject = new BehaviorSubject(board);
    const repository = {
      initializeForUser: vi.fn(async () => undefined),
      watchBoard: () => subject.asObservable(),
      saveBoard: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined)
    };
    const session = { user: { id: 'mock-user-id' } };
    TestBed.configureTestingModule({
      providers: [
        MockBoardSessionService,
        { provide: AuthService, useValue: { enabled: true, session } },
        { provide: BoardRepository, useValue: repository }
      ]
    });
    const service = TestBed.inject(MockBoardSessionService);

    expect(service.authEnabled).toBe(true);
    expect(service.userId).toBe('mock-user-id');
    const board$ = await service.open();
    expect(await firstValueFrom(board$)).toEqual(board);
    expect(repository.initializeForUser).toHaveBeenCalledWith('mock-user-id');
    await service.save(board);
    await service.refresh();
    expect(repository.saveBoard).toHaveBeenCalledWith(board);
    expect(repository.refresh).toHaveBeenCalledOnce();
  });
});
