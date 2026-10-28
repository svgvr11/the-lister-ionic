import { Observable } from 'rxjs';
import { ChecklistBoard } from '../models/board.model';

export abstract class BoardRepository {
  abstract initializeForUser(userId: string | null, initialBoard?: ChecklistBoard | null): Promise<void>;
  abstract watchBoard(): Observable<ChecklistBoard>;
  abstract refresh(): Promise<void>;
  abstract saveBoard(board: ChecklistBoard): Promise<void>;
}
