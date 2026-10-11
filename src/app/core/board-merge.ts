import type { ChecklistBoard, ChecklistList, ChecklistTask } from '../models/board.models';

/**
 * Árbitro de la fusión de adiciones.
 *
 * REGLA DEL `updatedAt`: la fecha de última modificación de una lista viaja en `board_data`,
 * así que cada dispositivo la escribe con SU reloj en cada acción. Si se comparara como un
 * campo más, dos dispositivos que añaden tareas distintas a la misma lista parecerían haber
 * «editado» la lista y la fusión sería un conflicto inventado. Por eso:
 *
 *  - El `updatedAt` NO entra en la comparación de listas existentes (se descarta antes).
 *  - Al fusionar, la fecha que queda es la MÁS RECIENTE de las dos: la lista se modificó en
 *    el instante posterior de los dos dispositivos.
 */
export class BoardMergeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoardMergeConflictError';
  }
}

export function mergeBoardAdditions(
  base: ChecklistBoard,
  local: ChecklistBoard,
  remote: ChecklistBoard
): ChecklistBoard {
  assertBoardMetadataUnchanged(base, local, 'local');
  assertAdditionOnly(base.lists, local.lists, 'listas locales', withoutTasksOrUpdatedAt);

  const baseLists = indexById(base.lists, 'listas base');
  const localLists = indexById(local.lists, 'listas locales');
  const remoteLists = indexById(remote.lists, 'listas remotas');

  for (const baseList of base.lists) {
    const localList = localLists.get(baseList.id)!;
    assertAdditionOnly(baseList.tasks, localList.tasks, `tareas locales de ${baseList.id}`);
    if (!remoteLists.has(baseList.id) && localList.tasks.length > baseList.tasks.length) {
      throw new BoardMergeConflictError(`No se pueden agregar tareas: la lista ${baseList.id} fue eliminada en remoto.`);
    }
  }

  const mergedLists: ChecklistList[] = [];
  for (const remoteList of remote.lists) {
    if (baseLists.has(remoteList.id)) {
      const localList = localLists.get(remoteList.id)!;
      const baseList = baseLists.get(remoteList.id)!;
      mergedLists.push({
        ...structuredClone(remoteList),
        tasks: mergeAddedEntities(baseList.tasks, localList.tasks, remoteList.tasks, `tareas de ${remoteList.id}`),
        updatedAt: mostRecentUpdatedAt(remoteList.updatedAt, localList.updatedAt)
      });
      continue;
    }

    const sameIdLocalAddition = localLists.get(remoteList.id);
    if (sameIdLocalAddition && !deepEqual(
      withoutTasksOrUpdatedAt(sameIdLocalAddition),
      withoutTasksOrUpdatedAt(remoteList)
    )) {
      throw new BoardMergeConflictError(`La lista nueva ${remoteList.id} difiere entre dispositivos.`);
    }
    mergedLists.push(structuredClone(remoteList));
  }

  for (const localList of local.lists) {
    if (!baseLists.has(localList.id) && !remoteLists.has(localList.id)) {
      mergedLists.push(structuredClone(localList));
    }
  }

  assertGloballyUniqueTaskIds(mergedLists);
  return { ...structuredClone(remote), lists: mergedLists };
}

function assertBoardMetadataUnchanged(base: ChecklistBoard, candidate: ChecklistBoard, source: string): void {
  const { lists: _baseLists, ...baseMetadata } = base;
  const { lists: _candidateLists, ...candidateMetadata } = candidate;
  if (!deepEqual(baseMetadata, candidateMetadata)) {
    throw new BoardMergeConflictError(`El tablero ${source} contiene cambios que no son adiciones.`);
  }
}

function assertAdditionOnly<T extends { id: string }>(
  base: T[],
  candidate: T[],
  label: string,
  normalize: (value: T) => unknown = (value) => value
): void {
  const baseById = indexById(base, `${label} base`);
  const candidateById = indexById(candidate, label);
  const candidateBaseOrder = candidate.filter((item) => baseById.has(item.id)).map((item) => item.id);
  if (!deepEqual(base.map((item) => item.id), candidateBaseOrder)) {
    throw new BoardMergeConflictError(`${label} fueron eliminadas o reordenadas.`);
  }

  for (const baseItem of base) {
    const candidateItem = candidateById.get(baseItem.id);
    if (!candidateItem || !deepEqual(normalize(baseItem), normalize(candidateItem))) {
      throw new BoardMergeConflictError(`${label} existentes fueron editadas o eliminadas.`);
    }
  }
}

function mergeAddedEntities<T extends { id: string }>(base: T[], local: T[], remote: T[], label: string): T[] {
  const baseById = indexById(base, `${label} base`);
  const remoteById = indexById(remote, `${label} remotas`);
  const merged = structuredClone(remote);

  for (const localItem of local) {
    if (baseById.has(localItem.id)) continue;
    const existingRemote = remoteById.get(localItem.id);
    if (existingRemote) {
      if (!deepEqual(existingRemote, localItem)) {
        throw new BoardMergeConflictError(`La misma adición en ${label} tiene contenido distinto.`);
      }
      continue;
    }
    merged.push(structuredClone(localItem));
  }
  return merged;
}

function indexById<T extends { id: string }>(items: T[], label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    if (result.has(item.id)) throw new BoardMergeConflictError(`Hay IDs duplicados en ${label}.`);
    result.set(item.id, item);
  }
  return result;
}

function withoutTasksOrUpdatedAt(list: ChecklistList): Omit<ChecklistList, 'tasks' | 'updatedAt'> {
  const { tasks: _tasks, updatedAt: _updatedAt, ...metadata } = list;
  return metadata;
}

/**
 * La fecha más reciente entre las candidatas, o `undefined` si ninguna es legible. Se usa para
 * decidir qué `updatedAt` sobrevive a la fusión: gana el instante posterior.
 */
function mostRecentUpdatedAt(...candidates: (string | undefined)[]): string | undefined {
  let best: string | undefined;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !Number.isFinite(Date.parse(candidate))) continue;
    const time = Date.parse(candidate);
    if (time <= bestTime) continue;
    best = candidate;
    bestTime = time;
  }
  return best;
}

function assertGloballyUniqueTaskIds(lists: ChecklistList[]): void {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const task of list.tasks as ChecklistTask[]) {
      if (ids.has(task.id)) throw new BoardMergeConflictError(`La tarea ${task.id} aparece más de una vez.`);
      ids.add(task.id);
    }
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  return deepEqual(leftKeys, rightKeys) && leftKeys.every((key) => deepEqual(leftObject[key], rightObject[key]));
}