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

export interface ChecklistBoard {
  id: string;
  title: string;
  createdAt: string;
  lists: ChecklistList[];
}
