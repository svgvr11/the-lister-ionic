import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChecklistBoard } from '../../models/board.models';
import { AuthService } from './auth.service';
import { BoardRepository } from './board.repository';
import { LocalBoardRepository } from './local-board.repository';
import { SupabaseBoardRepository } from './supabase-board.repository';

/**
 * Abre el tablero del usuario actual y expone el repositorio listo para leer y guardar.
 * Vive fuera de las páginas porque el tablero y el basurero necesitan exactamente la
 * misma inicialización (elegir repositorio, copiar el tablero local a la nube y suscribirse).
 */
@Injectable({ providedIn: 'root' })
export class BoardSessionService {
  private readonly auth = inject(AuthService);
  private readonly localRepository = inject(LocalBoardRepository);
  private readonly supabaseRepository = inject(SupabaseBoardRepository);
  private repository: BoardRepository = this.localRepository;

  readonly authEnabled = this.auth.enabled;

  get userId(): string | null {
    return this.auth.session?.user.id ?? null;
  }

  /**
   * Prepara el repositorio según la sesión y devuelve el tablero en vivo.
   * Lanza si el tablero no se puede cargar, para que cada página muestre su error.
   */
  async open(): Promise<Observable<ChecklistBoard>> {
    const session = this.auth.session;
    if (session) {
      // El tablero guardado en el dispositivo sirve de semilla para el primer ingreso en la nube.
      await this.localRepository.initializeForUser(session.user.id);
      const localBoard = this.localRepository.getStoredBoardForUser(session.user.id);
      this.repository = this.supabaseRepository;
      await this.repository.initializeForUser(session.user.id, localBoard);
    } else {
      this.repository = this.localRepository;
      await this.repository.initializeForUser(null);
    }
    return this.repository.watchBoard();
  }

  async save(board: ChecklistBoard): Promise<void> {
    await this.repository.saveBoard(board);
  }
}