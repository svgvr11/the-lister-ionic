import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { NoteAttachmentService } from './note-attachment.service';

describe('NoteAttachmentService', () => {
  it('sube un adjunto con ruta separada por usuario y nota', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upload }));
    TestBed.configureTestingModule({
      providers: [
        NoteAttachmentService,
        { provide: AuthService, useValue: {
          supabaseClient: { storage: { from } },
          session: { user: { id: 'user-id' } },
          getSession: vi.fn()
        } }
      ]
    });

    const service = TestBed.inject(NoteAttachmentService);
    const file = new File(['contenido'], 'nota.pdf', { type: 'application/pdf' });
    const result = await service.upload(file, 'board-id', 'note-id');

    expect(result).toMatchObject({ name: 'nota.pdf', mimeType: 'application/pdf' });
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-id\/board-id\/note-id\/.+-nota\.pdf$/),
      file,
      expect.objectContaining({ contentType: 'application/pdf', upsert: false })
    );
  });

  it('rechaza adjuntos sin sesión', async () => {
    TestBed.configureTestingModule({
      providers: [
        NoteAttachmentService,
        { provide: AuthService, useValue: {
          supabaseClient: { storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: new Error('Storage unavailable') }) })) } },
          session: null,
          getSession: vi.fn().mockResolvedValue(null)
        } }
      ]
    });

    const service = TestBed.inject(NoteAttachmentService);
    const file = new File(['contenido'], 'nota.pdf', { type: 'application/pdf' });
    await expect(service.upload(file, 'board-id', 'note-id')).rejects.toThrow('Inicia sesión');
  });

  it('propaga errores del almacenamiento al subir', async () => {
    const upload = vi.fn().mockResolvedValue({ error: new Error('Storage unavailable') });
    TestBed.configureTestingModule({
      providers: [
        NoteAttachmentService,
        { provide: AuthService, useValue: {
          supabaseClient: { storage: { from: vi.fn(() => ({ upload })) } },
          session: { user: { id: 'user-id' } },
          getSession: vi.fn()
        } }
      ]
    });

    const service = TestBed.inject(NoteAttachmentService);
    const file = new File(['contenido'], 'nota.pdf', { type: 'application/pdf' });
    await expect(service.upload(file, 'board-id', 'note-id')).rejects.toThrow('Storage unavailable');
  });
});
