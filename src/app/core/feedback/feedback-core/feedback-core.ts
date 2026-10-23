/**
 * Lógica pura y compartida del reporte de comentarios y errores.
 *
 * ESTE ARCHIVO ESTÁ DUPLICADO, CARÁCTER POR CARÁCTER, EN DOS SITIOS:
 *   - src/app/core/feedback-core.ts                 (app Angular + test:feedback)
 *   - supabase/functions/_shared/feedback-core.ts   (Edge Functions en Deno)
 * `npm run test:feedback` falla si las dos copias dejan de coincidir, así que no pueden
 * divergir sin que se note. Existe la duplicación porque las Edge Functions se despliegan
 * desde supabase/functions/ y no pueden importar de src/ de forma fiable en el bundle.
 *
 * Regla del módulo: lógica pura y sin dependencias. Ni Angular, ni Capacitor, ni Deno,
 * ni `window`. Todo lo que se pueda decidir sin tocar el entorno vive aquí, y tanto la
 * app como el servidor toman exactamente las mismas decisiones.
 */

// ── Tipos y límites ─────────────────────────────────────────────────────────

export type FeedbackType = 'bug' | 'suggestion' | 'other';

export type FeedbackImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export type FeedbackDiagnosticValue = string | number | boolean;

export interface FeedbackCounts {
  lists: number;
  archivedLists: number;
  trashedLists: number;
}

export interface FeedbackRecentError {
  message: string;
  at: string;
}

export interface FeedbackDiagnostics {
  [key: string]: FeedbackDiagnosticValue | FeedbackCounts | FeedbackRecentError[] | undefined;
}

/** Contexto que se lee del entorno y se pasa a `collectDiagnostics`. */
export interface DiagnosticsContext {
  appVersion: string;
  platform: string;
  isNative: boolean;
  userAgent: string;
  uaPlatform: string;
  language: string;
  timezone: string;
  screen: { width: number; height: number };
  viewport: { width: number; height: number };
  pixelRatio: number;
  online: boolean;
  /** Ruta actual; se recorta a la parte sin query ni hash aunque venga con ellos. */
  route: string;
  themeId: string;
  counts: FeedbackCounts;
  recentErrors?: readonly FeedbackRecentError[];
}

export const FEEDBACK_TYPES: readonly FeedbackType[] = ['bug', 'suggestion', 'other'];

/** Orden de las fichas del modal. El primero es el que se marca por defecto. */
export const FEEDBACK_TYPE_CHIPS: readonly { id: FeedbackType; label: string }[] = [
  { id: 'bug', label: 'Error' },
  { id: 'suggestion', label: 'Sugerencia' },
  { id: 'other', label: 'Aviso' }
];

export const MESSAGE_MIN_LENGTH = 10;
export const MESSAGE_MAX_LENGTH = 2000;
export const CONTACT_EMAIL_MAX_LENGTH = 254;

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/**
 * Total de imágenes por reporte.
 *
 * Bajado a propósito de los 8 MB que parecían razonables: Supabase NO documenta un tope de
 * tamaño de petición para Edge Functions (la página de límites solo publica memoria,
 * duración, CPU y tamaño del bundle), así que no se puede apoyar en una cifra oficial y
 * conviene quedar muy por debajo de cualquier tope plausible de la pasarela. Como la app
 * reencoda a 1600 px y calidad 0.8 antes de enviar, las capturas reales pesan bastante
 * menos. Ver README > Feedback > Límites reales.
 */
export const MAX_TOTAL_IMAGE_BYTES = 5 * 1024 * 1024;

/** Margen sobre el total para las cabeceras y fronteras de multipart, que también cuentan. */
export const MAX_REQUEST_BYTES = MAX_TOTAL_IMAGE_BYTES + 1024 * 1024;

export const MAX_DIAGNOSTICS_BYTES = 8 * 1024;

export const RECENT_ERRORS_LIMIT = 10;
export const RECENT_ERROR_TEXT_LIMIT = 300;
export const DIAGNOSTICS_VALUE_LIMIT = 300;

export const RATE_LIMIT_PER_HOUR = 5;
export const RATE_LIMIT_PER_DAY = 20;

export const FEEDBACK_RETENTION_DAYS = 90;
export const FEEDBACK_BUCKET = 'feedback-attachments';
export const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
export const FEEDBACK_SUBJECT_PREFIX = '[The Lister]';

/** Nombre de la app que se usa en el remitente y, si procede, en el asunto. */
export const FEEDBACK_APP_NAME = 'The Lister';

/** Etiquetas visibles por tipo para el remitente del correo. */
export const FEEDBACK_TYPE_LABELS: Readonly<Record<FeedbackType, string>> = {
  bug: 'Error',
  suggestion: 'Sugerencia',
  other: 'Aviso'
};

/** Única llave del botón flotante de comentarios (punto 6 del encargo). */
export const FEEDBACK_FAB_ENABLED = true;

/** Claves escalares admitidas en el diagnóstico. Cualquier otra se descarta. */
export const DIAGNOSTICS_WHITELIST: readonly string[] = [
  'appVersion',
  'platform',
  'isNative',
  'userAgent',
  'uaPlatform',
  'language',
  'timezone',
  'screen',
  'viewport',
  'pixelRatio',
  'online',
  'route',
  'themeId'
];

/** Las únicas tres subclaves de `counts`, y siempre números. */
export const DIAGNOSTICS_COUNT_KEYS: readonly string[] = ['lists', 'archivedLists', 'trashedLists'];

// ── Validación del formulario ───────────────────────────────────────────────

export function isFeedbackType(value: unknown): value is FeedbackType {
  return typeof value === 'string' && (FEEDBACK_TYPES as readonly string[]).includes(value);
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * El mensaje se mide DESPUÉS de recortar espacios: escribir diez espacios no cuenta como
 * un reporte. Los saltos de línea del medio se conservan; los de los bordes no.
 */
export function validateMessage(raw: unknown): ValidationResult<string> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length < MESSAGE_MIN_LENGTH) {
    return { ok: false, error: `Escribe al menos ${MESSAGE_MIN_LENGTH} caracteres para poder enviarlo.` };
  }
  if (value.length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: `El mensaje no puede pasar de ${MESSAGE_MAX_LENGTH} caracteres.` };
  }
  return { ok: true, value };
}

/**
 * El contacto es opcional, así que una cadena vacía es válida. El formato es una comodidad
 * para el usuario, no una garantía: quien lo escriba mal simplemente no recibirá respuesta.
 */
export function isValidContactEmail(raw: unknown): boolean {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return true;
  if (value.length > CONTACT_EMAIL_MAX_LENGTH) return false;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/** Normaliza el contacto a lo que se guarda: recortado, o null si no se escribió. */
export function normalizeContactEmail(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value || null;
}

export type ImageBatchCheck = { ok: true } | { ok: false; error: string };

/** Máximo de archivos y tamaño total, medidos antes de leer los archivos completos. */
export function checkImageBatch(sizes: readonly number[]): ImageBatchCheck {
  if (sizes.length > MAX_IMAGES) {
    return { ok: false, error: `Puedes adjuntar hasta ${MAX_IMAGES} imágenes por reporte.` };
  }
  const total = sizes.reduce((sum, size) => sum + (Number.isFinite(size) ? size : 0), 0);
  if (total > MAX_TOTAL_IMAGE_BYTES) {
    return { ok: false, error: 'Las imágenes juntas pesan demasiado. Quita alguna o usa una captura más pequeña.' };
  }
  return { ok: true };
}

/** Tope por archivo, comprobado uno a uno para poder señalar cuál es el que no cabe. */
export function checkImageSize(size: number): ImageBatchCheck {
  if (size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Una de las imágenes supera los 2 MB. Adjunta una más pequeña.' };
  }
  return { ok: true };
}

/** Lee un archivo multipart sin cambiar el tipo binario que devuelve su ArrayBuffer. */
export async function readImageBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

// ── Tipo real de la imagen (magic bytes) ────────────────────────────────────

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]; // "WEBP", en el offset 8

function matchesAt(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[offset + i] !== magic[i]) return false;
  }
  return true;
}

/**
 * El tipo sale de los primeros bytes del archivo, nunca de la extensión ni del Content-Type
 * que declara el cliente: un ejecutable renombrado a .png no se cuela.
 */
export function detectImageMime(bytes: Uint8Array): FeedbackImageMime | null {
  if (matchesAt(bytes, PNG_MAGIC)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (matchesAt(bytes, RIFF_MAGIC) && matchesAt(bytes, WEBP_MAGIC, 8)) return 'image/webp';
  return null;
}

/** Extensión que se le da al objeto de Storage, deducida del tipo real. */
export function extensionForImageMime(mime: FeedbackImageMime): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/** Construye una ruta sin segmentos vacíos ni valores ausentes. */
export function buildFeedbackImagePath(
  userId: string,
  reportId: string,
  objectId: string,
  mime: FeedbackImageMime
): string {
  if (![userId, reportId, objectId].every((value) => typeof value === 'string' && value.length > 0)) {
    throw new TypeError('Los identificadores de la ruta del adjunto son obligatorios.');
  }
  return `${userId}/${reportId}/${objectId}.${extensionForImageMime(mime)}`;
}

// ── Diagnóstico técnico ─────────────────────────────────────────────────────

/** Una URL con query o hash puede llevar token, correo o identificadores: fuera entera. */
const URL_WITH_PARAMS = /\b[a-z][a-z0-9+.-]*:\/\/\S*[?#]\S*/gi;
/** Un correo suelto, o pegado a una URL que ya se ha eliminado. */
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;
/** JWT (tres grupos base64url) y cualquier secreto largo en hexadecimal o base64url. */
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const LONG_SECRET = /\b[A-Za-z0-9_-]{24,}\b/g;
/**
 * Credenciales en texto plano. Cubre las dos formas en que aparecen: `clave: valor` y
 * `Bearer valor` (con espacio, que es como los manda HTTP y como los escribe un error de fetch).
 * Se conserva el nombre de la clave y se sustituye el valor, para no perder la pista de qué se
 * filtró sin revelar qué era.
 */
const BEARER = /\b(bearer|token|api[_-]?key|secret|password|access_token|refresh_token|authorization)\b\s*[:=]\s*\S+|\b(bearer)\s+\S+/gi;

/**
 * Limpia los textos de error antes de mandarlos. Un error puede traer una URL con
 * parámetros (que incluye el token de la sesión), el correo de la cuenta o un fragmento de
 * JWT; ninguno de esos debe salir del dispositivo.
 */
export function scrubSensitiveText(text: unknown, limit = RECENT_ERROR_TEXT_LIMIT): string {
  const raw = typeof text === 'string' ? text : '';
  // Se conserva el nombre de la clave (el grupo 1 o el 2, según la forma que haya salido) y se
  // sustituye el valor: así se ve qué se filtró sin llegar a filtrarlo.
  const limpio = raw
    .replace(BEARER, (match, claveConDosPuntos: string | undefined, claveBearer: string | undefined) =>
      `${claveConDosPuntos ?? claveBearer ?? ''}=[redactado]`)
    .replace(URL_WITH_PARAMS, '[url]')
    .replace(EMAIL, '[email]')
    .replace(JWT, '[token]')
    .replace(LONG_SECRET, '[token]');
  return limpio.length > limit ? `${limpio.slice(0, limit)}…` : limpio;
}

function keepScalar(key: string, value: unknown, out: FeedbackDiagnostics): void {
  if (typeof value === 'boolean') {
    out[key] = value;
  } else if (typeof value === 'number') {
    // Un NaN o un Infinity serializados a JSON se rompen y no aportan nada.
    out[key] = Number.isFinite(value) ? value : 0;
  } else if (typeof value === 'string') {
    out[key] = scrubSensitiveText(value, DIAGNOSTICS_VALUE_LIMIT);
  }
}

/**
 * Aplica la lista blanca al diagnóstico recibido. El servidor vuelve a pasarlo por aquí, así
 * que una lista blanca incompleta en la app no filtra nada: lo que no está en la lista se
 * descarta, y los valores que sí están se limpian y se recortan.
 */
export function sanitizeDiagnostics(raw: unknown): FeedbackDiagnostics {
  const out: FeedbackDiagnostics = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const source = raw as Record<string, unknown>;

  for (const key of DIAGNOSTICS_WHITELIST) keepScalar(key, source[key], out);

  // counts: solo los tres números de siempre, ni una clave más ni un string.
  const counts = source['counts'];
  if (counts && typeof counts === 'object' && !Array.isArray(counts)) {
    const origen = counts as Record<string, unknown>;
    const limpio: FeedbackCounts = { lists: 0, archivedLists: 0, trashedLists: 0 };
    for (const key of DIAGNOSTICS_COUNT_KEYS) {
      const valor = origen[key];
      limpio[key as keyof FeedbackCounts] =
        typeof valor === 'number' && Number.isFinite(valor) ? Math.max(0, Math.floor(valor)) : 0;
    }
    out['counts'] = limpio;
  }

  // recentErrors: como mucho RECENT_ERRORS_LIMIT, con el texto ya limpio y recortado.
  const errores = source['recentErrors'];
  if (Array.isArray(errores)) {
    out['recentErrors'] = errores
      .filter((item) => Boolean(item) && typeof item === 'object')
      .slice(0, RECENT_ERRORS_LIMIT)
      .map((item) => ({
        message: scrubSensitiveText((item as FeedbackRecentError).message),
        at: typeof (item as FeedbackRecentError).at === 'string' ? (item as FeedbackRecentError).at : ''
      }));
  }

  return out;
}

/**
 * Monta el diagnóstico técnico a partir del contexto. Es pura: recibe todo lo que necesita y
 * no toca `window`, así que se puede probar sin navegador y la app la llama igual.
 *
 * Lo que NO entra aquí y por tanto nunca sale del dispositivo: títulos o contenido de listas
 * y tareas, el correo o el nombre de la cuenta, el avatar, cualquier token, el contenido de
 * localStorage y la ubicación.
 */
export function collectDiagnostics(ctx: DiagnosticsContext): FeedbackDiagnostics {
  const counts: FeedbackCounts = {
    lists: ctx.counts?.lists ?? 0,
    archivedLists: ctx.counts?.archivedLists ?? 0,
    trashedLists: ctx.counts?.trashedLists ?? 0
  };

  return sanitizeDiagnostics({
    appVersion: ctx.appVersion,
    platform: ctx.platform,
    isNative: ctx.isNative,
    userAgent: ctx.userAgent,
    uaPlatform: ctx.uaPlatform,
    language: ctx.language,
    timezone: ctx.timezone,
    screen: ctx.screen ? `${ctx.screen.width}x${ctx.screen.height}` : '',
    viewport: ctx.viewport ? `${ctx.viewport.width}x${ctx.viewport.height}` : '',
    pixelRatio: ctx.pixelRatio,
    online: ctx.online,
    // Solo la ruta: los parámetros pueden llevar identificadores.
    route: typeof ctx.route === 'string' ? ctx.route.split(/[?#]/)[0] : '',
    themeId: ctx.themeId,
    counts,
    recentErrors: ctx.recentErrors ?? []
  });
}

/**
 * Saca el token de una cabecera `Authorization: Bearer <jwt>`.
 *
 * Devuelve null si no hay cabecera, si no viene en forma `Bearer`, o si el token está vacío.
 * Acepta `bearer` en minúsculas porque el esquema HTTP es case-insensitive.
 *
 * POR QUÉ EXISTE: `auth.getUser(token)` de supabase-js vuelve a poner
 * `Authorization: Bearer <token>` por su cuenta, así que hay que pasarle SOLO el token. Si se
 * le pasa la cabecera entera, la que sale al servidor es `Bearer Bearer eyJ...` y GoTrue
 * responde 401 `no_authorization` aunque el JWT sea válido. Esa confusión devuelve exactamente
 * "401 falso" y es la que hace que una sesión iniciada parezca no estarlo.
 */
export function extractBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const partes = header.trim().split(/\s+/);
  if (partes.length !== 2) return null;
  if (partes[0].toLowerCase() !== 'bearer') return null;
  return partes[1] || null;
}

// ── Correo ──────────────────────────────────────────────────────────────────

/**
 * Deja el texto listo para una cabecera de correo: sin saltos de línea ni caracteres de
 * control, y con los espacios repetidos reducidos a uno. Sin esto, un "Bcc:" pegado al
 * mensaje en el asunto sería inyección de cabeceras.
 */
export function sanitizeHeaderText(text: unknown): string {
  return (typeof text === 'string' ? text : '')
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Construye la cabecera From para Resend: "Feedback - {Etiqueta} / {APP_NAME} <address>".
 * El nombre visible se sanea (sin saltos de línea, controles, comillas ni "<" ">") y se
 * entrecomilla si contiene caracteres que lo requieren según RFC 5322.
 * Tipo desconocido → "Aviso".
 */
export function buildFromHeader(type: unknown, address: string): string {
  const id = isFeedbackType(type) ? type : 'other';
  const label = FEEDBACK_TYPE_LABELS[id];
  const rawName = `Feedback - ${label} / ${FEEDBACK_APP_NAME}`;
  const saneName = sanitizeHeaderText(rawName)
    .replace(/["<>]/g, '')
    .trim();
  const needsQuotes = /[(),:;<>@[\]"]/.test(saneName) || saneName !== rawName;
  const displayName = needsQuotes ? `"${saneName}"` : saneName;
  return `${displayName} <${address}>`;
}

export function buildEmailSubject(type: unknown, message: unknown): string {
  const id = isFeedbackType(type) ? type : 'other';
  const resumen = sanitizeHeaderText(message).slice(0, 60).trim();
  return `${FEEDBACK_SUBJECT_PREFIX} ${FEEDBACK_TYPE_LABELS[id]}: ${resumen}`;
}

/** Escape de HTML para el cuerpo del correo: nada del usuario se interpreta como etiqueta. */
export function escapeHtml(text: unknown): string {
  return (typeof text === 'string' ? text : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Límite de frecuencia ────────────────────────────────────────────────────

export interface RateLimitDecision {
  allowed: boolean;
  /** Ventana que se ha superado, o null si el envío pasa. */
  scope: 'hour' | 'day' | null;
  count: number;
  limit: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Cuenta las filas del usuario en las dos ventanas. La condición es "ya hay N", así que con
 * 4 reportes anteriores se permite el quinto y con 5 se rechaza el siguiente.
 */
export function checkRateLimit(createdAts: readonly string[], now: Date): RateLimitDecision {
  const ahora = now.getTime();
  let hora = 0;
  let dia = 0;

  for (const raw of createdAts) {
    const instante = Date.parse(raw);
    if (!Number.isFinite(instante)) continue;
    const edad = ahora - instante;
    // Las filas del futuro (deriva del reloj) no cuentan en ninguna ventana.
    if (edad < 0) continue;
    if (edad < HOUR_MS) hora++;
    if (edad < DAY_MS) dia++;
  }

  if (hora >= RATE_LIMIT_PER_HOUR) {
    return { allowed: false, scope: 'hour', count: hora, limit: RATE_LIMIT_PER_HOUR };
  }
  if (dia >= RATE_LIMIT_PER_DAY) {
    return { allowed: false, scope: 'day', count: dia, limit: RATE_LIMIT_PER_DAY };
  }
  return { allowed: true, scope: null, count: hora, limit: RATE_LIMIT_PER_HOUR };
}

export function rateLimitMessage(decision: RateLimitDecision): string {
  if (decision.allowed) return '';
  return decision.scope === 'hour'
    ? `Has enviado demasiados comentarios por hora (máximo ${decision.limit}). Inténtalo más tarde.`
    : `Has enviado demasiados comentarios hoy (máximo ${decision.limit}). Inténtalo mañana.`;
}