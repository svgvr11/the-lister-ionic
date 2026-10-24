import { Injectable, inject, NgZone, OnDestroy } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ChecklistBoard } from '../models/board.model';
import { BoardMergeConflictError, mergeBoardAdditions } from '../core/board/board-merge/board-merge';
import {
  StoredBoard,
  deserializeBoard,
  isNewerVersion,
  isSameVersion,
  nextBoardVersion
} from '../core/board/board-serialization/board-serialization';
import { BoardConflict, BoardRepository } from './board.repository';
import { AuthService } from './auth.service';
import { isSessionBlocked, throwIfSessionBlocked } from '../core/auth/session-guard/session-guard';

export type { StoredBoard };

@Injectable({ providedIn: 'root' })
export class SupabaseBoardRepository extends BoardRepository implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  private userId: string | null = null;
  private initialized = false;
  private lastKnownUpdatedAt: string | null = null;
  private lastKnownBoard: ChecklistBoard | null = null;
  private channel: RealtimeChannel | null = null;
  private nativeStateListener: PluginListenerHandle | null = null;
  private visibilityListener: (() => void) | null = null;
  private focusListener: (() => void) | null = null;
  private lastRefreshAt = 0;
  private refreshInFlight: Promise<void> | null = null;
  private pendingWriteVersion: string | null = null;
  private readonly conflictSubject = new BehaviorSubject<BoardConflict | null>(null);
  readonly conflict$ = this.conflictSubject.asObservable();
  private readonly authSubscription = this.auth.sessionChanges.subscribe((session) => {
    if (!session || session.user.id !== this.userId) {
      this.stopSynchronization();
      this.userId = null;
      this.initialized = false;
      this.lastKnownUpdatedAt = null;
      this.lastKnownBoard = null;
      this.conflictSubject.next(null);
      return;
    }
    void this.requireClient().realtime.setAuth(session.access_token);
  });
  private readonly subject = new BehaviorSubject<ChecklistBoard>(this.emptyBoard());

  async initializeForUser(userId: string | null, initialBoard?: ChecklistBoard | null): Promise<void> {
    // Pestaña bloqueada por un cambio de sesión en otra pestaña: cero lecturas/escrituras.
    throwIfSessionBlocked();
    if (!userId) throw new Error('Inicia sesión para cargar tu tablero sincronizado.');
    if (this.userId === userId && this.initialized) return;
    this.stopSynchronization();
    this.userId = userId;
    await this.requireClient().realtime.setAuth(this.auth.session?.access_token ?? '');

    const existingBoard = await this.findBoard(userId);
    if (existingBoard) {
      this.publishBoard(existingBoard);
    } else {
      const board = structuredClone(initialBoard ?? this.emptyBoard());
      board.id = crypto.randomUUID();
      if (!board.title) board.title = 'Mi tablero';
      if (!board.createdAt) board.createdAt = new Date().toISOString();

      const { data, error } = await this.requireClient()
        .from('boards')
        .insert({
          owner_id: userId,
          title: board.title,
          created_at: board.createdAt,
          board_data: board
        })
        .select('id, title, created_at, updated_at, board_data')
        .single();

      if (error?.code === '23505') {
        const concurrentBoard = await this.findBoard(userId);
        if (concurrentBoard) this.publishBoard(concurrentBoard);
        else throw error;
      } else if (error) {
        throw error;
      } else {
        this.publishBoard(data as StoredBoard);
      }
    }

    this.initialized = true;
    this.startSynchronization(userId);
  }

  watchBoard(): Observable<ChecklistBoard> {
    return this.subject.asObservable();
  }

  async refresh(): Promise<void> {
    // Bloqueada: en vez de lanzar (los refrescos automáticos de foco/visibilidad no
    // tienen quién capture el error) se ignora el refresco por completo.
    if (isSessionBlocked()) return;
    const userId = this.userId;
    if (!userId) return;
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.refreshBoard(userId).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  async saveBoard(board: ChecklistBoard): Promise<void> {
    // Bloqueada: se rechaza ANTES de tocar Supabase (lectura base, escritura o merge).
    throwIfSessionBlocked();
    const userId = this.userId;
    const unresolvedConflict = this.conflictSubject.value;
    if (unresolvedConflict) {
      this.conflictSubject.next({ ...unresolvedConflict, localBoard: structuredClone(board) });
      throw new BoardMergeConflictError('Resuelve el conflicto pendiente antes de guardar de nuevo.');
    }
    const baseBoard = this.lastKnownBoard;
    const baseVersion = this.lastKnownUpdatedAt;
    if (!userId || !baseBoard || !baseVersion) {
      throw new Error('No hay una versión sincronizada del tablero para guardar.');
    }

    const localBoard = structuredClone(board);
    const savedVersion = await this.updateBoard(localBoard, userId, baseVersion);
    if (savedVersion) {
      // Se publica también en la ruta directa (y no solo al fusionar). Sin esto el tablero
      // guardado se queda solo en `lastKnownBoard`: la página que ya estaba montada (el
      // tablero, al archivar) lo tiene de memoria, pero cualquier OTRA página que se monte
      // después —el Archivo, el Basurero o el propio tablero al volver— se suscribe a este
      // BehaviorSubject y recibiría la versión anterior, con la lista todavía en su sitio.
      this.recordSavedBoard(localBoard, savedVersion, true);
      this.conflictSubject.next(null);
      return;
    }

    const remoteRecord = await this.findBoard(userId);
    if (!remoteRecord) throw new Error('No se pudo recuperar la versión remota del tablero.');
    const remoteBoard = deserializeBoard(remoteRecord);
    let mergedBoard: ChecklistBoard;
    try {
      mergedBoard = mergeBoardAdditions(baseBoard, localBoard, remoteBoard);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'No se pudieron combinar las adiciones.';
      this.publishConflict(localBoard, remoteBoard, remoteRecord.updated_at, reason);
      throw error;
    }

    const retryVersion = await this.updateBoard(mergedBoard, userId, remoteRecord.updated_at);
    if (!retryVersion) {
      const latestRecord = await this.findBoard(userId);
      const latestBoard = latestRecord ? deserializeBoard(latestRecord) : remoteBoard;
      const latestVersion = latestRecord?.updated_at ?? remoteRecord.updated_at;
      const reason = 'El tablero volvió a cambiar mientras se guardaba. Resuelve el conflicto para continuar.';
      this.publishConflict(localBoard, latestBoard, latestVersion, reason);
      throw new BoardMergeConflictError(reason);
    }
    this.recordSavedBoard(mergedBoard, retryVersion, true);
    this.conflictSubject.next(null);
  }

  async resolveConflict(resolution: 'local' | 'remote'): Promise<void> {
    throwIfSessionBlocked();
    const conflict = this.conflictSubject.value;
    if (!conflict || !this.userId) return;

    if (resolution === 'remote') {
      this.lastKnownBoard = structuredClone(conflict.remoteBoard);
      this.lastKnownUpdatedAt = conflict.remoteUpdatedAt;
      this.conflictSubject.next(null);
      this.subject.next(structuredClone(conflict.remoteBoard));
      return;
    }

    const savedVersion = await this.updateBoard(conflict.localBoard, this.userId, conflict.remoteUpdatedAt);
    if (!savedVersion) {
      const latestRecord = await this.findBoard(this.userId);
      if (latestRecord) {
        this.publishConflict(
          conflict.localBoard,
          deserializeBoard(latestRecord),
          latestRecord.updated_at,
          'El tablero remoto cambió otra vez. Revisa las dos versiones antes de resolver.'
        );
      }
      throw new BoardMergeConflictError('El tablero remoto cambió otra vez antes de resolver el conflicto.');
    }

    this.recordSavedBoard(conflict.localBoard, savedVersion);
    this.conflictSubject.next(null);
  }

  private async findBoard(userId: string): Promise<StoredBoard | null> {
    const { data, error } = await this.requireClient()
      .from('boards')
      .select('id, title, created_at, updated_at, board_data')
      .eq('owner_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as StoredBoard | null;
  }

  private async refreshBoard(userId: string): Promise<void> {
    const record = await this.findBoard(userId);
    if (!record || userId !== this.userId) return;
    if (!isNewerVersion(record.updated_at, this.lastKnownUpdatedAt)) return;
    const board = deserializeBoard(record);
    const conflict = this.conflictSubject.value;
    if (conflict) {
      this.publishConflict(conflict.localBoard, board, record.updated_at, conflict.reason);
      return;
    }
    this.publishBoard(record);
  }

  private async updateBoard(board: ChecklistBoard, userId: string, expectedVersion: string): Promise<string | null> {
    const nextVersion = nextBoardVersion(expectedVersion);
    this.pendingWriteVersion = nextVersion;
    try {
      const { data, error } = await this.requireClient()
        .from('boards')
        .update({ title: board.title, board_data: structuredClone(board), updated_at: nextVersion })
        .eq('id', board.id)
        .eq('owner_id', userId)
        .eq('updated_at', expectedVersion)
        .select('updated_at')
        .maybeSingle();
      if (error) throw error;
      return data?.updated_at ?? null;
    } finally {
      this.pendingWriteVersion = null;
    }
  }

  private publishBoard(record: StoredBoard): void {
    const board = deserializeBoard(record);
    this.lastKnownUpdatedAt = record.updated_at;
    this.lastKnownBoard = structuredClone(board);
    this.subject.next(board);
  }

  private recordSavedBoard(board: ChecklistBoard, version: string, emit = false): void {
    this.lastKnownUpdatedAt = version;
    this.lastKnownBoard = structuredClone(board);
    if (emit) this.subject.next(structuredClone(board));
  }

  private publishConflict(localBoard: ChecklistBoard, remoteBoard: ChecklistBoard, remoteUpdatedAt: string, reason: string): void {
    this.lastKnownBoard = structuredClone(remoteBoard);
    this.lastKnownUpdatedAt = remoteUpdatedAt;
    this.conflictSubject.next({
      localBoard: structuredClone(localBoard),
      remoteBoard: structuredClone(remoteBoard),
      remoteUpdatedAt,
      reason
    });
  }

  private startSynchronization(userId: string): void {
    this.channel = this.requireClient()
      .channel(`board-sync:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'boards', filter: `owner_id=eq.${userId}`
      }, (payload) => this.handleBoardChange(payload.new as Partial<StoredBoard>))
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'boards', filter: `owner_id=eq.${userId}`
      }, (payload) => this.handleBoardChange(payload.new as Partial<StoredBoard>))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && this.userId === userId) void this.refreshWhenAllowed();
      });

    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) this.zone.run(() => void this.refreshWhenAllowed());
      }).then((listener) => {
        if (this.userId === userId) this.nativeStateListener = listener;
        else void listener.remove();
      });
      return;
    }

    this.visibilityListener = () => {
      if (document.visibilityState === 'visible') void this.refreshWhenAllowed();
    };
    this.focusListener = () => void this.refreshWhenAllowed();
    document.addEventListener('visibilitychange', this.visibilityListener);
    window.addEventListener('focus', this.focusListener);
  }

  private handleBoardChange(record: Partial<StoredBoard>): void {
    const version = record.updated_at;
    if (!version || isSameVersion(version, this.lastKnownUpdatedAt) || isSameVersion(version, this.pendingWriteVersion)) return;
    void this.refreshWhenAllowed();
  }

  private refreshWhenAllowed(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefreshAt < 3000) return Promise.resolve();
    this.lastRefreshAt = now;
    return this.refresh();
  }

  private stopSynchronization(): void {
    if (this.channel) void this.requireClient().removeChannel(this.channel);
    this.channel = null;
    if (this.nativeStateListener) void this.nativeStateListener.remove();
    this.nativeStateListener = null;
    if (this.visibilityListener) document.removeEventListener('visibilitychange', this.visibilityListener);
    if (this.focusListener) window.removeEventListener('focus', this.focusListener);
    this.visibilityListener = null;
    this.focusListener = null;
  }

  ngOnDestroy(): void {
    this.authSubscription.unsubscribe();
    this.stopSynchronization();
  }

  private emptyBoard(): ChecklistBoard {
    return { id: '', title: 'Mi tablero', createdAt: new Date().toISOString(), lists: [] };
  }

  private requireClient(): SupabaseClient {
    const client = this.auth.supabaseClient;
    if (!client) throw new Error('Configura Supabase para sincronizar el tablero.');
    return client;
  }
}
