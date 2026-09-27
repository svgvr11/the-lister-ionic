import { Observable } from 'rxjs';
import { ChecklistBoard } from '../../models/board.models';

export abstract class BoardRepository {
  abstract watchBoard(): Observable<ChecklistBoard>;
  abstract saveBoard(board: ChecklistBoard): Promise<void>;
}
