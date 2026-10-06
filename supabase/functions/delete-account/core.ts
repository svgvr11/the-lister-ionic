/**
 * EDGE FUNCTION (lógica): delete-account — borrado de cuenta (exigencia Google Play).
 *
 * ESTE ARCHIVO NO TOCA LA RED NI GLOBALES DE DENO Y NO IMPORTA VALORES DE NINGÚN
 * SITIO (cero `import` de valores, ni siquiera relativos): recibe el cliente `db`
 * por parámetro con forma compatible con supabase-js y el `userId` ya verificado.
 * Así `scripts/test-delete-account.mjs` lo importa en Node con un cliente simulado.
 * Todo el cableado (CORS, `Deno.serve`, JWT, `scrubSensitiveText`) vive en `index.ts`.
 *
 * ORDEN (reintentable: el usuario sigue existiendo hasta el final):
 *   1. `select` — leer `attachments` de `feedback_reports` donde `user_id = userId`.
 *   2. `remove` — borrar esos objetos con `db.storage.from(bucket).remove(...)` en
 *      bloques de 100. Si falla, SE ABORTA sin borrar nada más.
 *   3. `delete-reports` — borrar las filas de `feedback_reports` del usuario (su FK
 *      es `ON DELETE SET NULL`, así que borrar solo al usuario las anonimizaría
 *      pero NO las eliminaría).
 *   4. `delete-boards` — borrar las filas de `boards` con `owner_id = userId`
 *      (su FK ya es `ON DELETE CASCADE`; el borrado explícito lo hace reintentable
 *      antes de eliminar al usuario).
 *   5. `delete-user` — `db.auth.admin.deleteUser(userId)`, lo último.
 *
 * VENTANA DE CARRERA ACEPTADA (decisión explícita): un `submit-feedback` concurrente
 * que inserte su reporte entre el paso 1 (`select`) y el paso 3 (`delete-reports`)
 * deja ese reporte huérfano (`user_id` en NULL por el `ON DELETE SET NULL`) y su
 * objeto huérfano en el bucket. Se acepta porque cerrar la ventana exigiría bloquear
 * escrituras o borrar en bucle hasta ver 0 filas, y el resto queda anonimizado sin
 * apuntar a ninguna cuenta. No se reintenta dentro de esta función.
 *
 * Idempotencia: repetir la operación tras un fallo a mitad es seguro — los pasos ya
 * aplicados devuelven 0 filas / lista vacía, y `deleteUser` sobre un usuario que ya
 * no existe se trata como éxito para que el reintento no falle al final.
 */

/** Bucket de adjuntos. `index.ts` le pasa `FEEDBACK_BUCKET` de `_shared`. */
export const DELETE_ACCOUNT_BUCKET = 'feedback-attachments';

/** Bloques de borrado de Storage (límite documentado de la API). */
export const DELETE_ACCOUNT_REMOVE_CHUNK = 100;

/** Página de lectura de reportes. */
export const DELETE_ACCOUNT_PAGE_SIZE = 1000;

export type DeleteAccountPhase =
  | 'select'
  | 'remove'
  | 'delete-reports'
  | 'delete-boards'
  | 'delete-user';

/** Error con la fase donde falló; `index.ts` lo convierte en respuesta genérica. */
export class DeleteAccountError extends Error {
  readonly phase: DeleteAccountPhase;
  readonly logDetail?: string;
  constructor(phase: DeleteAccountPhase, message: string, logDetail?: string) {
    super(message);
    this.phase = phase;
    this.logDetail = logDetail;
  }
}

interface SupabaseErrorLike {
  message: string;
}

/** Constructor de consultas de lectura: `select(...).eq(...).range(...)`. */
export interface DeleteAccountSelectQuery {
  eq(
    column: string,
    value: unknown
  ): {
    range(
      from: number,
      to: number
    ): Promise<{
      data: Array<{ attachments?: unknown }> | null;
      error: SupabaseErrorLike | null;
    }>;
  };
}

/** Constructor de consultas de borrado: `delete().eq(...)` se espera (`await`). */
export interface DeleteAccountDeleteQuery {
  eq(
    column: string,
    value: unknown
  ): Promise<{ error: SupabaseErrorLike | null }>;
}

export interface DeleteAccountTableRef {
  select(columns: string): DeleteAccountSelectQuery;
  delete(): DeleteAccountDeleteQuery;
}

/** Mínimo de supabase-js que usa esta función (tablas + Storage + Auth admin). */
export interface DeleteAccountDb {
  from(table: string): DeleteAccountTableRef;
  storage: {
    from(
      bucket: string
    ): {
      remove(paths: string[]): Promise<{ error: SupabaseErrorLike | null }>;
    };
  };
  auth: {
    admin: {
      deleteUser(userId: string): Promise<{ error: SupabaseErrorLike | null }>;
    };
  };
}

export interface DeleteAccountOptions {
  /** Bucket de adjuntos; por defecto `DELETE_ACCOUNT_BUCKET`. */
  bucket?: string;
}

/**
 * Saca la lista única de rutas de Storage de las filas leídas. `attachments` es
 * jsonb y puede venir con cualquier forma (null, string, con nulos o duplicados):
 * solo sobreviven los strings no vacíos, sin duplicar.
 */
export function collectAttachmentPaths(
  rows: ReadonlyArray<{ attachments?: unknown }>
): string[] {
  const rutas = new Set<string>();
  for (const fila of rows) {
    const adjuntos = fila?.attachments;
    if (!Array.isArray(adjuntos)) continue;
    for (const ruta of adjuntos) {
      if (typeof ruta === 'string' && ruta.length > 0) rutas.add(ruta);
    }
  }
  return [...rutas];
}

/** `deleteUser` sobre un usuario que ya no existe cuenta como éxito (reintento). */
function isUserNotFoundMessage(message: string): boolean {
  return /user\s*not\s*found|no\s*user|not\s*found|404/i.test(message ?? '');
}

/**
 * Ejecuta el borrado en orden. El `userId` viene SIEMPRE del JWT verificado (lo
 * resuelve `index.ts`); jamás se lee del cuerpo de la petición.
 */
export async function deleteAccount(
  db: DeleteAccountDb,
  userId: string,
  options: DeleteAccountOptions = {}
): Promise<void> {
  const bucket = options.bucket ?? DELETE_ACCOUNT_BUCKET;

  // 1. Leer las rutas de adjuntos del usuario, paginando.
  const filas: { attachments?: unknown }[] = [];
  let desplazamiento = 0;
  while (true) {
    const { data, error } = await db
      .from('feedback_reports')
      .select('attachments')
      .eq('user_id', userId)
      .range(desplazamiento, desplazamiento + DELETE_ACCOUNT_PAGE_SIZE - 1);
    if (error) {
      throw new DeleteAccountError(
        'select',
        'No se pudo eliminar la cuenta. Inténtalo de nuevo.',
        `lectura de reportes fallida: ${error.message}`
      );
    }
    if (!data || data.length === 0) break;
    for (const fila of data) filas.push({ attachments: fila?.attachments });
    if (data.length < DELETE_ACCOUNT_PAGE_SIZE) break;
    desplazamiento += DELETE_ACCOUNT_PAGE_SIZE;
  }

  // 2. Borrar los objetos por la API de Storage, en bloques de 100. Si falla, se
  //    aborta aquí: las filas y el usuario siguen intactos y se puede reintentar.
  const rutas = collectAttachmentPaths(filas);
  for (let i = 0; i < rutas.length; i += DELETE_ACCOUNT_REMOVE_CHUNK) {
    const trozo = rutas.slice(i, i + DELETE_ACCOUNT_REMOVE_CHUNK);
    const { error } = await db.storage.from(bucket).remove(trozo);
    if (error) {
      throw new DeleteAccountError(
        'remove',
        'No se pudo eliminar la cuenta. Inténtalo de nuevo.',
        `remove fallido: ${trozo.length} objetos, ${error.message}`
      );
    }
  }

  // 3. Borrar las filas de reportes del usuario.
  {
    const { error } = await db
      .from('feedback_reports')
      .delete()
      .eq('user_id', userId);
    if (error) {
      throw new DeleteAccountError(
        'delete-reports',
        'No se pudo eliminar la cuenta. Inténtalo de nuevo.',
        `delete de reportes fallido: ${error.message}`
      );
    }
  }

  // 4. Borrar el tablero del usuario.
  {
    const { error } = await db.from('boards').delete().eq('owner_id', userId);
    if (error) {
      throw new DeleteAccountError(
        'delete-boards',
        'No se pudo eliminar la cuenta. Inténtalo de nuevo.',
        `delete de boards fallido: ${error.message}`
      );
    }
  }

  // 5. Borrar al usuario, lo último. Si ya no existe (reintento tras un éxito a
  //    medias), se considera éxito para no fallar al final.
  {
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) {
      if (isUserNotFoundMessage(error.message)) return;
      throw new DeleteAccountError(
        'delete-user',
        'No se pudo eliminar la cuenta. Inténtalo de nuevo.',
        `deleteUser fallido: ${error.message}`
      );
    }
  }
}
