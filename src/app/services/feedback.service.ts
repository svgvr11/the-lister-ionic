import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DiagnosticsService } from './diagnostics.service';
import {
  FeedbackCounts,
  FeedbackDiagnostics,
  FeedbackImageMime,
  FeedbackType,
  MAX_DIAGNOSTICS_BYTES,
  MAX_IMAGES,
  MESSAGE_MAX_LENGTH,
  checkImageBatch,
  isValidContactEmail,
  normalizeContactEmail,
  validateMessage
} from '../core/feedback-core';
import { SESSION_BLOCKED_MESSAGE, isSessionBlocked } from '../core/session-guard';
import {
  mensajeEnvioNoDisponible,
  mensajeErrorDeEnvio,
  mensajeParaError,
  mensajeRespuestaNoOk,
  mensajeSinConexion,
  mensajeSinSesion
} from '../core/feedback-messages';

/** Una imagen ya preparada para enviar: bytes, tipo real y URL de la miniatura. */
export interface PreparedImage {
  bytes: Uint8Array;
  mime: FeedbackImageMime;
  /** Nombre de archivo local. El servidor genera el suyo, así que este nunca decide nada. */
  name: string;
  /** URL del blob para la miniatura; se revoca al quitar la imagen o cerrar el modal. */
  previewUrl: string;
  size: number;
}

export interface FeedbackDraft {
  type: FeedbackType;
  message: string;
  contactEmail: string;
  includeDiagnostics: boolean;
}

export type FeedbackSendResult = { ok: true } | { ok: false; message: string };

/** Estado inicial: "Error" marcado y todo vacío. */
export const EMPTY_FEEDBACK_DRAFT: FeedbackDraft = {
  type: 'bug',
  message: '',
  contactEmail: '',
  includeDiagnostics: true
};

/**
 * ENVÍO DE REPORTES
 *
 * Monta el multipart/form-data y lo manda a la Edge Function `submit-feedback` con el cliente
 * supabase-js COMPARTIDO de AuthService (nunca uno nuevo: otra instancia no vería la sesión).
 *
 * Nota sobre supabase-js: cuando el body es un FormData, la librería lo pasa a fetch tal cual
 * y NO pone Content-Type, porque si lo pusiera se perdería el `boundary` del multipart y el
 * servidor no podría parsearlo. Por eso aquí no se fija ninguna cabecera de contenido.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly auth = inject(AuthService);
  private readonly diagnostics = inject(DiagnosticsService);

  /**
   * Borrador sin enviar, SOLO en memoria (nunca en localStorage ni en la nube).
   *
   * El modal vive en un `*ngIf` del tablero, así que se desmonta al cerrarse y su estado se
   * perdería. Guardando el borrador aquí, en un servicio root, el texto sobrevive a cerrar y
   * volver a abrir el modal dentro de la misma sesión, que es lo que evita que alguien pierda
   * medio párrafo al tocar sin querer fuera. Se borra al enviar con éxito o al descartar de
   * verdad, y al recargar la app o cambiar de cuenta desaparece igual.
   */
  private pendingDraft: FeedbackDraft = { ...EMPTY_FEEDBACK_DRAFT };

  /** Lo que el modal debe mostrar al abrirse: el borrador si lo hay, o el formulario vacío. */
  restoreDraft(): FeedbackDraft {
    return { ...this.pendingDraft };
  }

  /** Guarda una copia del borrador actual. Se llama en cada cambio del formulario. */
  keepDraft(draft: FeedbackDraft): void {
    this.pendingDraft = { ...draft };
  }

  /** Vacía el borrador: tras un envío correcto o al confirmar que se descarta. */
  clearDraft(): void {
    this.pendingDraft = { ...EMPTY_FEEDBACK_DRAFT };
  }

  /** Sin sesión o sin credenciales configuradas no hay a quién preguntar. */
  get available(): boolean {
    return this.auth.enabled && Boolean(this.auth.supabaseClient) && Boolean(this.auth.session);
  }

  /**
   * Sesión real, no solo la que AuthService tenga cacheada en memoria.
   *
   * `AuthService.session` se rellena al construir el cliente y con `onAuthStateChange`, pero
   * en un arranque en frío (APK recién abierto, o pestaña restaurada) todavía puede estar a
   * null aunque haya una sesión válida guardada. `getSession()` la lee del almacenamiento y la
   * refresca si toca, y de paso deja el JWT disponible para que supabase-js lo ponga en la
   * cabecera `Authorization` de `functions.invoke`.
   *
   * Se llama justo antes de enviar, no al abrir el modal: es una operación de red y no tiene
   * sentido gastarla por abrir la ventana.
   */
  private async ensureSession(): Promise<boolean> {
    if (!this.auth.enabled || !this.auth.supabaseClient) return false;
    if (this.auth.session) return true;
    try {
      const session = await this.auth.getSession();
      return Boolean(session?.access_token);
    } catch {
      return false;
    }
  }

  /** El texto que el modal enseña en "Ver qué se enviará". */
  diagnosticsPreview(): string {
    return JSON.stringify(this.diagnostics.collect(), null, 2);
  }

  /** El diagnóstico ya viene de `collectDiagnostics`, que aplica la lista blanca. */
  collectDiagnostics(): FeedbackDiagnostics {
    return this.diagnostics.collect();
  }

  setCounts(counts: FeedbackCounts): void {
    this.diagnostics.setCounts(counts);
  }

/**
   * Valida en el cliente con las MISMAS reglas del servidor, para no gastar el envío en un
   * formulario que el servidor va a rechazar. El servidor repite la validación: esta no la
   * sustituye, solo evita el viaje.
   */
  validate(draft: FeedbackDraft, imageCount: number): string {
    const mensaje = validateMessage(draft.message);
    if (!mensaje.ok) return mensaje.error;
    if (mensaje.value.length > MESSAGE_MAX_LENGTH) {
      return `El mensaje no puede pasar de ${MESSAGE_MAX_LENGTH} caracteres.`;
    }
    if (!isValidContactEmail(draft.contactEmail)) return 'Ese correo no parece válido.';
    if (imageCount > MAX_IMAGES) return `Puedes adjuntar hasta ${MAX_IMAGES} imágenes por reporte.`;
    if (draft.includeDiagnostics && JSON.stringify(this.diagnostics.collect()).length > MAX_DIAGNOSTICS_BYTES) {
      return 'La información técnica es demasiado extensa para enviarla.';
    }
    return '';
  }

  /** El botón "Enviar" se habilita solo con esto. Sin conexión tampoco deja intentar. */
  canSend(draft: FeedbackDraft, imageCount: number, online: boolean, busy: boolean): boolean {
    return !busy && online && this.validate(draft, imageCount) === '';
  }

  async send(draft: FeedbackDraft, images: readonly PreparedImage[]): Promise<FeedbackSendResult> {
    // Pestaña bloqueada por un cambio de sesión en otra pestaña: no se manda nada a
    // Supabase (ni siquiera se intenta recuperar la sesión). Se devuelve resultado y no
    // error porque el modal de feedback solo captura con try/finally.
    if (isSessionBlocked()) return { ok: false, message: SESSION_BLOCKED_MESSAGE };
    const client = this.auth.supabaseClient;
    if (!client || !this.auth.enabled) {
      return { ok: false, message: mensajeEnvioNoDisponible() };
    }

    // Sin sesión no se llama a la función: el servidor respondería 401 y el usuario vería un
    // error técnico. Antes se intenta recuperar la sesión del almacenamiento (arranque en frío).
    if (!(await this.ensureSession())) {
      return { ok: false, message: mensajeSinSesion() };
    }

    const mensaje = validateMessage(draft.message);
    if (!mensaje.ok) return { ok: false, message: mensaje.error };
    if (!isValidContactEmail(draft.contactEmail)) {
      return { ok: false, message: 'Ese correo no parece válido.' };
    }

    const tamano = checkImageBatch(images.map((image) => image.size));
    if (!tamano.ok) return { ok: false, message: tamano.error };

    const form = new FormData();
    form.append('type', draft.type);
    form.append('message', mensaje.value);
    const contacto = normalizeContactEmail(draft.contactEmail);
    if (contacto) form.append('contact_email', contacto);
    // Sin la casilla marcada no se manda el campo: el servidor guarda '{}' y el correo sale sin
    // diagnóstico. Es la diferencia entre "lo acepto" y "no lo has pedido".
    if (draft.includeDiagnostics) form.append('diagnostics', JSON.stringify(this.diagnostics.collect()));
    for (const image of images) {
      // Blob con el tipo real detectado y un nombre neutro: el servidor genera su propio uuid.
      form.append('images', new Blob([image.bytes as BlobPart], { type: image.mime }), image.name);
    }

    try {
      // Cliente COMPARTIDO de AuthService a propósito: otra instancia de supabase-js no
      // vería la sesión y enviaría sin JWT.
      //
      // Sobre la cabecera Authorization con body FormData: supabase-js no fija Content-Type
      // (para no perder el `boundary`), y el cliente de funciones resuelve el token en CADA
      // llamada con `auth.getSession()` y lo pone en `Authorization: Bearer <jwt del usuario>`.
      // Con el formato nuevo de claves (`sb_publishable_...`) la clave publicable NO se manda
      // como bearer para funciones (`omitApiKeyAsBearer`), así que lo que viaja es el JWT
      // real del usuario y no la anonKey.
      const { data, error } = await client.functions.invoke('submit-feedback', { body: form });
      if (error) return { ok: false, message: mensajeParaError(error) };
      const respuesta = data as { ok?: boolean; error?: string } | null;
      if (respuesta?.ok) return { ok: true };
      return { ok: false, message: mensajeRespuestaNoOk(respuesta) };
    } catch {
      // Cualquier excepción (sin red, CORS, aborted) llega aquí y siempre es transitoria: el
      // formulario y las imágenes se conservan para reintentar.
      return { ok: false, message: mensajeErrorDeEnvio() };
    }
  }
}