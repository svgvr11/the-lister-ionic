/**
 * EDGE FUNCTION: submit-feedback
 *
 * Recibe el reporte del modal, lo guarda y avisa por correo con Resend.
 *
 * CONFIGURACIÓN (Dashboard > Edge Functions > submit-feedback, o supabase/config.toml):
 *   - verify_jwt = true  (obligatorio; es lo que hace que getUser() reciba un usuario real)
 *   - Secretos: RESEND_API_KEY y FEEDBACK_TO
 *   - Supabase inyecta SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY.
 *
 * DECISIONES DE SEGURIDAD:
 *   - El user_id sale SIEMPRE de auth.getUser() (el JWT verificado), nunca del cuerpo. Aunque
 *     un cliente mandara user_id=otro, se ignora.
 *   - Sin usuario válido → 401 antes de tocar nada.
 *   - El tipo de cada imagen se decide por sus primeros bytes, no por la extensión ni por el
 *     Content-Type declarados, y el nombre del archivo lo genera el servidor (crypto.randomUUID).
 *   - Los errores que se devuelven al usuario son genéricos. Los detalles van al log, y el log
 *     nunca lleva el mensaje del usuario, su correo ni sus imágenes.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  FEEDBACK_BUCKET,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_APP_NAME,
  MAX_DIAGNOSTICS_BYTES,
  MAX_IMAGES,
  MAX_REQUEST_BYTES,
  RATE_LIMIT_PER_DAY,
  RATE_LIMIT_PER_HOUR,
  SIGNED_URL_TTL_SECONDS,
  buildFeedbackImagePath,
  buildEmailSubject,
  buildFromHeader,
  checkImageBatch,
  checkImageSize,
  checkRateLimit,
  detectImageMime,
  escapeHtml,
  extractBearerToken,
  isFeedbackType,
  isValidContactEmail,
  normalizeContactEmail,
  rateLimitMessage,
  readImageBytes,
  sanitizeDiagnostics,
  sanitizeHeaderText,
  scrubSensitiveText,
  validateMessage
} from '../_shared/feedback-core.ts';

type FeedbackImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** Cabeceras de CORS. Se reflejan las que envía supabase-js, incluida `apikey`. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

/** Error con el estado y el mensaje que verá el usuario; el detalle va solo al log. */
class FeedbackError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly logDetail?: string
  ) {
    super(message);
  }
}

/** Log sin datos personales: nunca el mensaje, el correo, el diagnóstico ni las imágenes. */
function log(stage: string, detail?: string): void {
  console.log(`[submit-feedback] ${stage}${detail ? `: ${detail}` : ''}`);
}

interface UploadedImage {
  /** Ruta dentro del bucket, la que se guarda en la fila. */
  path: string;
  mime: FeedbackImageMime;
}

/**
 * Lee los archivos del multipart, los valida por sus bytes y los sube.
 *
 * El nombre del objeto lo pone el servidor (crypto.randomUUID + extensión del tipo REAL). El
 * nombre que envía el cliente no se usa para nada: solo el tamaño y el contenido se leen del
 * archivo, y un nombre de archivo puede llevar rutas, extensión falsa o lo que quiera.
 */
async function uploadImages(
  files: File[],
  storage: ReturnType<SupabaseClient['storage']>,
  userId: string,
  reportId: string,
  uploadedPaths: string[]
): Promise<UploadedImage[]> {
  const batch = checkImageBatch(files.map((file) => file.size));
  if (!batch.ok) {
    throw new FeedbackError(
      files.length > MAX_IMAGES ? 400 : 413,
      batch.error
    );
  }

  const subidas: UploadedImage[] = [];
  for (const file of files) {
    const sizeCheck = checkImageSize(file.size);
    if (!sizeCheck.ok) {
      throw new FeedbackError(400, sizeCheck.error);
    }
    const bytes = await readImageBytes(file);
    // Solo se leen los primeros bytes para el tipo, pero el archivo entero se sube tal cual.
    const mime = detectImageMime(bytes.subarray(0, 16));
    if (!mime) {
      throw new FeedbackError(400, 'Una de las imágenes no es un PNG, JPEG o WebP válido.');
    }

    const path = buildFeedbackImagePath(userId, reportId, crypto.randomUUID(), mime);
    const { error } = await storage.from(FEEDBACK_BUCKET).upload(path, bytes, {
      contentType: mime,
      // El bucket es privado: si alguien cambia la configuración, el objeto sigue sin ser público.
      upsert: false
    });
    if (error) {
      throw new FeedbackError(500, 'No se pudo guardar el reporte. Inténtalo de nuevo.', `upload falló: ${error.message}`);
    }
    uploadedPaths.push(path);
    subidas.push({ path, mime });
  }

  return subidas;
}

/** Si algo falla después de subir, se borra lo ya subido para no dejar archivos huérfanos. */
async function cleanupUploads(
  storage: ReturnType<SupabaseClient['storage']>,
  paths: string[],
  phase: 'parse' | 'validate' | 'upload' | 'insert' | 'sign' | 'email'
): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await storage.from(FEEDBACK_BUCKET).remove(paths);
    if (error) {
      let detail = scrubSensitiveText(error.message);
      for (const path of paths) detail = detail.replaceAll(path, '[ruta]');
      log('limpieza fallida', `${paths.length} objetos, ${detail}`);
    }
    else log('limpieza ok', `${paths.length} objetos`);
  } catch (error) {
    const safeDetail = (value: string): string => {
      let detail = scrubSensitiveText(value);
      for (const path of paths) detail = detail.replaceAll(path, '[ruta]');
      return detail;
    };
    const errorName = error instanceof Error ? error.name : 'desconocido';
    const errorMessage = error instanceof Error ? safeDetail(error.message).slice(0, 300) : '';
    const stack = error instanceof Error && error.stack
      ? safeDetail(error.stack.split('\n').slice(0, 3).join('\n')).slice(0, 300)
      : '';
    log('limpieza con excepción', `phase=${phase} name=${errorName} message=${errorMessage} stack=${stack}`);
  }
}

/**
 * Inserta la fila del reporte. Se genera el id en el servidor (para poder construir la ruta de
 * las imágenes antes de subirlas y dejarlas todas bajo el mismo id).
 */
async function insertReport(
  db: SupabaseClient,
  campos: {
    id: string;
    userId: string;
    type: string;
    message: string;
    contactEmail: string | null;
    diagnostics: unknown;
    attachments: string[];
  }
): Promise<void> {
  const { error } = await db.from('feedback_reports').insert({
    id: campos.id,
    user_id: campos.userId,
    type: campos.type,
    message: campos.message,
    contact_email: campos.contactEmail,
    diagnostics: campos.diagnostics,
    attachments: campos.attachments
  });
  if (error) {
    throw new FeedbackError(500, 'No se pudo guardar el reporte. Inténtalo de nuevo.', `insert falló: ${error.message}`);
  }
}

/** Cuenta los reportes recientes del usuario para el límite de frecuencia. */
async function countRecentReports(db: SupabaseClient, userId: string): Promise<string[]> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('feedback_reports')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', desde)
    .limit(RATE_LIMIT_PER_DAY + 5);
  if (error) {
    throw new FeedbackError(500, 'No se pudo guardar el reporte. Inténtalo de nuevo.', `rate limit: ${error.message}`);
  }
  return (data ?? []).map((row: { created_at: string }) => row.created_at);
}

// ─── Correo ───────────────────────────────────────────────────────────────────

interface MailContent {
  subject: string;
  html: string;
  text: string;
}

/** Aplana un valor del diagnóstico a texto para las dos versiones del correo. */
function flattenValue(clave: string, valor: unknown): [string, string][] {
  if (valor === undefined || valor === null) return [];
  if (typeof valor === 'object') {
    // counts es un objeto de tres números; recentErrors se trata aparte.
    const partes = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v === null || typeof v !== 'object')
      .map(([k, v]) => `${k}: ${String(v)}`);
    return partes.length ? [[clave, partes.join(', ')]] : [];
  }
  return [[clave, String(valor)]];
}

/**
 * Arma el correo con TODO el contenido del usuario escapado: mensaje, correo de contacto y
 * valores del diagnóstico. Si alguien escribe "<script>", sale como texto, no como etiqueta.
 *
 * No se incluye el contenido de las listas ni el correo de la cuenta: solo lo que el usuario
 * escribió a mano y los datos técnicos que marcó explícitamente.
 */
function buildMail(datos: {
  type: string;
  message: string;
  contactEmail: string | null;
  diagnostics: Record<string, unknown>;
  reportId: string;
  userId: string;
  enlaces: { path: string; url: string }[];
}): MailContent {
  const id = isFeedbackType(datos.type) ? datos.type : 'other';
  const label = FEEDBACK_TYPE_LABELS[id];
  const asunto = buildEmailSubject(datos.type, datos.message);

  const diag = datos.diagnostics ?? {};
  const filas: [string, string][] = Object.entries(diag)
    .filter(([clave]) => clave !== 'recentErrors')
    .flatMap(([clave, valor]) => flattenValue(clave, valor));

  const recentErrors = Array.isArray(diag['recentErrors']) ? (diag['recentErrors'] as { message?: string }[]) : [];
  const lineasErrores = recentErrors
    .map((error) => error?.message ?? '')
    .filter(Boolean)
    .map((mensaje) => escapeHtml(mensaje))
    .join('\n');

  const imagenes = datos.enlaces.length
    ? datos.enlaces
        .map((e, i) => `<li><a href="${escapeHtml(e.url)}">Imagen ${i + 1}</a></li>`)
        .join('')
    : '<li><em>Sin imágenes adjuntas.</em></li>';

  const filasHtml = filas
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td>` +
      `<td style="padding:4px 0;color:#111;word-break:break-word;">${escapeHtml(v)}</td></tr>`)
    .join('');

const html = `<!doctype html><html><body style="margin:0;padding:16px;background:#f6f7fa;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
    <h1 style="margin:0 0 4px;font-size:17px;color:#111;">Nuevo reporte de comentarios</h1>
    <p style="margin:0 0 16px;font-size:12px;color:#666;">Recibido desde The Lister.</p>

    <p style="margin:0 0 6px;font-size:12px;color:#666;">Tipo</p>
    <p style="margin:0 0 14px;font-size:14px;color:#111;font-weight:600;">${escapeHtml(label)}</p>

    <p style="margin:0 0 6px;font-size:12px;color:#666;">Mensaje</p>
    <div style="margin:0 0 14px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#111;white-space:pre-wrap;word-break:break-word;">${escapeHtml(datos.message)}</div>

    ${datos.contactEmail
      ? `<p style="margin:0 0 14px;font-size:12px;color:#666;">Respuesta a: <strong style="color:#111;">${escapeHtml(datos.contactEmail)}</strong></p>`
      : '<p style="margin:0 0 14px;font-size:12px;color:#666;">Sin correo de contacto.</p>'}

    <p style="margin:0 0 6px;font-size:12px;color:#666;">Imágenes (${datos.enlaces.length}) — los enlaces caducan en 7 días</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:13px;">${imagenes}</ul>

    <p style="margin:0 0 6px;font-size:12px;color:#666;">Información técnica</p>
    ${filasHtml ? `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:12px;">${filasHtml}</table>` : '<p style="margin:0 0 16px;font-size:12px;color:#888;">No se envió información técnica.</p>'}

    ${lineasErrores
      ? `<p style="margin:0 0 6px;font-size:12px;color:#666;">Errores recientes</p>
         <pre style="margin:0 0 16px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:11px;color:#111;white-space:pre-wrap;word-break:break-word;">${lineasErrores}</pre>`
      : ''}

    <p style="margin:16px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#888;">
      Id del reporte: ${escapeHtml(datos.reportId)}<br>
      Id de usuario: ${escapeHtml(datos.userId)}
    </p>
  </div>
</body></html>`;

  const lineas = [
    `Nuevo reporte de comentarios (${label})`,
    '',
    'Mensaje:',
    datos.message,
    '',
    datos.contactEmail ? `Respuesta a: ${datos.contactEmail}` : 'Sin correo de contacto.',
    '',
    `Imágenes (${datos.enlaces.length}) — los enlaces caducan en 7 días:`,
    ...(datos.enlaces.length ? datos.enlaces.map((e, i) => `${i + 1}. ${e.url}`) : ['- Sin imágenes adjuntas.']),
    '',
    'Información técnica:',
    ...(filas.length ? filas.map(([k, v]) => `- ${k}: ${v}`) : ['- No se envió información técnica.']),
    '',
    ...(lineasErrores ? ['Errores recientes:', lineasErrores, ''] : []),
    `Id del reporte: ${datos.reportId}`,
    `Id de usuario: ${datos.userId}`
  ];

  return { subject: asunto, html, text: lineas.join('\n') };
}

/**
 * Envía el correo por la API HTTP de Resend (fetch, sin dependencias).
 *
 * Si el envío falla, la función NO da error al usuario: el reporte ya está en la tabla y es lo
 * único que no se puede recuperar. Se registra el fallo (sin datos personales) y se responde ok.
 */
async function sendMail(mail: MailContent, replyTo: string | null, type: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    log('correo sin RESEND_API_KEY');
    return;
  }
  // Por defecto va a la misma dirección de la app; se puede cambiar con el secreto.
  const to = Deno.env.get('FEEDBACK_TO') ?? 'feedback@soporte.atenis.app';
  const fromAddress = to; // se usa la misma dirección que el destinatario por defecto

  const cuerpo: Record<string, unknown> = {
    from: buildFromHeader(type, fromAddress),
    to: [to],
    subject: sanitizeHeaderText(mail.subject),
    html: mail.html,
    text: mail.text
  };
  // reply_to solo si el usuario dejó un correo; nunca el de la cuenta.
  if (replyTo) cuerpo['reply_to'] = replyTo;

  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });

  // Solo el código y el estado: el detalle de Resend puede devolver parte del contenido.
  if (!respuesta.ok) log('correo fallido', `${respuesta.status} ${respuesta.statusText}`);
}

/** Cliente con service_role: el único que puede saltarse la RLS de la tabla y el bucket. */
function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(
    url,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Cliente SOLO para resolver el usuario del JWT con `getUser(token)`.
 *
 * `persistSession: false` y `autoRefreshToken: false` son obligatorios en una Edge Function:
 * no hay navegador ni almacenamiento, y el runtime es efímero. `detectSessionInUrl: false`
 * evita que intente interpretar el hash de la URL como una sesión PKCE.
 *
 * La clave que se usa es SUPABASE_ANON_KEY, que Supabase inyecta sola. En proyectos con el
 * nuevo formato de claves llega como `sb_publishable_...` en lugar de un JWT: es una clave
 * publicable y va en la cabecera `apikey`, que es exactamente para lo que sirve aquí (el
 * usuario lo aporta en el `Authorization`, que es lo que valida GoTrue).
 */
function anonClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

/**
 * Lee el multipart y separa campos de archivos. Un campo de texto repetido se queda con el
 * primero, así que un campo duplicado no puede duplicar el efecto.
 */
function readForm(form: FormData): { campos: Record<string, string>; archivos: File[] } {
  const campos: Record<string, string> = {};
  const archivos: File[] = [];
  for (const [clave, valor] of form.entries()) {
    if (typeof valor === 'string') {
      if (!(clave in campos)) campos[clave] = valor;
      continue;
    }
    // Un campo más de los permitidos se descarta aquí: el error se da en la validación.
    if (archivos.length <= MAX_IMAGES) archivos.push(valor);
  }
  return { campos, archivos };
}

Deno.serve(async (req: Request): Promise<Response> => {
  // OPTIONS: el preflight del navegador de supabase-js llega antes del POST.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  // ── Usuario: sale SIEMPRE del JWT verificado, nunca del cuerpo del request ──
  //
  // Logs de diagnóstico, SIN datos personales: no se escribe el token, ni el correo del
  // usuario, ni su id. Solo si llegó la cabecera, si venía en forma Bearer, cuánto mide el
  // token y, si getUser falla, el mensaje del error de GoTrue (que habla de formato, no de
  // contenido). Con esto se distingue de un vistazo entre "no llegó cabecera", "llegó
  // mal formada", "SUPABASE_ANON_KEY vacía" y "el JWT caducó".
  const authHeader = req.headers.get('Authorization');
  const token = extractBearerToken(authHeader);
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  log(
    'auth: inicio',
    `cabecera=${authHeader ? 'si' : 'no'} bearer=${authHeader?.startsWith('Bearer ') ? 'si' : 'no'} ` +
      `token_chars=${token ? token.length : 0} anon_key_set=${anonKey ? 'si' : 'no'}`
  );

  if (!token) return json({ ok: false, error: 'Necesitas iniciar sesión.' }, 401);

  const { data: usuario, error: errorAuth } = await anonClient().auth.getUser(token);
  if (errorAuth || !usuario?.user) {
    log(
      'auth: getUser falló',
      `error=${errorAuth?.message ?? 'sin usuario devuelto'} status=${errorAuth?.status ?? 0} ` +
        `code=${errorAuth?.code ?? '-'}`
    );
    return json({ ok: false, error: 'Necesitas iniciar sesión.' }, 401);
  }

  const userId = usuario.user.id;
  log('auth: ok', 'usuario resuelto del JWT');

  const subidas: string[] = [];
  let phase: 'parse' | 'validate' | 'upload' | 'insert' | 'sign' | 'email' = 'parse';
  let reportId: string | null = null;
  let db: SupabaseClient | null = null;
  try {
    // Tope de petición ANTES de leer el cuerpo: si el Content-Length ya no cabe, se rechaza
    // sin llegar a parsear los archivos. MAX_REQUEST_BYTES lleva un margen para multipart.
    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw new FeedbackError(413, 'Las imágenes son demasiado grandes. Adjunta menos o más pequeñas.');
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      // Cuerpo ilegible o demasiado grande para el runtime: no se intenta seguir.
      throw new FeedbackError(413, 'El reporte es demasiado grande para enviarlo.');
    }

    const { campos, archivos } = readForm(form);

    // ── Validación en el servidor. Nada de lo que llega se toma por bueno.
    phase = 'validate';
    const type = campos['type'] ?? '';
    if (!isFeedbackType(type)) throw new FeedbackError(400, 'El tipo de comentario no es válido.');

    const mensaje = validateMessage(campos['message']);
    if (!mensaje.ok) {
      throw new FeedbackError(400, mensaje.error);
    }

    const contactoBruto = campos['contact_email'] ?? '';
    if (!isValidContactEmail(contactoBruto)) {
      throw new FeedbackError(400, 'Ese correo no parece válido.');
    }
    const contactEmail = normalizeContactEmail(contactoBruto);

    const diagBruto = campos['diagnostics'] ?? '';
    let diagnostics: Record<string, unknown> = {};
    if (diagBruto) {
      if (diagBruto.length > MAX_DIAGNOSTICS_BYTES) {
        throw new FeedbackError(400, 'La información técnica es demasiado extensa para enviarla.');
      }
      try {
        // Se vuelve a pasar por la lista blanca del servidor: aunque el cliente mandara de más,
        // aquí se descarta. El cliente no es de fiar.
        diagnostics = sanitizeDiagnostics(JSON.parse(diagBruto));
      } catch {
        throw new FeedbackError(400, 'La información técnica no se pudo leer.');
      }
    }

    if (archivos.length > MAX_IMAGES) {
      throw new FeedbackError(400, `Puedes adjuntar hasta ${MAX_IMAGES} imágenes por reporte.`);
    }

    db = adminClient();

    // Límite de frecuencia: cuenta filas reales de este usuario en las dos ventanas.
    const recientes = await countRecentReports(db, userId);
    const decision = checkRateLimit(recientes, new Date());
    if (!decision.allowed) throw new FeedbackError(429, rateLimitMessage(decision));

    // ── Flujo: subir imágenes → insertar la fila → firmar enlaces → correo.
    reportId = crypto.randomUUID();
    phase = 'upload';
    const imagenes = await uploadImages(archivos, db.storage, userId, reportId, subidas);

    phase = 'insert';
    await insertReport(db, {
      id: reportId,
      userId,
      type,
      message: mensaje.value,
      contactEmail,
      diagnostics,
      attachments: imagenes.map((imagen) => imagen.path)
    });

    // URLs firmadas de 7 días: el bucket es privado, así que sin firma no se puede abrir.
    phase = 'sign';
    const enlaces: { path: string; url: string }[] = [];
    for (const imagen of imagenes) {
      const { data: firmada, error: errorFirma } = await db.storage
        .from(FEEDBACK_BUCKET)
        .createSignedUrl(imagen.path, SIGNED_URL_TTL_SECONDS);
      if (errorFirma) {
        // Sin enlace no se rompe nada: el reporte sigue guardado y el correo sale sin esa imagen.
        log('firma fallida', errorFirma.message);
        continue;
      }
      enlaces.push({ path: imagen.path, url: firmada.signedUrl });
    }

    phase = 'email';
    const mail = buildMail({
      type,
      message: mensaje.value,
      contactEmail,
      diagnostics,
      reportId,
      userId,
      enlaces
    });

    // El correo es lo último: si falla, el reporte ya está y eso es lo importante.
    try {
      await sendMail(mail, contactEmail, type);
    } catch (error) {
      log('correo con excepción', error instanceof Error ? error.name : 'desconocida');
    }

    log('reporte guardado', `${imagenes.length} imágenes`);
    return json({ ok: true }, 200);
  } catch (error) {
    // Cualquier fallo tras subir imágenes borra lo subido: no quedan adjuntos huérfanos.
    if (subidas.length > 0 && db) await cleanupUploads(db.storage, subidas, phase);

    const sensitiveValues = [userId, reportId, ...subidas].filter((value): value is string => Boolean(value));
    const safeDetail = (value: string): string => {
      let sanitized = scrubSensitiveText(value, 1000);
      for (const sensitiveValue of sensitiveValues) {
        sanitized = sanitized.replaceAll(sensitiveValue, '[id]');
      }
      return sanitized;
    };

    if (error instanceof FeedbackError) {
      log('rechazado', `phase=${phase} ${error.status} ${safeDetail(error.logDetail ?? '')}`);
      return json({ ok: false, error: error.message }, error.status);
    }
    const errorName = error instanceof Error ? error.name : 'desconocido';
    const errorMessage = error instanceof Error ? safeDetail(error.message).slice(0, 300) : '';
    const stack = error instanceof Error && error.stack
      ? safeDetail(error.stack.split('\n').slice(0, 3).join('\n')).slice(0, 300)
      : '';
    log('error inesperado', `phase=${phase} name=${errorName} message=${errorMessage} stack=${stack}`);
    return json(
      { ok: false, error: 'No se pudo guardar el reporte. Inténtalo de nuevo.' },
      500
    );
  }
});