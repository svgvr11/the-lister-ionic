import { Injectable, inject } from '@angular/core';
import type { BoardNoteAttachment } from '../models/board.model';
import { isAllowedNoteAttachment, MAX_NOTE_ATTACHMENT_BYTES } from '../core/board/note-attachment-rules/note-attachment-rules';
import { AuthService } from './auth.service';

const NOTE_ATTACHMENTS_BUCKET = 'note-attachments';

@Injectable({ providedIn: 'root' })
export class NoteAttachmentService {
  private readonly auth = inject(AuthService);

  async upload(file: File, boardId: string, noteId: string): Promise<BoardNoteAttachment> {
    if (!isAllowedNoteAttachment(file)) {
      throw new Error(`El archivo debe ser una imagen o un documento permitido y pesar hasta ${MAX_NOTE_ATTACHMENT_BYTES / 1024 / 1024} MB.`);
    }

    const client = this.auth.supabaseClient;
    const session = this.auth.session ?? await this.auth.getSession();
    if (!client || !session) {
      throw new Error('Inicia sesión para adjuntar archivos a una nota.');
    }

    const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'archivo';
    const id = crypto.randomUUID();
    const path = `${session.user.id}/${boardId}/${noteId}/${id}-${name}`;
    const { error } = await client.storage.from(NOTE_ATTACHMENTS_BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;

    return { id, path, name: file.name, mimeType: file.type, size: file.size };
  }

  async signedUrl(path: string): Promise<string> {
    const client = this.auth.supabaseClient;
    if (!client) throw new Error('Configura Supabase para abrir los adjuntos.');
    const { data, error } = await client.storage.from(NOTE_ATTACHMENTS_BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async remove(path: string): Promise<void> {
    const client = this.auth.supabaseClient;
    if (!client) throw new Error('Configura Supabase para eliminar los adjuntos.');
    const { error } = await client.storage.from(NOTE_ATTACHMENTS_BUCKET).remove([path]);
    if (error) throw error;
  }
}
