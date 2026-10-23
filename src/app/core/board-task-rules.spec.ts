import { describe, expect, it } from 'vitest';
import type { ChecklistBoard, ChecklistList, ChecklistTask } from '../models/board.model';
import {
  COMPLETED_PREVIEW_LIMIT,
  addTaskToList,
  completedTasks,
  deleteTask,
  dropTask,
  dropTaskInList,
  editTaskText,
  getHighlightedSegments,
  hiddenCompletedCount,
  pendingTasks,
  reorderTasks,
  setTaskPositions,
  shouldShowCompletedToggle,
  toggleTask,
  visibleCompletedTasks
} from './board-task-rules';

/**
 * Pruebas de las reglas de las tareas.
 *
 * Se escribieron contra el comportamiento que ya tenía `BoardPage` (pruebas de
 * caracterización): fijan la regla tal y como es para que al extraer la lógica nada
 * cambie sin que salte aquí.
 */

/** Reloj e ids fijos: nadie depende del reloj real ni de `crypto`. */
const AHORA = '2026-06-01T12:00:00.000Z';
const IDS = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5'];
let siguienteId = 0;
const idFijo = () => IDS[siguienteId++] ?? `id-extra-${siguienteId}`;
const relojFijo = () => AHORA;

const tarea = (
  id: string,
  opts: { completed?: boolean; position?: number; text?: string } = {}
): ChecklistTask => ({
  id,
  listId: 'l1',
  text: opts.text ?? `tarea ${id}`,
  completed: opts.completed ?? false,
  position: opts.position ?? 0,
  createdAt: '2026-01-01T00:00:00.000Z'
});

const lista = (id: string, tasks: ChecklistTask[] = []): ChecklistList => ({
  id,
  boardId: 'board-1',
  title: `Lista ${id}`,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  tasks
});

const tablero = (listas: ChecklistList[]): ChecklistBoard => ({
  id: 'board-1',
  title: 'Mi tablero',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: listas
});

/** Tablero con las tareas dadas, agrupadas por lista. */
const tableroDe = (entradas: Record<string, ChecklistTask[]>): ChecklistBoard =>
  tablero(Object.entries(entradas).map(([id, tasks]) => lista(id, tasks)));

describe('board-task-rules: añadir tareas', () => {
  it('añade al final con la posición siguiente a la más alta', () => {
    siguienteId = 0;
    const l = lista('l1', [tarea('a', { position: 0 }), tarea('b', { position: 3 })]);

    const creada = addTaskToList(l, 'Comprar pan', { nuevoId: idFijo, ahora: relojFijo });

    expect(creada).not.toBeNull();
    expect(l.tasks.map((t) => t.id)).toEqual(['a', 'b', 'id-1']);
    expect(l.tasks[2].position).toBe(4);
    expect(l.tasks[2].text).toBe('Comprar pan');
    expect(l.tasks[2].createdAt).toBe(AHORA);
  });

  it('una lista vacía recibe la posición 0', () => {
    siguienteId = 0;
    const l = lista('l1', []);

    addTaskToList(l, 'Primera', { nuevoId: idFijo, ahora: relojFijo });

    expect(l.tasks.length).toBe(1);
    expect(l.tasks[0].position).toBe(0);
  });

  it('un borrador vacío o de espacios no crea nada', () => {
    for (const texto of ['', '   ', '\n\t  ', ' \r\n ']) {
      const l = lista('l1', [tarea('a', { position: 0 })]);
      expect(addTaskToList(l, texto, { nuevoId: idFijo }), JSON.stringify(texto)).toBeNull();
      expect(l.tasks.map((t) => t.id)).toEqual(['a']);
    }
  });

  it('las posiciones existentes no se renumeran al añadir', () => {
    // Añadir no reordena: solo coloca la nueva detrás de la más alta.
    siguienteId = 0;
    const l = lista('l1', [tarea('a', { position: 5 }), tarea('b', { position: 2 })]);

    addTaskToList(l, 'Otra', { nuevoId: idFijo, ahora: relojFijo });

    expect(l.tasks.map((t) => t.position)).toEqual([5, 2, 6]);
  });

  it('añadir una tarea fija el updatedAt de la lista', () => {
    const l = lista('l1');

    const creada = addTaskToList(l, 'Pan', { nuevoId: idFijo, ahora: relojFijo });

    expect(creada?.createdAt).toBe(AHORA);
    // La fecha de la tarea nueva y la de la lista son la misma: una sola por acción.
    expect(l.updatedAt).toBe(AHORA);
  });

  it('un borrador vacío no crea tarea ni toca la fecha de la lista', () => {
    const l = lista('l1', [tarea('a', { position: 0 })]);

    expect(addTaskToList(l, '   ', { nuevoId: idFijo, ahora: relojFijo })).toBeNull();
    expect(l.updatedAt).toBeUndefined();
  });
});

describe('board-task-rules: marcar y desmarcar', () => {
  it('alternar cambia el estado y baja la tarea al final', () => {
    const l = lista('l1', [
      tarea('a', { position: 0 }),
      tarea('b', { position: 1 }),
      tarea('c', { position: 2 })
    ]);

    expect(toggleTask(l, 'a')).toBe(true);
    expect(l.tasks[0].completed).toBe(true);
    // OJO: `reorderTasks` reescribe las posiciones pero NO reordena el array, así que el
    // array sigue siendo ['a','b','c'] y quien marca el orden es la `position`: la
    // completada se va al final con la posición más alta. Lo mismo hacía la página.
    expect(l.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(l.tasks.map((t) => t.position)).toEqual([2, 0, 1]);
    // Y por eso se dibuja al final: las pendientes van antes por posición.
    expect(pendingTasks(l).map((t) => t.id)).toEqual(['b', 'c']);
    expect(completedTasks(l).map((t) => t.id)).toEqual(['a']);
  });

  it('desmarcar devuelve la tarea al grupo de pendientes', () => {
    const l = lista('l1', [
      tarea('a', { position: 0, completed: true }),
      tarea('b', { position: 1 })
    ]);

    expect(toggleTask(l, 'a')).toBe(true);

    // Ya no está completada, así que se dibuja con las pendientes. Y como dentro de ese
    // grupo manda la posición, 'a' (que tenía la 0) vuelve a su sitio original.
    expect(l.tasks.map((t) => t.completed)).toEqual([false, false]);
    expect(pendingTasks(l).map((t) => t.id)).toEqual(['a', 'b']);
    expect(l.tasks.map((t) => t.position)).toEqual([0, 1]);
  });

  it('una tarea que no está en la lista no cambia nada', () => {
    const l = lista('l1', [tarea('a', { position: 0 })]);
    expect(toggleTask(l, 'no-existe')).toBe(false);
    expect(l.tasks.length).toBe(1);
  });

  it('marcar y desmarcar son modificaciones de la lista: fijan su updatedAt', () => {
    const l = lista('l1', [tarea('a', { position: 0 })]);

    expect(toggleTask(l, 'a', AHORA)).toBe(true);
    expect(l.updatedAt).toBe(AHORA);

    expect(toggleTask(l, 'a', AHORA)).toBe(true);
    expect(l.updatedAt).toBe(AHORA);
  });

  it('marcar una tarea que no existe no toca la fecha de la lista', () => {
    const l = lista('l1', [tarea('a', { position: 0 })]);
    toggleTask(l, 'no-existe', AHORA);
    expect(l.updatedAt).toBeUndefined();
  });
});

describe('board-task-rules: borrar tareas', () => {
  it('borra la última tarea y deja las posiciones seguidas', () => {
    const l = lista('l1', [tarea('a', { position: 0 }), tarea('b', { position: 1 })]);

    expect(deleteTask(l, 'b')).toBe(true);

    expect(l.tasks.map((t) => t.id)).toEqual(['a']);
    expect(l.tasks.map((t) => t.position)).toEqual([0]);
  });

  it('borrar renumera aunque las posiciones estén duplicadas o negativas', () => {
    for (const posiciones of [
      [5, 5, 5],
      [-3, -1, -2],
      [0, 10, 2, 2]
    ]) {
      const l = lista('l1', posiciones.map((position, i) => tarea(`t${i}`, { position })));

      deleteTask(l, 't1');

      // Quedan seguidas y ordenadas entre sí, sin huecos.
      const esperadas = [...l.tasks].map((_, index) => index);
      expect(l.tasks.map((t) => t.position), JSON.stringify(posiciones)).toEqual(esperadas);
      expect(l.tasks.length).toBe(posiciones.length - 1);
    }
  });

  it('una tarea que no está en la lista no cambia nada', () => {
    const l = lista('l1', [tarea('a', { position: 0 })]);
    expect(deleteTask(l, 'no-existe')).toBe(false);
    expect(l.tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('borrar una tarea es una modificación de la lista: fija su updatedAt', () => {
    const l = lista('l1', [tarea('a', { position: 0 }), tarea('b', { position: 1 })]);

    expect(deleteTask(l, 'b', AHORA)).toBe(true);
    expect(l.updatedAt).toBe(AHORA);
  });

  it('borrar una tarea que no existe no toca la fecha de la lista', () => {
    const l = lista('l1', [tarea('a', { position: 0 })]);
    deleteTask(l, 'no-existe', AHORA);
    expect(l.updatedAt).toBeUndefined();
  });
});

describe('board-task-rules: reordenar', () => {
  it('reorderTasks deja pendientes primero y completadas después', () => {
    const l = lista('l1', [
      tarea('c1', { position: 0, completed: true }),
      tarea('p1', { position: 4 }),
      tarea('c2', { position: 2, completed: true }),
      tarea('p2', { position: 1 })
    ]);

    reorderTasks(l);

    // Como en `reorderLists`, el array no se reordena: se reescriben las posiciones y
    // quien manda es `position`. Dentro de cada grupo manda la posición original.
    expect(l.tasks.map((t) => t.id)).toEqual(['c1', 'p1', 'c2', 'p2']);
    expect(l.tasks.map((t) => t.position)).toEqual([2, 1, 3, 0]);
    // El orden de dibujo sí es el correcto: pendientes primero, después completadas.
    expect([...pendingTasks(l), ...completedTasks(l)].map((t) => t.id)).toEqual([
      'p2',
      'p1',
      'c1',
      'c2'
    ]);
  });

  it('setTaskPositions renumera por el orden del array, sin agrupar', () => {
    const l = lista('l1', [
      tarea('c1', { position: 9, completed: true }),
      tarea('p1', { position: 4 })
    ]);

    setTaskPositions(l);

    // No separa por estado: es justamente lo que hace el arrastre.
    expect(l.tasks.map((t) => t.id)).toEqual(['c1', 'p1']);
    expect(l.tasks.map((t) => t.position)).toEqual([0, 1]);
  });
});

describe('board-task-rules: editar el texto de una tarea', () => {
  it('aplica el texto recortado', () => {
    const l = lista('l1');
    const t = tarea('a', { text: 'Viejo' });

    expect(editTaskText(l, t, '  Nuevo texto  ')).toBe(true);
    expect(t.text).toBe('Nuevo texto');
  });

  it('un texto que se queda vacío no se aplica (hay que cancelar)', () => {
    const l = lista('l1');
    const t = tarea('a', { text: 'Viejo' });

    expect(editTaskText(l, t, '   ')).toBe(false);
    expect(t.text).toBe('Viejo');
  });

  it('a diferencia del título de lista, NO colapsa los espacios internos', () => {
    // `normalizeListTitle` colapsa y recorta; el texto de tarea solo se recorta por los
    // bordes. Aquí se fija esa asimetría tal y como se comporta hoy.
    const l = lista('l1');
    const t = tarea('a', { text: 'Viejo' });

    editTaskText(l, t, '  hola   mundo  ');

    expect(t.text).toBe('hola   mundo');
  });

  it('no recorta a 90 caracteres', () => {
    const l = lista('l1');
    const t = tarea('a');
    const largo = 'x'.repeat(200);

    editTaskText(l, t, largo);

    expect(t.text).toBe(largo);
  });

  it('editar el texto es una modificación de la lista: fija su updatedAt', () => {
    const l = lista('l1');
    const t = tarea('a', { text: 'Viejo' });

    expect(editTaskText(l, t, 'Nuevo', AHORA)).toBe(true);
    expect(l.updatedAt).toBe(AHORA);
  });

  it('un texto vacío no toca la fecha de la lista', () => {
    const l = lista('l1');
    const t = tarea('a', { text: 'Viejo' });

    expect(editTaskText(l, t, '   ', AHORA)).toBe(false);
    expect(l.updatedAt).toBeUndefined();
  });
});

describe('board-task-rules: vista previa de completadas', () => {
  it('el límite de la vista previa son 2', () => {
    expect(COMPLETED_PREVIEW_LIMIT).toBe(2);
  });

  it('con 0, 1 o 2 completadas se ven todas', () => {
    for (const cantidad of [0, 1, 2]) {
      const tasks = Array.from({ length: cantidad }, (_, i) =>
        tarea(`c${i}`, { completed: true, position: i })
      );
      const l = lista('l1', tasks);
      expect(visibleCompletedTasks(l, false), `cantidad ${cantidad}`).toEqual(completedTasks(l));
      expect(shouldShowCompletedToggle(l), `toggle ${cantidad}`).toBe(false);
    }
  });

  it('con 3 completadas se ven 2 y hay 1 oculta', () => {
    const l = lista('l1', [
      tarea('p', { position: 0 }),
      tarea('c0', { position: 1, completed: true }),
      tarea('c1', { position: 2, completed: true }),
      tarea('c2', { position: 3, completed: true })
    ]);

    const vista = visibleCompletedTasks(l, false);
    expect(vista.map((t) => t.id)).toEqual(['c0', 'c1']);
    expect(hiddenCompletedCount(l)).toBe(1);
    expect(shouldShowCompletedToggle(l)).toBe(true);
  });

  it('desplegada se ven todas', () => {
    const l = lista('l1', [
      tarea('c0', { position: 0, completed: true }),
      tarea('c1', { position: 1, completed: true }),
      tarea('c2', { position: 2, completed: true })
    ]);

    expect(visibleCompletedTasks(l, true).length).toBe(3);
    expect(visibleCompletedTasks(l, true).map((t) => t.id)).toEqual(['c0', 'c1', 'c2']);
  });

  it('las ocultas nunca son negativas', () => {
    const l = lista('l1', [tarea('c0', { position: 0, completed: true })]);
    expect(hiddenCompletedCount(l)).toBe(0);
  });
});

describe('board-task-rules: arrastrar tareas', () => {
  it('dentro de la misma lista se inserta antes de la tarea destino', () => {
    const board = tableroDe({
      l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 }), tarea('c', { position: 2 })]
    });

    expect(dropTask(board, { listId: 'l1', taskId: 'c' }, 'l1', 'a')).toBe(true);

    // Se agrupa (pendientes primero) y se inserta antes de 'a'.
    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(board.lists[0].tasks.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it('entre listas mueve la tarea y renumera las dos', () => {
    const board = tableroDe({
      l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 })],
      l2: [tarea('x', { position: 0 }), tarea('y', { position: 1 })]
    });

    expect(dropTask(board, { listId: 'l1', taskId: 'b' }, 'l2', 'y')).toBe(true);

    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['a']);
    expect(board.lists[1].tasks.map((t) => t.id)).toEqual(['x', 'b', 'y']);
    expect(board.lists[1].tasks.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it('a una lista vacía la deja con esa única tarea', () => {
    const board = tableroDe({ l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 })], l2: [] });

    expect(dropTask(board, { listId: 'l1', taskId: 'a' }, 'l2', 'no-importa')).toBe(true);

    // El destino no existe como tarea: con índice negativo cae al principio.
    expect(board.lists[1].tasks.map((t) => t.id)).toEqual(['a']);
    expect(board.lists[1].tasks.map((t) => t.position)).toEqual([0]);
    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('soltar la tarea sobre sí misma es un no-op', () => {
    const board = tableroDe({ l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 })] });

    expect(dropTask(board, { listId: 'l1', taskId: 'a' }, 'l1', 'a')).toBe(false);
    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('una lista origen que no existe no cambia nada', () => {
    const board = tableroDe({ l1: [tarea('a', { position: 0 })] });

    expect(dropTask(board, { listId: 'desaparecida', taskId: 'a' }, 'l1', 'a')).toBe(false);
    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('una lista destino que no existe no cambia nada', () => {
    const board = tableroDe({ l1: [tarea('a', { position: 0 })] });

    expect(dropTask(board, { listId: 'l1', taskId: 'a' }, 'tampoco', 'a')).toBe(false);
    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('soltar en la lista (no sobre otra tarea) la manda al final', () => {
    const board = tableroDe({
      l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 })],
      l2: [tarea('x', { position: 0 })]
    });

    expect(dropTaskInList(board, { listId: 'l1', taskId: 'a' }, 'l2')).toBe(true);

    expect(board.lists[1].tasks.map((t) => t.id)).toEqual(['x', 'a']);
    expect(board.lists[1].tasks.map((t) => t.position)).toEqual([0, 1]);
    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('soltar en la misma lista la deja donde estaba (al final)', () => {
    const board = tableroDe({ l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 })] });

    expect(dropTaskInList(board, { listId: 'l1', taskId: 'a' }, 'l1')).toBe(true);

    // Se agrupa (ya estaba agrupada), se saca y se vuelve a poner al final.
    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['b', 'a']);
  });

  /**
   * Reordenar dentro de la lista es una modificación de esa lista.
   */
  it('reordenar dentro de la misma lista fija su updatedAt', () => {
    const board = tableroDe({ l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 })] });

    expect(dropTask(board, { listId: 'l1', taskId: 'a' }, 'l1', 'b', AHORA)).toBe(true);
    expect(board.lists[0].updatedAt).toBe(AHORA);
  });

  it('soltar en la misma lista (al final) también es una modificación', () => {
    const board = tableroDe({ l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 })] });

    expect(dropTaskInList(board, { listId: 'l1', taskId: 'a' }, 'l1', AHORA)).toBe(true);
    expect(board.lists[0].updatedAt).toBe(AHORA);
  });

  /**
   * Mover una tarea entre listas modifica las dos: origen y destino comparten la MISMA fecha
   * (se crea una sola vez por acción).
   */
  it('mover una tarea a otra lista fija la misma fecha en origen y destino', () => {
    const board = tableroDe({
      l1: [tarea('a', { position: 0 }), tarea('b', { position: 1 })],
      l2: [tarea('x', { position: 0 })]
    });

    expect(dropTaskInList(board, { listId: 'l1', taskId: 'b' }, 'l2', AHORA)).toBe(true);

    expect(board.lists[0].updatedAt).toBe(AHORA);
    expect(board.lists[1].updatedAt).toBe(AHORA);
  });

  it('un arrastre que no mueve nada no toca ninguna fecha', () => {
    const board = tableroDe({ l1: [tarea('a', { position: 0 })] });

    expect(dropTask(board, { listId: 'l1', taskId: 'a' }, 'l1', 'a', AHORA)).toBe(false);
    expect(dropTask(board, { listId: 'desaparecida', taskId: 'a' }, 'l1', 'a', AHORA)).toBe(false);
    expect(board.lists[0].updatedAt).toBeUndefined();
  });

  /**
   * BUG-08: al insertar en el índice crudo de destino, una tarea completada soltada
   * entre pendientes queda DELANTE en el arreglo. Lo comprueba este caso.
   */
  it('una completada soltada sobre pendientes queda delante en el array (BUG-08)', () => {
    const board = tableroDe({
      l1: [tarea('p1', { position: 0 }), tarea('p2', { position: 1 })],
      l2: [tarea('hecha', { position: 0, completed: true })]
    });

    dropTask(board, { listId: 'l2', taskId: 'hecha' }, 'l1', 'p2');

    // El array queda con la completada entre pendientes: NO se respeta la agrupación
    // que sí mantiene `reorderTasks`.
    expect(board.lists[0].tasks.map((t) => t.id)).toEqual(['p1', 'hecha', 'p2']);
    expect(board.lists[0].tasks.map((t) => t.completed)).toEqual([false, true, false]);

    // PERO el efecto visual es nulo: la plantilla dibuja primero las pendientes y
    // después las completadas, cada grupo por su `position`. Con las posiciones
    // recién escritas, la completada cae en su grupo. Lo comprobamos:
    expect(pendingTasks(board.lists[0]).map((t) => t.id)).toEqual(['p1', 'p2']);
    expect(completedTasks(board.lists[0]).map((t) => t.id)).toEqual(['hecha']);
  });
});

describe('board-task-rules: resaltado de la búsqueda', () => {
  it('sin búsqueda devuelve el título entero sin resaltar', () => {
    expect(getHighlightedSegments('Comprar pan', '')).toEqual([
      { text: 'Comprar pan', highlight: false }
    ]);
    expect(getHighlightedSegments('Comprar pan', '   ')).toEqual([
      { text: 'Comprar pan', highlight: false }
    ]);
  });

  it('resalta una coincidencia en medio', () => {
    expect(getHighlightedSegments('Comprar pan', 'prar')).toEqual([
      { text: 'Com', highlight: false },
      { text: 'prar', highlight: true },
      { text: ' pan', highlight: false }
    ]);
  });

  it('resalta al inicio y al final', () => {
    expect(getHighlightedSegments('Comprar pan', 'Comprar')).toEqual([
      { text: 'Comprar', highlight: true },
      { text: ' pan', highlight: false }
    ]);
    expect(getHighlightedSegments('Comprar pan', 'pan')).toEqual([
      { text: 'Comprar ', highlight: false },
      { text: 'pan', highlight: true }
    ]);
  });

  it('resalta todas las coincidencias y conserva las mayúsculas', () => {
    expect(getHighlightedSegments('Pan pancito pan', 'PAN')).toEqual([
      { text: 'Pan', highlight: true },
      { text: ' ', highlight: false },
      { text: 'pan', highlight: true },
      { text: 'cito ', highlight: false },
      { text: 'pan', highlight: true }
    ]);
  });

  it('sin coincidencias devuelve el título sin resaltar', () => {
    expect(getHighlightedSegments('Comprar pan', 'leche')).toEqual([
      { text: 'Comprar pan', highlight: false }
    ]);
  });

  it('una búsqueda más larga que el título no rompe', () => {
    expect(getHighlightedSegments('pan', 'panaderia')).toEqual([
      { text: 'pan', highlight: false }
    ]);
  });

  it('con emoji en el título el resalte cae en su sitio', () => {
    // El emoji ocupa 2 unidades UTF-16, igual que su medida en `query.length`.
    const segmentos = getHighlightedSegments('Fiesta 🎉 hoy', '🎉');
    expect(segmentos).toEqual([
      { text: 'Fiesta ', highlight: false },
      { text: '🎉', highlight: true },
      { text: ' hoy', highlight: false }
    ]);
  });

  /**
   * BUG-06: el resalte se recorta con `query.length` (unidades UTF-16) pero busca sobre
   * el título pasado a minúsculas. Con caracteres cuyo minúscula mide distinto los índices
   * se desalinean y el resalte cae en el sitio equivocado.
   */
  it('con una minúscula de otra longitud el resalte se desalinea (BUG-06)', () => {
    // 'İ' (U+0130) baja a 'i̇': 1 unidad UTF-16 -> 2. Cuatro caracteres -> cinco.
    const segmentos = getHighlightedSegments('İMAR', 'mar');
    // Busca en 'i̇mar', donde 'mar' empieza en el índice 2; pero al recortar sobre
    // 'İMAR' (que mide 4) coge 'AR' en vez de 'MAR'.
    expect(segmentos).toEqual([
      { text: 'İM', highlight: false },
      { text: 'AR', highlight: true }
    ]);
    // Resalta 'AR' cuando la búsqueda era 'mar': se ha comido la 'M'.
    expect(segmentos[1].text).not.toBe('MAR');
  });
});
