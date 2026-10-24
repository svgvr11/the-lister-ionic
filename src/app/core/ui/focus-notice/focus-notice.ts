export type FocusListRemovalCause = 'archived' | 'trashed' | 'remote';

export function focusListRemovalMessage(cause: FocusListRemovalCause): string {
  switch (cause) {
    case 'archived':
      return 'La lista fue archivada';
    case 'trashed':
      return 'La lista fue eliminada';
    case 'remote':
      return 'La lista ya no está disponible';
  }
}
