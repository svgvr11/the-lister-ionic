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
}
