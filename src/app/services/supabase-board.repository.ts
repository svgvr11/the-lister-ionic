import { Injectable, inject, NgZone, OnDestroy } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ChecklistBoard } from '../models/board.model';
import {
  StoredBoard,
  deserializeBoard,
  isNewerVersion,
  isSameVersion,
  nextBoardVersion
} from '../core/board/board-serialization/board-serialization';
import { BoardRepository } from './board.repository';
import { AuthService } from './auth.service';
import { isSessionBlocked, throwIfSessionBlocked } from '../core/auth/session-guard/session-guard';

export type { StoredBoard };

/** Un guardado pendiente en la cola del dispositivo. */
interface SaveItem {
  board: ChecklistBoard;
  resolve: (value: void) => void;
  reject: (reason?: unknown) => void;
}

/** Ranura de la cola: el guardado actual y los que desplazó (se resuelven con él). */
interface SaveSlot {
  item: SaveItem;
  displaced: SaveItem[];
}

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
  /** Un solo guardado en vuelo por dispositivo. */
  private saveInFlight = false;
  /** Cambios que llegaron mientras se guardaba: se funden en el siguiente guardado. */
  private pendingSave: SaveSlot | null = null;
  private readonly authSubscription = this.auth.sessionChanges.subscribe((session) => {
    if (!session || session.user.id !== this.userId) {
      this.stopSynchronization();
      this.userId = null;
      this.initialized = false;
      this.lastKnownUpdatedAt = null;
      this.lastKnownBoard = null;
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

  /**
   * Guarda el tablero. Nunca hay dos guardados en vuelo a la vez en un mismo
   * dispositivo: si llega un cambio mientras hay uno en curso, se encola y se fusiona
   * con el estado más reciente en un solo guardado posterior. Un guardado fallido rechaza
   * su promesa (la página lo muestra en `saveError`) pero no bloquea los siguientes.
   */
  async saveBoard(board: ChecklistBoard): Promise<void> {
    throwIfSessionBlocked();
    const item: SaveItem = { board: structuredClone(board), resolve: () => undefined, reject: () => undefined };
    const promise = new Promise<void>((resolve, reject) => {
      item.resolve = resolve;
      item.reject = reject;
    });
    if (this.saveInFlight) {
      // Coalescing: el guardado en curso ya lleva un estado intermedio. Este lo reemplaza
      // por el más reciente; ambos se resuelven cuando éste complete, porque el tablero
      // que se guarda es el completo (no un delta), así que nada se pierde.
      const slot = this.pendingSave;
      this.pendingSave = slot
        ? { item, displaced: [slot.item, ...slot.displaced] }
        : { item, displaced: [] };
      return promise;
    }
    this.saveInFlight = true;
    this.pendingSave = { item, displaced: [] };
    void this.runSave();
    return promise;
  }

  private async runSave(): Promise<void> {
    while (this.pendingSave) {
      const slot = this.pendingSave;
      this.pendingSave = null;
      try {
        await this.doSaveBoard(slot.item.board);
        slot.item.resolve();
        for (const sustituido of slot.displaced) sustituido.resolve();
      } catch (error) {
        slot.item.reject(error);
        for (const sustituido of slot.displaced) sustituido.reject(error);
      }
    }
    this.saveInFlight = false;
  }

  /**
   * Escribe el estado local más reciente tal cual: last-write-wins, sin pedir al usuario
   * que elija una versión. Si la versión del servidor es más reciente que la que se
   * vio al leer, se adopta la remota en silencio. Si no, se conserva el local y se guarda,
   * forzando la escritura sobre la versión remota vista. Marcas iguales: gana el local.
   */
  private async doSaveBoard(board: ChecklistBoard): Promise<void> {
    const userId = this.userId;
    const baseBoard = this.lastKnownBoard;
    const baseVersion = this.lastKnownUpdatedAt;
    if (!userId || !baseBoard || !baseVersion) {
      throw new Error('No hay una versión sincronizada del tablero para guardar.');
    }

    const savedVersion = await this.updateBoard(board, userId, baseVersion);
    if (savedVersion) {
      this.recordSavedBoard(board, savedVersion, true);
      return;
    }

    const remoteRecord = await this.findBoard(userId);
    if (!remoteRecord) throw new Error('No se pudo recuperar la versión remota del tablero.');

    if (isNewerVersion(remoteRecord.updated_at, baseVersion)) {
      // Remoto más reciente: se adopta silenciosamente.
      this.publishBoard(remoteRecord);
      return;
    }

    const retryVersion = await this.updateBoard(board, userId, remoteRecord.updated_at);
    if (retryVersion) {
      this.recordSavedBoard(board, retryVersion, true);
      return;
    }

    const latestRecord = await this.findBoard(userId);
    if (latestRecord && isNewerVersion(latestRecord.updated_at, remoteRecord.updated_at)) {
      this.publishBoard(latestRecord);
      return;
    }
    throw new Error('No se pudo guardar el tablero: cambió mientras se escribía. Inténtalo de nuevo.');
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
