import { ChecklistBoard, ChecklistList, ChecklistTask } from '../../../models/board.model';

const DAY_MS = 24 * 60 * 60 * 1000;

const VISUAL_COLORS = ['#5145e8', '#5be9b0', '#d3defe', '#ffd4d0', '#cfd8ff'] as const;

function isoDaysFrom(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

function createTasks(
  listId: string,
  now: Date,
  entries: readonly { text: string; completed?: boolean }[]
): ChecklistTask[] {
  return entries.map((entry, position) => ({
    id: `${listId}-tarea-${position + 1}`,
    listId,
    text: entry.text,
    completed: entry.completed ?? false,
    position,
    createdAt: isoDaysFrom(now, -position)
  }));
}

function createList(
  id: string,
  boardId: string,
  title: string,
  position: number,
  colorIndex: number,
  now: Date,
  tasks: readonly { text: string; completed?: boolean }[]
): ChecklistList {
  return {
    id,
    boardId,
    title,
    visualColor: VISUAL_COLORS[colorIndex % VISUAL_COLORS.length],
    position,
    createdAt: isoDaysFrom(now, -position),
    updatedAt: isoDaysFrom(now, -position),
    tasks: createTasks(id, now, tasks)
  };
}

export function createMockBoard(now: Date): ChecklistBoard {
  const boardId = 'mock-board-id';
  const lists = [
    createList('mock-list-compras', boardId, 'Compras de la semana', 0, 0, now, [
      { text: 'Frutas y verduras' },
      { text: 'Pan para el desayuno', completed: true },
      { text: 'Leche y yogur' },
      { text: 'Café molido', completed: true }
    ]),
    createList('mock-list-vacia', boardId, 'Ideas para después', 1, 1, now, []),
    createList('mock-list-completa', boardId, 'Preparar la casa', 2, 2, now, [
      { text: 'Regar las plantas', completed: true },
      { text: 'Ordenar el escritorio', completed: true },
      { text: 'Cambiar las sábanas', completed: true }
    ]),
    createList(
      'mock-list-larga',
      boardId,
      'Preparativos detallados para el viaje familiar de fin de semana',
      3,
      3,
      now,
      [
        { text: 'Confirmar la reserva del alojamiento' },
        { text: 'Preparar documentos y tarjetas' },
        { text: 'Armar una lista de música para el camino', completed: true },
        { text: 'Revisar el pronóstico del tiempo' },
        { text: 'Llevar juegos para los niños', completed: true }
      ]
    ),
    createList('mock-list-proyecto', boardId, 'Proyecto del huerto', 4, 4, now, [
      { text: 'Elegir las semillas', completed: true },
      { text: 'Preparar la tierra', completed: true },
      { text: 'Buscar macetas nuevas', completed: true },
      { text: 'Anotar fechas de riego' }
    ]),
    createList('mock-list-recetas', boardId, 'Recetas para probar', 5, 0, now, [
      { text: 'Sopa de zapallo asado' },
      { text: 'Tarta de manzana' }
    ])
  ];

  const listaRestaurable = createList(
    'mock-list-restaurable',
    boardId,
    'Lista reciente del basurero',
    0,
    2,
    now,
    [{ text: 'Esta lista se puede restaurar' }]
  );
  const listaVencida = createList(
    'mock-list-vencida',
    boardId,
    'Lista vencida del basurero',
    1,
    3,
    now,
    [{ text: 'Esta lista debe purgarse' }]
  );

  return {
    id: boardId,
    title: 'Mi tablero de prueba',
    createdAt: isoDaysFrom(now, -14),
    lists,
    pinnedListId: 'mock-list-compras',
    trashedLists: [
      { list: listaRestaurable, deletedAt: isoDaysFrom(now, -2) },
      { list: listaVencida, deletedAt: isoDaysFrom(now, -10) }
    ]
  };
}
