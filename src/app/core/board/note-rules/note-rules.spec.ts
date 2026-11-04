import { describe, expect, it } from 'vitest';
import type { BoardNote } from '../../../models/board.model';
import { orderedNotes, setPinnedNote } from './note-rules';

const notes: BoardNote[] = [
  { id: 'a', title: 'A', contentHtml: '', position: 0, createdAt: '', updatedAt: '', attachments: [] },
  { id: 'b', title: 'B', contentHtml: '', position: 1, createdAt: '', updatedAt: '', attachments: [] },
  { id: 'c', title: 'C', contentHtml: '', position: 2, createdAt: '', updatedAt: '', attachments: [] }
];

describe('note-rules', () => {
  it('pone la nota fijada primero y conserva el orden del resto', () => {
    expect(orderedNotes(notes, 'c').map((note) => note.id)).toEqual(['c', 'a', 'b']);
  });

  it('solo permite fijar una nota que pertenezca al tablero', () => {
    expect(setPinnedNote(notes, 'b')).toBe('b');
    expect(setPinnedNote(notes, 'missing')).toBeNull();
    expect(setPinnedNote(notes, null)).toBeNull();
  });
});
