import { describe, expect, it } from 'vitest';
import { isAllowedNoteAttachment, MAX_NOTE_ATTACHMENT_BYTES } from './note-attachment-rules';

describe('note-attachment-rules', () => {
  it('acepta imágenes y documentos permitidos dentro del límite', () => {
    expect(isAllowedNoteAttachment({ type: 'image/png', size: 1024 })).toBe(true);
    expect(isAllowedNoteAttachment({ type: 'application/pdf', size: 1024 })).toBe(true);
  });

  it('rechaza SVG, tipos no permitidos, archivos vacíos y archivos grandes', () => {
    expect(isAllowedNoteAttachment({ type: 'image/svg+xml', size: 1024 })).toBe(false);
    expect(isAllowedNoteAttachment({ type: 'application/x-msdownload', size: 1024 })).toBe(false);
    expect(isAllowedNoteAttachment({ type: 'image/png', size: 0 })).toBe(false);
    expect(isAllowedNoteAttachment({ type: 'image/png', size: MAX_NOTE_ATTACHMENT_BYTES + 1 })).toBe(false);
  });
});
