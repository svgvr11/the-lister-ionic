/**
 * Clasificación pura del resultado de `delete-account`.
 *
 * Lógica pura y sin dependencias (ni Angular, ni Capacitor, ni `window`): convierte
 * el par `{ data, error }` de `functions.invoke` en un resultado discriminado. Así se
 * puede probar en Node con `scripts/test-delete-account-result.mjs`.
 *
 * La reintentabilidad (refrescar la sesión y repetir UNA vez ante un 401) vive en
 * `AuthService.deleteAccount()`, que usa esta clasificación para cada intento.
 */

/** Resultado del borrado visto desde la app. */
export type DeleteAccountOutcome = 'ok' | 'session-expired' | 'server' | 'network';

/** Resultado discriminado que devuelve `AuthService.deleteAccount()`. */
export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: Exclude<DeleteAccountOutcome, 'ok'>; message: string };

/** Cuerpo que devuelve la Edge Function (`{ ok: true }` o `{ ok: false, error }`). */
export interface DeleteAccountResponseBody {
  ok?: boolean;
  error?: string;
}

/** Error de `functions.invoke`: solo importan `status` y `message`. */
export interface DeleteAccountInvokeError {
  status?: number;
  message?: string;
}

/** Texto exacto que hay que escribir para habilitar la confirmación. */
export const DELETE_CONFIRM_TEXT = 'ELIMINAR';

/** Mensaje cuando la sesión expiró y ni refrescándola se pudo borrar. */
export const DELETE_SESSION_EXPIRED_MESSAGE =
  'Tu sesión expiró. Inicia sesión de nuevo y repite la eliminación si tu cuenta sigue activa.';

/**
 * Clasifica un intento de borrado. `error.status` manda:
 * - Sin error y `data.ok === true` → `ok`.
 * - Error 401 → `session-expired` (el llamador decide si reintenta tras refrescar).
 * - Sin estado (0/ausente: sin red, CORS, abort) → `network`.
 * - 5xx o cualquier otra respuesta inesperada → `server`.
 */
export function classifyDeleteAccountInvoke(
  data: DeleteAccountResponseBody | null | undefined,
  error: DeleteAccountInvokeError | null | undefined
): DeleteAccountOutcome {
  if (error) {
    const status = typeof error.status === 'number' ? error.status : 0;
    if (status === 401) return 'session-expired';
    if (!status) return 'network';
    return 'server';
  }
  if (data?.ok === true) return 'ok';
  return 'server';
}

/** Mensaje en español para cada resultado no exitoso. La sesión sigue intacta salvo en `session-expired` ya gestionado. */
export function deleteAccountMessage(outcome: DeleteAccountOutcome): string {
  switch (outcome) {
    case 'ok':
      return '';
    case 'session-expired':
      return DELETE_SESSION_EXPIRED_MESSAGE;
    case 'network':
      return 'No se pudo eliminar la cuenta. Revisa la conexión e inténtalo de nuevo.';
    case 'server':
      return 'No se pudo eliminar la cuenta. Inténtalo de nuevo.';
  }
}

/** `true` solo con el literal exacto (mayúsculas, sin espacios de más). */
export function isDeleteConfirmText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === DELETE_CONFIRM_TEXT;
}
