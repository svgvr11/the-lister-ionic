import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { createMockBoard } from '../core/board/mock-board/mock-board';
import { ChecklistBoard } from '../models/board.model';
import { BoardRepository } from './board.repository';

@Injectable()
export class MockBoardRepository extends BoardRepository {
  private board = structuredClone(createMockBoard(new Date()));
  private readonly subject = new BehaviorSubject<ChecklistBoard>(structuredClone(this.board));

  async initializeForUser(_userId: string | null, _initialBoard?: ChecklistBoard | null): Promise<void> {
    this.subject.next(structuredClone(this.board));
  }

  watchBoard(): Observable<ChecklistBoard> {
    return this.subject.asObservable();
  }

  async refresh(): Promise<void> {
    this.subject.next(structuredClone(this.board));
  }

  async saveBoard(board: ChecklistBoard): Promise<void> {
    this.board = structuredClone(board);
    this.subject.next(structuredClone(this.board));
  }
}
