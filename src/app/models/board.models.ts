export interface ChecklistTask {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  position: number;
  createdAt: string;
}

export interface ChecklistList {
  id: string;
  boardId: string;
  title: string;
  visualColor?: string;
  position: number;
  createdAt: string;
  tasks: ChecklistTask[];
}

/** Lista descartada: se conserva en el basurero junto a la fecha en que se eliminó del tablero. */
export interface ChecklistTrashedList {
  list: ChecklistList;
  deletedAt: string;
}

/**
 * Lista archivada: sale del tablero ya terminada (100% completa) y se conserva en el
 * archivo junto a la fecha en que se archivó. Es la misma forma que la del basurero,
 * con su propio plazo de conservación.
 */
export interface ChecklistArchivedList {
  list: ChecklistList;
  archivedAt: string;
}

export interface ChecklistBoard {
  id: string;
  title: string;
  createdAt: string;
  lists: ChecklistList[];
  /**
   * Lista fijada al tablero: siempre se dibuja en la primera posición de la rejilla.
   * Opcional para que los tableros ya guardados (sin pin) sigan cargando sin migración.
   */
  pinnedListId?: string | null;
  /** Opcional para que los tableros ya guardados (sin basurero) sigan cargando sin migración. */
  trashedLists?: ChecklistTrashedList[];
  /** Opcional para que los tableros ya guardados (sin archivo) sigan cargando sin migración. */
  archivedLists?: ChecklistArchivedList[];
}
