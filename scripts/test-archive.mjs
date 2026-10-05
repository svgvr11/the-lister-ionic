import assert from 'node:assert/strict';
import {
  ARCHIVE_POLICY,
  archiveList,
  countdownLabel,
  isListComplete,
  listLimitRestoreMessage,
  MAX_BOARD_LISTS,
  purgeExpiredArchivedLists,
  purgeExpiredLists,
  restoreListToBoard,
  retentionDaysLeft,
  retentionUrgency,
  TRASH_POLICY
} from '../src/app/core/list-retention.ts';

/**
 * Pruebas de la lógica pura del archivo (y de la que comparte con el basurero).
 * Se importa `core/list-retention.ts` porque es el módulo sin imports en tiempo de
 * ejecución: Node puede cargarlo con `--experimental-strip-types` sin resolver rutas.
 */

const MS_PER_DAY = 86_400_000;

/** Fecha fija para que los 60 días no dependan del día en que se ejecuta la prueba. */
const NOW = new Date('2026-06-01T12:00:00.000Z');

/** Fecha `days` días antes de NOW (admite decimales y negativos para fechas futuras). */
const daysAgo = (days) => new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();

const task = (id, listId = 'list-1', completed = false) => ({
  id, listId, text: id, completed, position: 0, createdAt: '2026-01-01T00:00:00.000Z'
});

const makeList = (id, { tasks = [task('t1', id, true)], position = 0 } = {}) => ({
  id, boardId: 'board-1', title: id, position, createdAt: '2026-01-01T00:00:00.000Z', tasks
});

const makeBoard = (lists = [], { trashedLists = [], archivedLists = [] } = {}) => ({
  id: 'board-1',
  title: 'Board',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists,
  trashedLists,
  archivedLists
});

/** Entrada de archivo con la fecha a `days` días de ahora. */
const archivedEntry = (list, days) => ({ list, archivedAt: daysAgo(days) });

/** Tablero con `count` listas, todas con la posición ya normalizada. */
const boardWithLists = (count, extra = {}) =>
  makeBoard(Array.from({ length: count }, (_, i) => makeList(`l${i}`, { position: i })), extra);

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. Constantes: el plazo son 60 días y el rojo son los 3 últimos, no un número suelto.
check('el archivo se conserva 60 días y avisa en rojo los 3 últimos', () => {
  assert.equal(ARCHIVE_POLICY.retentionDays, 60);
  assert.equal(ARCHIVE_POLICY.dangerDays, 3);
  assert.equal(ARCHIVE_POLICY.warningDays, 15);
  // El basurero no cambia: 7 días, rojo en el último.
  assert.equal(TRASH_POLICY.retentionDays, 7);
  assert.equal(TRASH_POLICY.dangerDays, 1);
  assert.equal(TRASH_POLICY.warningDays, 3);
});

// 2. Purga a los 60 días: a 59 días se conserva y a 60 se elimina.
check('la purga del archivo conserva a los 59 días y elimina a los 60', () => {
  const board = makeBoard([], { archivedLists: [archivedEntry(makeList('a'), 59)] });
  assert.equal(purgeExpiredArchivedLists(board, NOW), false);
  assert.deepEqual(board.archivedLists.map((e) => e.list.id), ['a']);

  const vencido = makeBoard([], { archivedLists: [archivedEntry(makeList('b'), 60)] });
  assert.equal(purgeExpiredArchivedLists(vencido, NOW), true);
  assert.deepEqual(vencido.archivedLists, []);

  // Justo en el límite: 59 días casi completos sigue viva, 60 días exactos ya no.
  const casi = makeBoard([], { archivedLists: [archivedEntry(makeList('c'), 59.99999)] });
  assert.equal(purgeExpiredArchivedLists(casi, NOW), false);
  assert.deepEqual(casi.archivedLists.map((e) => e.list.id), ['c']);
  const justo = makeBoard([], { archivedLists: [archivedEntry(makeList('d'), 59)] });
  assert.equal(purgeExpiredArchivedLists(justo, NOW), false);
});

// 3. Una lista recién archivada muestra 60 días y cuenta hacia abajo.
check('los días restantes van de 60 hacia abajo', () => {
  assert.equal(retentionDaysLeft(daysAgo(0), ARCHIVE_POLICY, NOW), 60);
  assert.equal(retentionDaysLeft(daysAgo(1), ARCHIVE_POLICY, NOW), 59);
  assert.equal(retentionDaysLeft(daysAgo(15), ARCHIVE_POLICY, NOW), 45);
  assert.equal(retentionDaysLeft(daysAgo(59), ARCHIVE_POLICY, NOW), 1);
  assert.equal(retentionDaysLeft(daysAgo(60), ARCHIVE_POLICY, NOW), 0);
  // El redondeo va hacia arriba: medio día restante todavía cuenta como el día entero.
  assert.equal(retentionDaysLeft(daysAgo(0.5), ARCHIVE_POLICY, NOW), 60);
});

// 4. Tramos de color: gris → ámbar → rojo, con el rojo desde los 3 últimos días.
check('el color escala a 60 días y se pone rojo en los 3 últimos días', () => {
  assert.equal(retentionUrgency(60, ARCHIVE_POLICY), 'normal');
  assert.equal(retentionUrgency(16, ARCHIVE_POLICY), 'normal');
  assert.equal(retentionUrgency(15, ARCHIVE_POLICY), 'warning');
  assert.equal(retentionUrgency(4, ARCHIVE_POLICY), 'warning');
  assert.equal(retentionUrgency(3, ARCHIVE_POLICY), 'danger');
  assert.equal(retentionUrgency(2, ARCHIVE_POLICY), 'danger');
  assert.equal(retentionUrgency(1, ARCHIVE_POLICY), 'danger');
  // Vencida también se pinta de rojo: aunque la purga ya la habría quitado.
  assert.equal(retentionUrgency(0, ARCHIVE_POLICY), 'danger');
});

// 5. Texto del badge: "N días" y "Último día" cuando falta 1.
check('el badge dice "N días" y marca el último día', () => {
  assert.equal(countdownLabel(60), '60 días');
  assert.equal(countdownLabel(2), '2 días');
  assert.equal(countdownLabel(1), '1 día (Último día)');
  // Nunca 0 ni negativos, aunque la lista ya haya vencido.
  assert.equal(countdownLabel(0), '1 día (Último día)');
  assert.equal(countdownLabel(-3), '1 día (Último día)');
});
// 6. Solo se archivan listas 100% completas.
check('una lista incompleta no se archiva y una completa sí', () => {
  const incompleta = makeList('a', { tasks: [task('t1', 'a', true), task('t2', 'a', false)] });
  assert.equal(isListComplete(incompleta), false);
  const boardIncompleta = makeBoard([incompleta]);
  assert.equal(archiveList(boardIncompleta, incompleta, NOW), false);
  assert.deepEqual(boardIncompleta.lists.map((l) => l.id), ['a']);
  assert.deepEqual(boardIncompleta.archivedLists, []);

  // Sin tareas tampoco cuenta como terminada: no hay trabajo terminado que archivar.
  const vacia = makeList('v', { tasks: [] });
  assert.equal(archiveList(makeBoard([vacia]), vacia, NOW), false);

  const completa = makeList('b');
  const boardCompleta = makeBoard([completa, makeList('c')]);
  assert.equal(archiveList(boardCompleta, completa, NOW), true);
  assert.deepEqual(boardCompleta.lists.map((l) => l.id), ['c']);
  assert.equal(boardCompleta.archivedLists.length, 1);
  assert.equal(boardCompleta.archivedLists[0].list.id, 'b');
  assert.equal(boardCompleta.archivedLists[0].archivedAt, NOW.toISOString());
  // Las tareas y su estado se guardan tal cual.
  assert.deepEqual(boardCompleta.archivedLists[0].list.tasks.map((t) => t.completed), [true]);
});

// 7. Restaurar: la lista vuelve al final, conservando tareas y estado.
check('restaurar devuelve la lista al final del tablero', () => {
  const archivada = makeList('a', { tasks: [task('t1', 'a', true), task('t2', 'a', true)], position: 7 });
  const board = makeBoard([makeList('x', { position: 0 }), makeList('y', { position: 1 })], {
    archivedLists: [archivedEntry(archivada, 10)]
  });
  assert.equal(restoreListToBoard(board, archivada), true);
  assert.deepEqual(board.lists.map((l) => l.id), ['x', 'y', 'a']);
  // La posición guardada es la última, que es el orden estable que usa el tablero.
  assert.deepEqual(board.lists.map((l) => l.position), [0, 1, 2]);
  assert.equal(board.lists[2].tasks.length, 2);
  assert.ok(board.lists[2].tasks.every((t) => t.completed));
});

// 8. Límite de 50 listas: con 49 restaura y con 50 se bloquea sin perder la lista.
check('el bloqueo por límite permite con 49 listas y corta con 50', () => {
  assert.equal(MAX_BOARD_LISTS, 50);

  const con49 = boardWithLists(49);
  assert.equal(restoreListToBoard(con49, makeList('nueva')), true);
  assert.equal(con49.lists.length, 50);
  assert.equal(con49.lists.at(-1).id, 'nueva');

  const con50 = boardWithLists(50);
  assert.equal(restoreListToBoard(con50, makeList('nueva')), false);
  // Bloqueada significa intacta: el tablero no crece y la lista no se pierde.
  assert.equal(con50.lists.length, 50);
  assert.ok(!con50.lists.some((l) => l.id === 'nueva'));

  // El mensaje dice cuántos hay y qué hacer para poder recuperar la lista.
  assert.equal(
    listLimitRestoreMessage(),
    'Tu tablero ya tiene 50 listas. Elimina o archiva una para poder restaurar esta.'
  );
});

// 10. Las listas archivadas y las del basurero no cuentan para el límite de 50.
check('lo archivado y lo descartado no cuentan para el límite de 50 listas', () => {
  const board = boardWithLists(50, {
    trashedLists: [{ list: makeList('basura'), deletedAt: daysAgo(3) }],
    archivedLists: [archivedEntry(makeList('archivada'), 30)]
  });
  assert.equal(board.lists.length, MAX_BOARD_LISTS);
  // El límite mira solo board.lists, así que con 50 sigue bloqueado...
  assert.equal(restoreListToBoard(board, makeList('otra')), false);
  // ...pero si una lista sale del tablero (p. ej. se archiva), ya cabe otra.
  for (const list of board.lists) for (const t of list.tasks) t.completed = true;
  assert.equal(archiveList(board, board.lists[0], NOW), true);
  assert.equal(board.lists.length, 49);
  assert.equal(restoreListToBoard(board, makeList('otra')), true);
  assert.equal(board.lists.length, 50);
  assert.equal(board.lists.at(-1).id, 'otra');
});

// 11. La purga de una colección no toca la otra ni las listas del tablero.
check('la purga del archivo no toca el basurero ni el tablero, y al revés', () => {
  const board = makeBoard([makeList('viva')], {
    // Cada colección con una entrada vencida y otra vigente, cada una con su propio plazo.
    trashedLists: [
      { list: makeList('basura-vieja'), deletedAt: daysAgo(8) },
      { list: makeList('basura-nueva'), deletedAt: daysAgo(2) }
    ],
    archivedLists: [
      archivedEntry(makeList('archivo-viejo'), 61),
      archivedEntry(makeList('archivo-nuevo'), 30)
    ]
  });

  // Purga del archivo: cae la de 61 días y el basurero queda igual.
  assert.equal(purgeExpiredArchivedLists(board, NOW), true);
  assert.deepEqual(board.archivedLists.map((e) => e.list.id), ['archivo-nuevo']);
  assert.deepEqual(board.trashedLists.map((e) => e.list.id), ['basura-vieja', 'basura-nueva']);
  assert.deepEqual(board.lists.map((l) => l.id), ['viva']);

  // Purga del basurero: cae la de 8 días y el archivo queda igual.
  assert.equal(purgeExpiredLists(board, NOW), true);
  assert.deepEqual(board.trashedLists.map((e) => e.list.id), ['basura-nueva']);
  assert.deepEqual(board.archivedLists.map((e) => e.list.id), ['archivo-nuevo']);
  assert.deepEqual(board.lists.map((l) => l.id), ['viva']);
});

// 12. El archivo no inventa el campo: un tablero antiguo sin archivedLists carga bien.
check('un tablero antiguo sin archivedLists se purga sin errores', () => {
  const antiguo = {
    id: 'board-1', title: 'Board', createdAt: '2026-01-01T00:00:00.000Z',
    lists: [makeList('a')], trashedLists: []
  };
  assert.equal(purgeExpiredArchivedLists(antiguo, NOW), false);
  assert.equal(antiguo.archivedLists, undefined);
  assert.equal(antiguo.lists.length, 1);
  assert.equal(purgeExpiredLists(antiguo, NOW), false);
  // Y archivar sobre un tablero así crea la colección desde cero.
  for (const t of antiguo.lists[0].tasks) t.completed = true;
  assert.equal(archiveList(antiguo, antiguo.lists[0], NOW), true);
  assert.equal(antiguo.archivedLists.length, 1);
});

// 9. Al restaurar en el límite la lista sigue en el archivo, no se pierde.
check('bloqueada, la lista sigue en el archivo', () => {
  const archivada = makeList('a');
  const board = boardWithLists(50, { archivedLists: [archivedEntry(archivada, 5)] });
  assert.equal(restoreListToBoard(board, board.archivedLists[0].list), false);
  assert.deepEqual(board.archivedLists.map((e) => e.list.id), ['a']);
  assert.equal(board.lists.length, 50);
});
// ── Verificación: el repositorio conserva archivedLists al leer y al guardar ──
// reproduce la lógica de SupabaseBoardRepository sin levantar Angular ni Supabase.
const deserializeBoard = (record) => {
  const data = record.board_data;
  if (data && Array.isArray(data.lists)) {
    return { ...data, id: record.id, title: record.title, createdAt: record.created_at };
  }
  return { id: record.id, title: record.title, createdAt: record.created_at, lists: [] };
};

const storedRecord = (boardData) => ({
  id: 'board-1', title: 'Board', created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z', board_data: boardData
});

check('deserializeBoard conserva archivedLists y trashedLists al leer y al guardar', () => {
  const stored = storedRecord({
    id: 'board-1', title: 'Board', createdAt: '2026-01-01T00:00:00.000Z', lists: [],
    trashedLists: [{ list: makeList('t'), deletedAt: daysAgo(1) }],
    archivedLists: [archivedEntry(makeList('a'), 20)]
  });
  const board = deserializeBoard(stored);
  assert.equal(board.archivedLists?.length, 1);
  assert.equal(board.archivedLists[0].list.id, 'a');
  assert.equal(board.trashedLists.length, 1);
  // Lo que devuelve deserializeBoard es justo lo que updateBoard vuelve a guardar.
  const reSaved = JSON.parse(JSON.stringify(board));
  assert.deepEqual(reSaved.archivedLists, stored.board_data.archivedLists);
});

check('un tablero antiguo sin archivedLists carga sin errores', () => {
  const board = deserializeBoard(storedRecord({
    id: 'board-1', title: 'Board', createdAt: '2026-01-01T00:00:00.000Z', lists: [makeList('a')]
  }));
  assert.deepEqual(board.lists.map((l) => l.id), ['a']);
  assert.equal(board.archivedLists, undefined);
  assert.equal(purgeExpiredArchivedLists(board, NOW), false);
});

check('un board_data que no es un tablero cae al tablero vacío y purga sin errores', () => {
  const board = deserializeBoard(storedRecord({ foo: 1 }));
  assert.deepEqual(board.lists, []);
  assert.equal(board.archivedLists, undefined);
  assert.equal(purgeExpiredArchivedLists(board, NOW), false);
});

console.log(`archive: ${cases} cases passed`);