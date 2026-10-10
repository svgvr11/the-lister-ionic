import { describe, expect, it } from 'vitest';
import {
  computeDisplayOrder,
  createSessionOrder,
  reconcileSessionOrder,
  shuffleIds
} from './session-order';
import type { OrderableList } from './session-order';

/**
 * Pruebas del orden de sesión de las listas. Migrado desde scripts/test-session-order.mjs.
 * El tablero se dibuja en un orden aleatorio distinto en cada sesión, con la pinneada primera.
 */

const lists = (...ids: string[]): OrderableList[] => ids.map((id) => ({ id }));

/** Barajado determinista: el mismo rng da el mismo orden, y uno distinto, otro orden. */
const constantRng = (value: number) => () => value;
const sequentialRng = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe('session-order: orden de dibujo', () => {
  it('la lista pinneada va siempre primera', () => {
    const board = lists('a', 'b', 'c', 'd', 'e');
    for (const rng of [constantRng(0), constantRng(0.5), sequentialRng([0.1, 0.9, 0.3, 0.7])]) {
      const sessionOrder = createSessionOrder(board, 'c', rng);
      const { order } = computeDisplayOrder(board, 'c', sessionOrder);
      expect(order[0]).toBe('c');
      expect([...order].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    }
  });

  it('el orden no cambia al recalcular con el mismo sessionOrder', () => {
    const board = lists('a', 'b', 'c', 'd');
    const sessionOrder = createSessionOrder(board, 'b', sequentialRng([0.9, 0.1, 0.5]));
    const first = computeDisplayOrder(board, 'b', sessionOrder).order;
    for (let i = 0; i < 5; i++) {
      expect(computeDisplayOrder(board, 'b', sessionOrder).order).toEqual(first);
      // reconcile es idempotente: sincronizar otra vez el mismo tablero no reordena.
      expect(reconcileSessionOrder(board, sessionOrder)).toEqual(sessionOrder);
    }
  });

  it('una lista nueva va al final, y varias en orden de creación', () => {
    const board = lists('a', 'b', 'c');
    const sessionOrder = createSessionOrder(board, null, constantRng(0));
    const withOne = lists('a', 'b', 'c', 'd');
    const order = computeDisplayOrder(
      withOne,
      null,
      reconcileSessionOrder(withOne, sessionOrder)
    ).order;
    expect(order).toEqual([...computeDisplayOrder(board, null, sessionOrder).order, 'd']);
    const withTwo = lists('a', 'b', 'c', 'd', 'e');
    const orderTwo = computeDisplayOrder(
      withTwo,
      null,
      reconcileSessionOrder(withTwo, sessionOrder)
    ).order;
    expect(orderTwo.slice(-2)).toEqual(['d', 'e']);
  });

  it('una lista eliminada sale del orden y no desaparece ninguna otra', () => {
    const board = lists('a', 'b', 'c', 'd');
    const sessionOrder = createSessionOrder(board, null, constantRng(0.42));
    const afterTrash = lists('a', 'c', 'd');
    const { order } = computeDisplayOrder(
      afterTrash,
      null,
      reconcileSessionOrder(afterTrash, sessionOrder)
    );
    expect(order.includes('b')).toBe(false);
    expect([...order].sort()).toEqual(['a', 'c', 'd']);
  });

  it('al cambiar el pin la nueva sube y la anterior vuelve a su sitio', () => {
    const board = lists('a', 'b', 'c', 'd');
    const sessionOrder = createSessionOrder(board, null, sequentialRng([0.25, 0.75, 0.5]));
    const sinPin = computeDisplayOrder(board, null, sessionOrder).order;
    const npin = computeDisplayOrder(board, 'c', sessionOrder).order;
    expect(npin[0]).toBe('c');
    // La lista que estaba antes donde ahora está la nueva conserva su lugar relativo.
    expect(npin).toEqual(['c', ...sinPin.filter((id) => id !== 'c')]);

    const conPinA = computeDisplayOrder(board, 'a', sessionOrder).order;
    expect(conPinA[0]).toBe('a');
    expect(conPinA).toEqual(['a', ...sinPin.filter((id) => id !== 'a')]);

    // Y si la pinneada desaparece del tablero, el resto conserva su orden relativo.
    const sinB = lists('a', 'c', 'd');
    const { order } = computeDisplayOrder(
      sinB,
      null,
      reconcileSessionOrder(sinB, sessionOrder)
    );
    expect(order).toEqual(sinPin.filter((id) => id !== 'b'));
  });
});

describe('session-order: cada lista aparece una vez', () => {
  it('cada lista aparece exactamente una vez', () => {
    const board = lists('a', 'b', 'c', 'd');
    const sucio = ['d', 'd', 'x', 'b', 'a'];
    for (const pinnedId of [null, 'a', 'c', 'fantasma']) {
      const { order } = computeDisplayOrder(board, pinnedId, sucio);
      expect([...order].sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(new Set(order).size).toBe(board.length);
      if (['a', 'b', 'c', 'd'].includes(pinnedId as string)) expect(order[0]).toBe(pinnedId);
    }
    // Tableros con ids repetidos tampoco duplican tarjetas.
    expect(computeDisplayOrder(lists('a', 'a', 'b'), 'a', ['a', 'b']).order).toEqual(['a', 'b']);
  });

  it('tablero vacío y de una sola lista', () => {
    expect(computeDisplayOrder([], null, []).order).toEqual([]);
    expect(computeDisplayOrder([], 'a', ['a']).order).toEqual([]);
    expect(createSessionOrder([], null, constantRng(0.5))).toEqual([]);

    const one = lists('unica');
    expect(
      computeDisplayOrder(one, null, createSessionOrder(one, null, constantRng(0.5))).order
    ).toEqual(['unica']);
    expect(
      computeDisplayOrder(one, 'unica', createSessionOrder(one, 'unica', constantRng(0.5))).order
    ).toEqual(['unica']);
    // Sin pin guardado, una lista suelta sigue siendo la única de la rejilla.
    expect(computeDisplayOrder(one, null, []).order).toEqual(['unica']);
  });
});

describe('session-order: barajado', () => {
  it('el barajado es una permutación y no muta la entrada', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const barajado = shuffleIds(ids, sequentialRng([0.7, 0.2, 0.9, 0.4, 0.1]));
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect([...barajado].sort()).toEqual([...ids].sort());
    expect(barajado.length).toBe(ids.length);
    expect(shuffleIds([])).toEqual([]);
    expect(shuffleIds(['solo'], () => 1)).toEqual(['solo']);
  });

  it('dos sesiones distintas muestran un orden distinto', () => {
    const board = lists('a', 'b', 'c', 'd', 'e', 'f');
    const pinned = 'a';
    const sesionA = computeDisplayOrder(
      board,
      pinned,
      createSessionOrder(board, pinned, constantRng(0))
    ).order;
    const sesionB = computeDisplayOrder(
      board,
      pinned,
      createSessionOrder(board, pinned, constantRng(0.999999))
    ).order;
    expect(sesionA).not.toEqual(sesionB);
    for (const orden of [sesionA, sesionB]) {
      expect(orden[0]).toBe(pinned);
      expect([...orden].sort()).toEqual(board.map((list) => list.id).sort());
    }
  });
});
