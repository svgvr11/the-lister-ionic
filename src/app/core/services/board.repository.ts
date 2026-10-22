import { Observable } from 'rxjs';
import { ChecklistBoard } from '../../models/board.model';

export interface BoardConflict {
  localBoard: ChecklistBoard;
  remoteBoard: ChecklistBoard;
  remoteUpdatedAt: string;
  reason: string;
}

export abstract class BoardRepository {
  abstract readonly conflict$: Observable<BoardConflict | null>;
  abstract initializeForUser(userId: string | null, initialBoard?: ChecklistBoard | null): Promise<void>;
  abstract watchBoard(): Observable<ChecklistBoard>;
  abstract refresh(): Promise<void>;
  abstract saveBoard(board: ChecklistBoard): Promise<void>;
  abstract resolveConflict(resolution: 'local' | 'remote'): Promise<void>;
}
