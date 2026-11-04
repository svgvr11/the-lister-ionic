# Modelo de datos — The Lister

## Fuente canónica

- `src/app/models/board.model.ts`: interfaces TypeScript del tablero.
- `supabase/schema.sql`: esquema SQL de PostgreSQL (tabla `boards` con `board_data` JSONB).

## Interfaces principales

### ChecklistBoard

```ts
export interface ChecklistBoard {
  id: string;
  title: string;
  createdAt: string;
  lists: ChecklistList[];
  notes?: BoardNote[];
  pinnedNoteId?: string | null;
  pinnedListId?: string | null;
  trashedLists?: ChecklistTrashedList[];
  archivedLists?: ChecklistArchivedList[];
}
```

- `id`, `title`, `createdAt`: obligatorios.
- `lists`: listas activas del tablero (máximo 50).
- `notes`: notas con adjuntos (opcional, retrocompatibilidad).
- `pinnedListId`: lista fijada (primera posición, opcional para retrocompatibilidad).
- `trashedLists`: listas en basurero (opcional).
- `archivedLists`: listas archivadas (opcional).

### ChecklistList

```ts
export interface ChecklistList {
  id: string;
  boardId: string;
  title: string;
  visualColor?: string;
  position: number;
  createdAt: string;
  updatedAt?: string;
  tasks: ChecklistTask[];
}
```

- `position`: orden de dibujo (decidido por el usuario).
- `updatedAt`: fecha de última modificación (opcional, fallback a `createdAt` más reciente de tareas).
- `tasks`: tareas de la lista.

### ChecklistTask

```ts
export interface ChecklistTask {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  position: number;
  createdAt: string;
}
```

### ChecklistTrashedList / ChecklistArchivedList

```ts
export interface ChecklistTrashedList {
  list: ChecklistList;
  deletedAt: string;
}

export interface ChecklistArchivedList {
  list: ChecklistList;
  archivedAt: string;
}
```

### BoardNote / BoardNoteAttachment

```ts
export interface BoardNoteAttachment {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface BoardNote {
  id: string;
  title: string;
  contentHtml: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  attachments: BoardNoteAttachment[];
}
```

## Esquema SQL (Supabase)

Tabla `public.boards`:
- `id` (uuid PK), `owner_id` (uuid FK auth.users, NOT NULL, único), `title` (text), `created_at` (timestamptz), `updated_at` (timestamptz), `board_data` (jsonb).

RLS activo: políticas select/insert/update/delete solo para `authenticated` con `owner_id = auth.uid()`.

Bucket `note-attachments` privado, 10 MB, políticas por `owner_id`.

Tablas heredadas `checklist_lists`, `checklist_tasks`: eliminadas el 2026-10-03.

## Serialización y versión

`src/app/core/board/board-serialization/board-serialization.ts`:
- `deserializeBoard(record)`: fila Supabase → `ChecklistBoard`.
- `nextBoardVersion(expectedVersion, now)`: siguiente versión optimista.
- `isSameVersion(left, right)`, `isNewerVersion(candidate, known)`: comparadores de versión.

## Reglas de integridad

- Un tablero por usuario (constraint `boards_owner_id_key`).
- `board_data` contiene listas, tareas, basurero, archivo, pin.
- `position` define el orden de listas y tareas.
- `updatedAt` por lista no genera conflictos de merge.
- Fecha inválida en basurero/archivo nunca purga (se trata como recién salida).

## Lo que no debe editarse manualmente

- `supabase/schema.sql` es la fuente del esquema DB; cambios requieren ejecución manual en Supabase SQL Editor.
- `board.model.ts` es la fuente de las interfaces TS; cambios deben reflejarse en serialización y repositorios.