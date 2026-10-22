import { describe, expect, it } from 'vitest';
import {
  RAZON_CONFLICTO_LOCAL,
  boardsEqual,
  decideIncomingBoard,
  decidePendingAfterSave,
  decidePendingBeforeSave,
  pideDobleConfirmacion,
  razonConflictoPorError,
  tableroRemotoParaResolver
} from './board-conflict-rules';
import { canonicalBoardContentKey, OwnBoardSnapshots } from './board-sync';
import { BoardMergeConflictError } from './board-merge';
import type { BoardConflict } from './services/board.repository';
import type { ChecklistBoard, ChecklistList, ChecklistTask } from '../models/board.model';

/**
 * Pruebas del árbitro de conflictos del tablero.
 *
 * Se escribieron contra el comportamiento que ya tenía `BoardPage` (pruebas de
 * caracterización): fijan la regla tal y como es, para que al extraer la lógica nada
 * cambie sin que salte aquí.
 */

/** Tablero de prueba: solo los campos que `canonicalBoardContentKey` mira. */
const base: ChecklistBoard = {
  id: 'board-1',
  title: 'Mi tablero',
  createdAt: '2026-01-01T00:00:00.000Z',
  pinnedListId: null,
  lists: [
    {
      id: 'lista-1',
      boardId: 'board-1',
      title: 'Compra',
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      tasks: [
        {
          id: 'tarea-1',
          listId: 'lista-1',
          text: 'Leche',
          completed: false,
          position: 0,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }
  ],
  trashedLists: [],
  archivedLists: []
} as ChecklistBoard;

const lista = (id: string): ChecklistList => ({
  id,
  boardId: base.id,
  title: id,
  position: base.lists.length,
  createdAt: '2026-01-02T00:00:00.000Z',
  tasks: []
});

const tarea = (id: string, text: string): ChecklistTask => ({
  id,
  listId: 'lista-1',
  text,
  completed: false,
  position: 1,
  createdAt: '2026-01-02T00:00:00.000Z'
});

/** Tablero con una lista más (una adición, que sí es fusionable). */
const conListaMas = (): ChecklistBoard => ({
  ...structuredClone(base),
  lists: [...structuredClone(base.lists), lista('lista-nueva')]
});

/** Tablero con una tarea más en la lista existente. */
const conTareaMas = (): ChecklistBoard => {
  const clon = structuredClone(base);
  clon.lists[0].tasks = [...clon.lists[0].tasks, tarea('tarea-nueva', 'Pan')];
  return clon;
};

/** Tablero con la MISMA tarea editada (no es una adición: no se puede fusionar). */
const conTareaEditada = (): ChecklistBoard => {
  const clon = structuredClone(base);
  clon.lists[0].tasks[0].text = 'Leche entera';
  return clon;
};

/** Estado base para las decisiones: sin eco, sin interacción, sin conflicto. */
const estadoLibre = {
  esEcoPropio: false,
  interaccionActiva: false,
  hayConflicto: false,
};

describe('board-conflict-rules: tablero entrante', () => {
  it('el eco de un guardado propio se descarta', () => {
    expect(decideIncomingBoard(estadoLibre)).toBe('apply');
    expect(decideIncomingBoard({ ...estadoLibre, esEcoPropio: true })).toBe('ignore');
    // Aunque haya interacción: el eco propio nunca debe apartarse ni aplicarse.
    expect(
      decideIncomingBoard({ esEcoPropio: true, interaccionActiva: true, hayConflicto: true })
    ).toBe('ignore');
  });

  it('con interacción activa el tablero se aparta', () => {
    // Cada uno de estos estados es "el usuario está con las manos en la masa".
    for (const interaccionActiva of [true, false]) {
      expect(
        decideIncomingBoard({ ...estadoLibre, interaccionActiva }),
        `interaccion ${interaccionActiva}`
      ).toBe(interaccionActiva ? 'defer' : 'apply');
    }
  });

  it('con un conflicto ya abierto, el siguiente tablero también se aparta', () => {
    expect(decideIncomingBoard({ ...estadoLibre, hayConflicto: true })).toBe('defer');
  });

  it('con vía libre se aplica', () => {
    expect(decideIncomingBoard(estadoLibre)).toBe('apply');
  });
});

describe('board-conflict-rules: qué hacer antes de guardar', () => {
  it('sin remoto pendiente se guarda tal cual', () => {
    expect(decidePendingBeforeSave({ local: base, ultimoAplicado: base, pendienteRemoto: null })).toEqual({
      tipo: 'save'
    });
  });

  it('con pendiente y el local sin cambios, se adopta el remoto sin guardar', () => {
    const remoto = conListaMas();
    const decision = decidePendingBeforeSave({ local: base, ultimoAplicado: base, pendienteRemoto: remoto });

    // El usuario no había tocado nada: lo remoto es lo más nuevo, se adopta y no se gasta
    // un guardado. La página lo detecta porque devuelve 'adopt' en vez de 'save'.
    expect(decision).toEqual({ tipo: 'adopt', board: remoto });
  });

  it('con pendiente y cambios locales que son adiciones, se fusionan', () => {
    const local = conTareaMas();
    const remoto = conListaMas();
    const decision = decidePendingBeforeSave({
      local,
      ultimoAplicado: base,
      pendienteRemoto: remoto
    });

    expect(decision.tipo).toBe('merge');
    if (decision.tipo !== 'merge') return;
    // La fusión conserva las dos cosas: la tarea local y la lista remota.
    expect(decision.board.lists[0].tasks.map((t) => t.id)).toEqual(['tarea-1', 'tarea-nueva']);
    expect(decision.board.lists.map((l) => l.id)).toEqual(['lista-1', 'lista-nueva']);
    // Y no toca los originales: son copias nuevas.
    expect(decision.board).not.toBe(local);
    expect(decision.board).not.toBe(remoto);
  });

  it('con pendiente y la misma tarea editada en los dos sitios, es conflicto', () => {
    const decision = decidePendingBeforeSave({
      local: conTareaEditada(),
      ultimoAplicado: base,
      pendienteRemoto: { ...structuredClone(base), lists: [{ ...structuredClone(base.lists[0]), tasks: [{ ...base.lists[0].tasks[0], text: 'Leche desnatada' }] }] }
    });

    expect(decision.tipo).toBe('conflicto');
    if (decision.tipo !== 'conflicto') return;
    expect(decision.razon).toMatch(/No se pueden combinar estos cambios/);
  });

  it('un error sin mensaje da el texto genérico', () => {
    const decision = decidePendingBeforeSave({
      local: conTareaEditada(),
      ultimoAplicado: base,
      pendienteRemoto: conTareaEditada()
    });
    // `mergeBoardAdditions` lanza con mensaje, así que aquí se comprueba la rama del
    // genérico a través de la función que construye el texto.
    expect(razonConflictoPorError('algo raro')).toBe(RAZON_CONFLICTO_LOCAL);
    expect(razonConflictoPorError(new Error('detalle'))).toBe('No se pueden combinar estos cambios: detalle');
    expect(decision.tipo).toBe('conflicto');
  });

  it('sin último aplicado se fusiona contra el propio tablero local', () => {
    // Caso raro (aún no ha llegado nada de la nube): se compara contra el local.
    const decision = decidePendingBeforeSave({
      local: conTareaMas(),
      ultimoAplicado: null,
      pendienteRemoto: conListaMas()
    });
    expect(decision.tipo).toBe('merge');
  });
});

describe('board-conflict-rules: qué hacer después de guardar', () => {
  it('sin pendiente no se hace nada', () => {
    expect(
      decidePendingAfterSave({
        local: base,
        ultimoAplicado: base,
        pendienteRemoto: null,
        guardadoOk: true,
        interaccionActiva: false,
        hayConflicto: false
      })
    ).toEqual({ tipo: 'nada' });
  });

  it('guardado correcto con pendiente: se aplica el remoto', () => {
    const remoto = conListaMas();
    expect(
      decidePendingAfterSave({
        local: base,
        ultimoAplicado: base,
        pendienteRemoto: remoto,
        guardadoOk: true,
        interaccionActiva: false,
        hayConflicto: false
      })
    ).toEqual({ tipo: 'aplicar', board: remoto });
  });

  it('guardado FALLIDO con el local modificado: conflicto en vez de aplicar', () => {
    // Si se aplicara el remoto aquí, se perdería el trabajo que no se pudo guardar.
    const decision = decidePendingAfterSave({
      local: conTareaMas(),
      ultimoAplicado: base,
      pendienteRemoto: conListaMas(),
      guardadoOk: false,
      interaccionActiva: false,
      hayConflicto: false
    });

    expect(decision.tipo).toBe('conflicto');
    if (decision.tipo !== 'conflicto') return;
    expect(decision.razon).toBe(RAZON_CONFLICTO_LOCAL);
    expect(decision.board).toEqual(conListaMas()); // el remoto que estaba esperando
  });

  it('guardado fallido pero sin cambios locales: se aplica igual', () => {
    // No había nada local que perder, así que el remoto puede entrar.
    const remoto = conListaMas();
    expect(
      decidePendingAfterSave({
        local: base,
        ultimoAplicado: base,
        pendienteRemoto: remoto,
        guardadoOk: false,
        interaccionActiva: false,
        hayConflicto: false
      })
    ).toEqual({ tipo: 'aplicar', board: remoto });
  });

  it('con interacción activa o conflicto, el pendiente sigue esperando', () => {
    const comun = {
      local: base,
      ultimoAplicado: base,
      pendienteRemoto: conListaMas(),
      guardadoOk: true,
      interaccionActiva: false,
      hayConflicto: false
    };
    expect(decidePendingAfterSave({ ...comun, interaccionActiva: true })).toEqual({ tipo: 'nada' });
    expect(decidePendingAfterSave({ ...comun, hayConflicto: true })).toEqual({ tipo: 'nada' });
  });
});

describe('board-conflict-rules: resolver un conflicto', () => {
  const conflicto: BoardConflict = {
    localBoard: conTareaEditada(),
    remoteBoard: conListaMas(),
    remoteUpdatedAt: '2026-06-01T12:00:00.000Z',
    reason: 'motivo'
  };

  it("resolver con 'local' pide una segunda confirmación", () => {
    expect(pideDobleConfirmacion({ resolution: 'local', confirmandoLocal: false })).toBe(true);
    expect(pideDobleConfirmacion({ resolution: 'local', confirmandoLocal: true })).toBe(false);
  });

  it("resolver con 'remote' no pide nada", () => {
    expect(pideDobleConfirmacion({ resolution: 'remote', confirmandoLocal: false })).toBe(false);
    expect(pideDobleConfirmacion({ resolution: 'remote', confirmandoLocal: true })).toBe(false);
  });

  it("'remote' con pendiente aplica el pendiente, que es más reciente", () => {
    expect(tableroRemotoParaResolver(conflicto, conTareaMas())).toEqual(conTareaMas());
  });

  it("'remote' sin pendiente aplica el tablero del conflicto", () => {
    expect(tableroRemotoParaResolver(conflicto, null)).toEqual(conflicto.remoteBoard);
  });
});

describe('board-conflict-rules: boardsEqual y BUG-07', () => {
  it('dos tableros con el mismo contenido se consideran iguales', () => {
    expect(boardsEqual(base, structuredClone(base))).toBe(true);
  });

  it('un cambio de contenido los separa', () => {
    expect(boardsEqual(base, conListaMas())).toBe(false);
    expect(boardsEqual(base, conTareaMas())).toBe(false);
  });

  /**
   * BUG-07: `boardsEqual` compara el JSON tal cual, así que dos tableros con el MISMO
   * contenido pero con las claves en otro orden se ven como distintos.
   */
  it('el mismo contenido con las claves en otro orden se ve como distinto (BUG-07)', () => {
    // El remoto llega reconstruido por `mergeBoardAdditions` (`{...remote, lists: …}`),
    // que puede poner las claves en un orden distinto al del original.
    const reordenado: ChecklistBoard = {
      lists: structuredClone(base.lists),
      archivedLists: [],
      trashedLists: [],
      pinnedListId: null,
      createdAt: base.createdAt,
      title: base.title,
      id: base.id
    };
    expect(canonicalBoardContentKey(reordenado)).toBe(canonicalBoardContentKey(base));
    expect(boardsEqual(reordenado, base)).toBe(false);
  });
});

describe('board-conflict-rules: OwnBoardSnapshots y el eco propio', () => {
  it('el eco de un guardado propio se reconoce aunque venga con otro orden de claves', () => {
    const snapshots = new OwnBoardSnapshots();
    const token = snapshots.begin(base);
    snapshots.complete(token, true);

    // El eco llega del servidor: mismas claves, otro orden y metadatos de más.
    expect(snapshots.has(reordenar(base))).toBe(true);
  });

  it('un cambio remoto de verdad no se confunde con el eco', () => {
    const snapshots = new OwnBoardSnapshots();
    const token = snapshots.begin(base);
    snapshots.complete(token, true);

    expect(snapshots.has(conListaMas())).toBe(false);
  });

  it('un eco tardío de A no sustituye al guardado más reciente B', () => {
    const snapshots = new OwnBoardSnapshots();

    const tokenA = snapshots.begin(conTareaMas()); // primer guardado
    snapshots.complete(tokenA, true);
    const tokenB = snapshots.begin(conListaMas()); // guardado más reciente
    snapshots.complete(tokenB, true);

    // El eco de A llega tarde: se reconoce (se descarta), pero B sigue siendo el estado.
    expect(snapshots.has(conTareaMas())).toBe(true);
    expect(snapshots.has(conListaMas())).toBe(true);
  });

  it('un guardado que falló no se recuerda como eco', () => {
    const snapshots = new OwnBoardSnapshots();
    const token = snapshots.begin(conTareaMas());
    snapshots.complete(token, false);

    expect(snapshots.has(conTareaMas())).toBe(false);
  });
});

describe('board-conflict-rules: canonicalBoardContentKey y BUG-11', () => {
  it('los metadatos del servidor no cuentan como contenido', () => {
    const conMetadatos = {
      ...reordenar(base),
      updated_at: '2026-06-01T12:00:00.000Z',
      version: 7,
      serverVersion: 'row-1'
    };
    expect(canonicalBoardContentKey(conMetadatos)).toBe(canonicalBoardContentKey(base));
  });

  /**
   * BUG-11: `canonicalBoardContentKey` lista a mano los campos que mira. Un campo nuevo
   * del tablero que no esté en esa lista se cae de la comparación, así que un cambio
   * remoto de ESE campo se clasifica como eco propio y se descarta en silencio.
   */
  it('un campo nuevo fuera de la lista se ignora y parece un eco propio (BUG-11)', () => {
    const conCampoNuevo = { ...reordenar(base), campoFuturo: 'valor' };
    // Mismo contenido canónico: el servidor no vería diferencia.
    expect(canonicalBoardContentKey(conCampoNuevo)).toBe(canonicalBoardContentKey(base));

    // Y por tanto el guardia de eco propio se lo traga.
    const snapshots = new OwnBoardSnapshots();
    const token = snapshots.begin(base);
    snapshots.complete(token, true);
    expect(snapshots.has(conCampoNuevo)).toBe(true);
  });

  /**
   * Protección: si `ChecklistBoard` gana un campo, esta lista se queda desactualizada y
   * el test de abajo falla, obligando a añadirlo también en `board-sync.ts`.
   */
  it('los campos del tablero son exactamente los que mira la clave canónica', () => {
    const CAMPOS_ESPERADOS = [
      'id',
      'title',
      'createdAt',
      'lists',
      'pinnedListId',
      'trashedLists',
      'archivedLists'
    ];
    // Tablero con todos los campos del modelo, construido a mano.
    const tableroCompleto: ChecklistBoard = {
      id: 'b',
      title: 't',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: [],
      pinnedListId: null,
      trashedLists: [],
      archivedLists: []
    };
    expect(Object.keys(tableroCompleto).sort()).toEqual([...CAMPOS_ESPERADOS].sort());

    // Y cada uno de ellos cambia la clave canónica cuando cambia su valor.
    const variaciones: Record<string, () => unknown> = {
      id: () => ({ ...tableroCompleto, id: 'otro' }),
      title: () => ({ ...tableroCompleto, title: 'otro' }),
      createdAt: () => ({ ...tableroCompleto, createdAt: '2027-01-01T00:00:00.000Z' }),
      lists: () => ({ ...tableroCompleto, lists: [lista('x')] }),
      pinnedListId: () => ({ ...tableroCompleto, pinnedListId: 'x' }),
      trashedLists: () => ({
        ...tableroCompleto,
        trashedLists: [{ list: lista('x'), deletedAt: '2026-05-01T00:00:00.000Z' }]
      }),
      archivedLists: () => ({
        ...tableroCompleto,
        archivedLists: [{ list: lista('x'), archivedAt: '2026-05-01T00:00:00.000Z' }]
      })
    };
    for (const campo of CAMPOS_ESPERADOS) {
      expect(
        canonicalBoardContentKey(variaciones[campo]()),
        `el campo ${campo} debe cambiar la clave`
      ).not.toBe(canonicalBoardContentKey(tableroCompleto));
    }
  });

  it('la clave canónica no distingue el formato de una fecha equivalente', () => {
    // Mismo instante escrito de dos formas: es el mismo contenido.
    expect(canonicalBoardContentKey({ ...base, createdAt: '2026-01-01T01:00:00.000+01:00' })).toBe(
      canonicalBoardContentKey(base)
    );
  });

  /**
   * El `updatedAt` de la lista es metadato de sincronización: NO puede entrar en la clave
   * canónica. Si entrara, el eco de un guardado propio dejaría de reconocerse en cuanto el
   * merge escribe `max(local, remoto)` (que no coincide con ninguno de los dos) y se abrirían
   * conflictos inventados tras cada fusión.
   */
  it('el updatedAt de las listas no cuenta como contenido', () => {
    const otraFecha = structuredClone(base);
    otraFecha.lists = base.lists.map((list) => ({ ...list, updatedAt: '2026-06-01T12:00:00.000Z' }));
    expect(canonicalBoardContentKey(otraFecha)).toBe(canonicalBoardContentKey(base));

    // Y por tanto el guardia de eco propio se lo traga.
    const snapshots = new OwnBoardSnapshots();
    const token = snapshots.begin(base);
    snapshots.complete(token, true);
    expect(snapshots.has(otraFecha)).toBe(true);
  });
});

/** Mismo tablero con las claves en otro orden (como llega del servidor). */
function reordenar(board: ChecklistBoard): ChecklistBoard {
  return {
    lists: structuredClone(board.lists),
    archivedLists: board.archivedLists ?? [],
    trashedLists: board.trashedLists ?? [],
    pinnedListId: board.pinnedListId ?? null,
    createdAt: board.createdAt,
    title: board.title,
    id: board.id
  };
}
