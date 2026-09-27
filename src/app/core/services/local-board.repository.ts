import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.models';
import { BoardRepository } from './board.repository';

const STORAGE_KEY = 'checklist-trello-ionic-v1';

@Injectable({ providedIn: 'root' })
export class LocalBoardRepository extends BoardRepository {
  private readonly subject = new BehaviorSubject<ChecklistBoard>(this.load());

  watchBoard(): Observable<ChecklistBoard> {
    return this.subject.asObservable();
  }

  async saveBoard(board: ChecklistBoard): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    this.subject.next(structuredClone(board));
  }

  private load(): ChecklistBoard {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as ChecklistBoard;
    } catch (error) {
      console.warn('No se pudo leer localStorage', error);
    }

    return this.createSeed();
  }

  private createSeed(): ChecklistBoard {
    const boardId = crypto.randomUUID();
    const now = new Date().toISOString();
    const makeList = (title: string, position: number, taskTexts: string[]): ChecklistList => {
      const listId = crypto.randomUUID();
      return {
        id: listId,
        boardId,
        title,
        position,
        createdAt: now,
        tasks: taskTexts.map((text, index): ChecklistTask => ({
          id: crypto.randomUUID(), listId, text, completed: false, position: index, createdAt: now
        }))
      };
    };

    return {
      id: boardId,
      title: 'Proyectos En Curso 🚀',
      createdAt: now,
      lists: [
        makeList('BT-50', 0, [
          'Cambiar extintor vencido de 2023', 'Arreglar parasol copiloto roto', 'Limpiar sensor trasero derecho',
          'Cubre barandas batea', 'Lona marítima', 'Cierre centralizado portalón', 'Cubre bordes ventanas',
          'Fender flares fangueras', 'Comprar Jumper', 'Chequear cambio de luz baja/alta', 'Enderezar patente delantera'
        ]),
        makeList('CB 125', 1, ['Re-pintar todo el tubo de escape', 'Reiniciar el odómetro por cambio de aceite', 'Quitar óxido de tornillos manubrio']),
        makeList('XR190L', 2, []),
        makeList('Artesanías', 3, ['Poner refuerzo a rampa atenea', 'Poner gomas en las patas rampa atenea'])
      ]
    };
  }
}
