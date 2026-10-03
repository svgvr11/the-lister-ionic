import assert from 'node:assert/strict';
import {
  computeDisplayOrder,
  createSessionOrder,
  reconcileSessionOrder,
  shuffleIds
} from '../src/app/core/session-order.ts';

const lists = (...ids) => ids.map((id) => ({ id }));

/** Barajado determinista: el mismo rng da el mismo orden, y uno distinto, otro orden. */
const constantRng = (value) => () => value;
const sequentialRng = (values) => {
  let index = 0;
  return () => values[index++ % values.length];
};

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. La pinneada siempre primera, con cualquier barajado.
check('la lista pinneada va siempre primera', () => {
  const board = lists('a', 'b', 'c', 'd', 'e');
  for (const rng of [constantRng(0), constantRng(0.5), sequentialRng([0.1, 0.9, 0.3, 0.7])]) {
    const sessionOrder = createSessionOrder(board, 'c', rng);
    const { order } = computeDisplayOrder(board, 'c', sessionOrder);
    assert.equal(order[0], 'c');
    assert.deepEqual([...order].sort(), ['a', 'b', 'c', 'd', 'e']);
  }
});

// 2. Recalcular con el mismo sessionOrder no cambia el orden (guardar, refrescar, buscar...).
check('el orden no cambia al recalcular con el mismo sessionOrder', () => {
  const board = lists('a', 'b', 'c', 'd');
  const sessionOrder = createSessionOrder(board, 'b', sequentialRng([0.9, 0.1, 0.5]));
  const first = computeDisplayOrder(board, 'b', sessionOrder).order;
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(computeDisplayOrder(board, 'b', sessionOrder).order, first);
    // reconcile es idempotente: sincronizar otra vez el mismo tablero no reordena.
    assert.deepEqual(reconcileSessionOrder(board, sessionOrder), sessionOrder);
  }
});

// 3. Una lista nueva (creada aquí o llegada por sync) entra al final.
check('una lista nueva va al final, y varias en orden de creación', () => {
  const board = lists('a', 'b', 'c');
  const sessionOrder = createSessionOrder(board, null, constantRng(0));
  const withOne = lists('a', 'b', 'c', 'd');
  const order = computeDisplayOrder(withOne, null, reconcileSessionOrder(withOne, sessionOrder)).order;
  assert.deepEqual(order, [...computeDisplayOrder(board, null, sessionOrder).order, 'd']);
  const withTwo = lists('a', 'b', 'c', 'd', 'e');
  const orderTwo = computeDisplayOrder(withTwo, null, reconcileSessionOrder(withTwo, sessionOrder)).order;
  assert.deepEqual(orderTwo.slice(-2), ['d', 'e']);
});

// 4. Una lista que desaparece (basurero, borrada en otro dispositivo) sale del orden.
check('una lista eliminada sale del orden y no desaparece ninguna otra', () => {
  const board = lists('a', 'b', 'c', 'd');
  const sessionOrder = createSessionOrder(board, null, constantRng(0.42));
  const afterTrash = lists('a', 'c', 'd');
  const { order } = computeDisplayOrder(afterTrash, null, reconcileSessionOrder(afterTrash, sessionOrder));
  assert.ok(!order.includes('b'));
  assert.deepEqual([...order].sort(), ['a', 'c', 'd']);
});

// 5. Cambio de pin: la nueva sube y la anterior conserva su hueco.
check('al cambiar el pin la nueva sube y la anterior vuelve a su sitio', () => {
  const board = lists('a', 'b', 'c', 'd');
  const sessionOrder = createSessionOrder(board, null, sequentialRng([0.25, 0.75, 0.5]));
  const sinPin = computeDisplayOrder(board, null, sessionOrder).order;
  const npin = computeDisplayOrder(board, 'c', sessionOrder).order;
  assert.equal(npin[0], 'c');
  // La lista que estaba antes donde ahora está la nueva conserva su lugar relativo.
  assert.deepEqual(npin, ['c', ...sinPin.filter((id) => id !== 'c')]);

  const conPinA = computeDisplayOrder(board, 'a', sessionOrder).order;
  assert.equal(conPinA[0], 'a');
  assert.deepEqual(conPinA, ['a', ...sinPin.filter((id) => id !== 'a')]);

  // Y si la pinneada desaparece del tablero, el resto conserva su orden relativo.
  const sinB = lists('a', 'c', 'd');
  const { order } = computeDisplayOrder(sinB, null, reconcileSessionOrder(sinB, sessionOrder));
  assert.deepEqual(order, sinPin.filter((id) => id !== 'b'));
});

// 6. Todas las listas aparecen exactamente una vez, aunque sessionOrder venga sucio.
check('cada lista aparece exactamente una vez', () => {
  const board = lists('a', 'b', 'c', 'd');
  const sucio = ['d', 'd', 'x', 'b', 'a'];
  for (const pinnedId of [null, 'a', 'c', 'fantasma']) {
    const { order } = computeDisplayOrder(board, pinnedId, sucio);
    assert.deepEqual([...order].sort(), ['a', 'b', 'c', 'd']);
    assert.equal(new Set(order).size, board.length);
    if (['a', 'b', 'c', 'd'].includes(pinnedId)) assert.equal(order[0], pinnedId);
  }
  // Tableros con ids repetidos tampoco duplican tarjetas.
  assert.deepEqual(computeDisplayOrder(lists('a', 'a', 'b'), 'a', ['a', 'b']).order, ['a', 'b']);
});

// 7. Tablero vacío y tablero de una sola lista.
check('tablero vacío y de una sola lista', () => {
  assert.deepEqual(computeDisplayOrder([], null, []).order, []);
  assert.deepEqual(computeDisplayOrder([], 'a', ['a']).order, []);
  assert.deepEqual(createSessionOrder([], null, constantRng(0.5)), []);

  const one = lists('unica');
  assert.deepEqual(computeDisplayOrder(one, null, createSessionOrder(one, null, constantRng(0.5))).order, ['unica']);
  assert.deepEqual(computeDisplayOrder(one, 'unica', createSessionOrder(one, 'unica', constantRng(0.5))).order, ['unica']);
  // Sin pin guardado, una lista suelta sigue siendo la única de la rejilla.
  assert.deepEqual(computeDisplayOrder(one, null, []).order, ['unica']);
});

// 8. El barajado es una permutación: no pierde ni duplica ids y no muta la entrada.
check('el barajado es una permutacion y no muta la entrada', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const barajado = shuffleIds(ids, sequentialRng([0.7, 0.2, 0.9, 0.4, 0.1]));
  assert.deepEqual(ids, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual([...barajado].sort(), [...ids].sort());
  assert.equal(barajado.length, ids.length);
  assert.deepEqual(shuffleIds([]), []);
  assert.deepEqual(shuffleIds(['solo'], () => 1), ['solo']);
});

// 9. Dos sesiones distintas barajan distinto, y ninguna de las dos pierde listas.
check('dos sesiones distintas muestran un orden distinto', () => {
  const board = lists('a', 'b', 'c', 'd', 'e', 'f');
  const pinned = 'a';
  const sesionA = computeDisplayOrder(board, pinned, createSessionOrder(board, pinned, constantRng(0))).order;
  const sesionB = computeDisplayOrder(board, pinned, createSessionOrder(board, pinned, constantRng(0.999999))).order;
  assert.notDeepEqual(sesionA, sesionB);
  for (const orden of [sesionA, sesionB]) {
    assert.equal(orden[0], pinned);
    assert.deepEqual([...orden].sort(), board.map((list) => list.id).sort());
  }
});

console.log(`session-order: ${cases} cases passed`);
