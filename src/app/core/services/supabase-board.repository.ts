import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.models';
import { BoardRepository } from './board.repository';
import { environment } from '../../../environments/environment';

/**
 * Optional production repository.
 * It is enabled by replacing environment.supabase.url/anonKey with your project credentials.
 * The app currently defaults to LocalBoardRepository so it runs immediately without credentials.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseBoardRepository extends BoardRepository {
  private readonly client: SupabaseClient;
  private readonly subject = new BehaviorSubject<ChecklistBoard>(this.emptyBoard());

  constructor() {
    super();
    this.client = createClient(environment.supabase.url, environment.supabase.anonKey);
  }

  watchBoard(): Observable<ChecklistBoard> {
    return this.subject.asObservable();
  }

  async saveBoard(board: ChecklistBoard): Promise<void> {
    const { error: boardError } = await this.client.from('boards').upsert({ id: board.id, title: board.title });
    if (boardError) throw boardError;

    const lists = board.lists.map((list) => ({ id: list.id, board_id: board.id, title: list.title, position: list.position }));
    const tasks = board.lists.flatMap((list) => list.tasks.map((task) => ({
      id: task.id, list_id: list.id, text: task.text, completed: task.completed, position: task.position
    })));

    const { error: listError } = await this.client.from('checklist_lists').upsert(lists);
    if (listError) throw listError;
    const { error: taskError } = await this.client.from('checklist_tasks').upsert(tasks);
    if (taskError) throw taskError;
    this.subject.next(structuredClone(board));
  }

  private emptyBoard(): ChecklistBoard {
    return { id: '', title: '', createdAt: new Date().toISOString(), lists: [] };
  }
}
