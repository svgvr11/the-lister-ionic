import type { BoardNote } from '../../../models/board.model';

export function orderedNotes(notes: BoardNote[], pinnedNoteId: string | null | undefined): BoardNote[] {
  return [...notes].sort((left, right) => {
    if (left.id === pinnedNoteId) return -1;
    if (right.id === pinnedNoteId) return 1;
    return left.position - right.position;
  });
}

export function setPinnedNote(notes: BoardNote[], noteId: string | null): string | null {
  return noteId && notes.some((note) => note.id === noteId) ? noteId : null;
}
