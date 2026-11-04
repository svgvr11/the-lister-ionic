import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChecklistBoard } from '../models/board.model';
import { AuthService } from './auth.service';
import { BoardRepository } from './board.repository';

@Injectable()
export class MockBoardSessionService {
  private readonly auth = inject(AuthService);
  private readonly repository = inject(BoardRepository);

  readonly authEnabled = this.auth.enabled;

  get userId(): string | null {
    return this.auth.session?.user.id ?? null;
  }

  async open(): Promise<Observable<ChecklistBoard>> {
    await this.repository.initializeForUser(this.userId);
    return this.repository.watchBoard();
  }

  async save(board: ChecklistBoard): Promise<void> {
    await this.repository.saveBoard(board);
  }

  async refresh(): Promise<void> {
    await this.repository.refresh();
  }
}
