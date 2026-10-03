import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ChecklistBoard } from '../../models/board.models';
import { BoardConflict, BoardRepository } from './board.repository';

const STORAGE_KEY = 'the-lister-ionic-v1';

@Injectable({ providedIn: 'root' })
export class LocalBoardRepository extends BoardRepository {
  private storageKey = STORAGE_KEY;
  private readonly subject = new BehaviorSubject<ChecklistBoard>(this.load());
  private readonly conflictSubject = new BehaviorSubject<BoardConflict | null>(null);
  readonly conflict$ = this.conflictSubject.asObservable();

  watchBoard(): Observable<ChecklistBoard> {
    return this.subject.asObservable();
  }

  async refresh(): Promise<void> {
    this.subject.next(this.load());
  }

  async resolveConflict(_resolution: 'local' | 'remote'): Promise<void> {
    this.conflictSubject.next(null);
  }

  async saveBoard(board: ChecklistBoard): Promise<void> {
    localStorage.setItem(this.storageKey, JSON.stringify(board));
    this.subject.next(structuredClone(board));
  }

  async initializeForUser(userId: string | null): Promise<void> {
    this.storageKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
    this.subject.next(this.load());
  }

  getStoredBoardForUser(userId: string): ChecklistBoard | null {
    for (const key of [`${STORAGE_KEY}:${userId}`, STORAGE_KEY]) {
      const storedBoard = this.readBoard(key);
      if (storedBoard) return storedBoard;
    }
    return null;
  }

  private load(): ChecklistBoard {
    return this.readBoard(this.storageKey) ?? this.createEmptyBoard();
  }

  private readBoard(key: string): ChecklistBoard | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as ChecklistBoard;
    } catch (error) {
      console.warn('No se pudo leer localStorage', error);
    }
    return null;
  }

  private createEmptyBoard(): ChecklistBoard {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      title: 'Mi tablero',
      createdAt: now,
      lists: []
    };
  }
}
