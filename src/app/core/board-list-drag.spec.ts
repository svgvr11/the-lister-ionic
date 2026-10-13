import { describe, expect, it } from 'vitest';
import {
  LIST_DRAG_TEXT_PREFIX,
  LIST_DRAG_TYPE,
  listDragKeyOffset,
  listMoveAnnouncement,
  listMoveBlockedAnnouncement,
  readListDragPayload,
  setListDragPayload
} from './board-list-drag';

/** `dataTransfer` de mentira: un mapa de tipo → texto, como el de verdad. */
const fakeDataTransfer = (valores: Record<string, string> = {}) => {
  const datos = new Map(Object.entries(valores));
  return {
    getData: (tipo: string) => datos.get(tipo) ?? '',
    setData: (tipo: string, valor: string) => {
      datos.set(tipo, valor);
    }
  };
};

describe('board-list-drag: el payload del arrastre', () => {
  it('el id de la lista se lee del tipo propio', () => {
    const data = fakeDataTransfer({ [LIST_DRAG_TYPE]: 'l1' });

    expect(readListDragPayload(data)).toBe('l1');
  });

  it('también se lee del texto plano con el prefijo', () => {
    const data = fakeDataTransfer({ 'text/plain': `${LIST_DRAG_TEXT_PREFIX}l2` });

    expect(readListDragPayload(data)).toBe('l2');
  });

  it('guardar deja el id en los dos formatos', () => {
    const data = fakeDataTransfer();

    setListDragPayload(data, 'l3');

    expect(readListDragPayload(data)).toBe('l3');
    expect(data.getData(LIST_DRAG_TYPE)).toBe('l3');
  });

  it('un arrastre de tarea no es un arrastre de lista', () => {
    const data = fakeDataTransfer({ 'text/plain': 'task:t1' });

    expect(readListDragPayload(data)).toBeNull();
  });

  it('texto suelto, un archivo o nada tampoco lo son', () => {
    expect(readListDragPayload(fakeDataTransfer({ 'text/plain': 'hola' }))).toBeNull();
    expect(readListDragPayload(fakeDataTransfer({ 'Files': '[]' }))).toBeNull();
    expect(readListDragPayload(fakeDataTransfer())).toBeNull();
    expect(readListDragPayload(null)).toBeNull();
  });

  it('el prefijo sin id no da un id vacío', () => {
    const data = fakeDataTransfer({ 'text/plain': LIST_DRAG_TEXT_PREFIX });

    expect(readListDragPayload(data)).toBeNull();
  });
});

describe('board-list-drag: el teclado', () => {
  it('Alt + flecha abajo o derecha baja una posición', () => {
    expect(listDragKeyOffset({ altKey: true, key: 'ArrowDown' })).toBe(1);
    expect(listDragKeyOffset({ altKey: true, key: 'ArrowRight' })).toBe(1);
  });

  it('Alt + flecha arriba o izquierda sube una posición', () => {
    expect(listDragKeyOffset({ altKey: true, key: 'ArrowUp' })).toBe(-1);
    expect(listDragKeyOffset({ altKey: true, key: 'ArrowLeft' })).toBe(-1);
  });

  it('sin Alt las flechas no mueven la lista (siguen moviendo el scroll)', () => {
    expect(listDragKeyOffset({ altKey: false, key: 'ArrowDown' })).toBe(0);
    expect(listDragKeyOffset({ altKey: false, key: 'ArrowUp' })).toBe(0);
  });

  it('Alt con otra tecla no mueve nada', () => {
    expect(listDragKeyOffset({ altKey: true, key: 'a' })).toBe(0);
    expect(listDragKeyOffset({ altKey: true, key: 'Escape' })).toBe(0);
  });
});

describe('board-list-drag: el anuncio', () => {
  it('dice la posición con numeración de pantalla', () => {
    expect(listMoveAnnouncement('Compra', 1, 4)).toBe('Lista Compra movida a la posición 2 de 4');
  });

  it('cuando no se mueve avisa de que ya estaba ahí', () => {
    expect(listMoveBlockedAnnouncement('Compra', 0, 4))
      .toBe('La lista Compra ya está en la posición 1 de 4');
  });
});
