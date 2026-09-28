import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ChecklistBoard } from '../../models/board.models';
import { BoardRepository } from './board.repository';
import { environment } from '../../../environments/environment';

interface StoredBoard {
  id: string;
  title: string;
  created_at: string;
  board_data: ChecklistBoard | null;
}

@Injectable({ providedIn: 'root' })
export class SupabaseBoardRepository extends BoardRepository {
  private readonly client: SupabaseClient | null = this.hasCredentials()
    ? createClient(environment.supabase.url, environment.supabase.anonKey)
    : null;
  private userId: string | null = null;
  private readonly subject = new BehaviorSubject<ChecklistBoard>(this.emptyBoard());

  async initializeForUser(userId: string | null, initialBoard?: ChecklistBoard | null): Promise<void> {
    if (!userId) throw new Error('Inicia sesión para cargar tu tablero sincronizado.');
    this.userId = userId;

    const existingBoard = await this.findBoard(userId);
    if (existingBoard) {
      this.subject.next(this.deserializeBoard(existingBoard));
      return;
    }

    const board = initialBoard ?? this.emptyBoard();
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
      .select('id, title, created_at, board_data')
      .single();

    if (error?.code === '23505') {
      const concurrentBoard = await this.findBoard(userId);
      if (concurrentBoard) {
        this.subject.next(this.deserializeBoard(concurrentBoard));
        return;
      }
    }
    if (error) throw error;

    board.id = data.id;
    this.subject.next(this.deserializeBoard(data as StoredBoard));
  }

  watchBoard(): Observable<ChecklistBoard> {
    return this.subject.asObservable();
  }

  async saveBoard(board: ChecklistBoard): Promise<void> {
    if (!this.userId) throw new Error('No hay un usuario autenticado para guardar el tablero.');

    const { error } = await this.requireClient()
      .from('boards')
      .upsert({
        id: board.id,
        owner_id: this.userId,
        title: board.title,
        created_at: board.createdAt,
        board_data: structuredClone(board),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) throw error;
    this.subject.next(structuredClone(board));
  }

  private async findBoard(userId: string): Promise<StoredBoard | null> {
    const { data, error } = await this.requireClient()
      .from('boards')
      .select('id, title, created_at, board_data')
      .eq('owner_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as StoredBoard | null;
  }

  private deserializeBoard(record: StoredBoard): ChecklistBoard {
    const data = record.board_data;
    if (data && Array.isArray(data.lists)) {
      return {
        ...data,
        id: record.id,
        title: record.title,
        createdAt: record.created_at
      };
    }
    return { id: record.id, title: record.title, createdAt: record.created_at, lists: [] };
  }

  private emptyBoard(): ChecklistBoard {
    return { id: '', title: 'Mi tablero', createdAt: new Date().toISOString(), lists: [] };
  }

  private hasCredentials(): boolean {
    const { url, anonKey } = environment.supabase;
    return Boolean(url.trim() && anonKey.trim() && !url.includes('YOUR_') && !anonKey.includes('YOUR_'));
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error('Configura Supabase para sincronizar el tablero.');
    return this.client;
  }
}
