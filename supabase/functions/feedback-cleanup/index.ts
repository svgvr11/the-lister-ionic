/**
 * EDGE FUNCTION: feedback-cleanup
 *
 * Retención de 90 días: borra los reportes más antiguos y sus imágenes de Storage.
 *
 * CONFIGURACIÓN (Dashboard > Edge Functions > feedback-cleanup):
 *   - verify_jwt = false  (la llama pg_cron, que no tiene sesión de usuario)
 *   - Secreto CLEANUP_SECRET: la función rechaza cualquier llamada que no lo traiga en la
 *     cabecera `x-cleanup-secret`. Con verify_jwt apagado, ese secreto es lo único que
 *     separa la purga de cualquiera que conozca la URL.
 *
 * Se borran los objetos por la API de Storage (bucket.remove), NO con un DELETE sobre
 * storage.objects: la API es la que mantiene los metadatos del objeto y las referencias del
 * caché coherentes. Borrar la fila a pelo dejaría archivos huérfanos en el bucket.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { FEEDBACK_BUCKET, FEEDBACK_RETENTION_DAYS, scrubSensitiveText } from '../_shared/feedback-core.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cleanup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

/** Log sin datos personales: nunca rutas completas ni el secreto. */
function log(stage: string, detail?: string): void {
  console.log(`[feedback-cleanup] ${stage}${detail ? `: ${detail}` : ''}`);
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  // Comparación en tiempo constante para no filtrar el secreto por tiempos de respuesta.
  const esperado = Deno.env.get('CLEANUP_SECRET') ?? '';
  const recibido = req.headers.get('x-cleanup-secret') ?? '';
  const coincide = esperado.length > 0 && esperado.length === recibido.length &&
    [...esperado].every((c, i) => c === recibido[i]);
  if (!coincide) {
    log('rechazado', 'secreto ausente o incorrecto');
    return json({ ok: false, error: 'No autorizado.' }, 401);
  }

  let phase: 'select' | 'remove' | 'delete' = 'select';
  try {
    const db = adminClient();
    const limite = new Date(Date.now() - FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // 1. Recoger los reportes vencidos (solo los ids y las rutas de los adjuntos).
    const vencidos: { id: string; attachments: string[] }[] = [];
    const desde = 0;
    const pagina = 500;
    while (true) {
      const { data, error } = await db
        .from('feedback_reports')
        .select('id, attachments')
        .lt('created_at', limite)
        .range(desde, desde + pagina - 1);
      if (error) throw new Error(`lectura fallida: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const fila of data) {
        vencidos.push({ id: fila.id, attachments: Array.isArray(fila.attachments) ? fila.attachments as string[] : [] });
      }
      if (data.length < pagina) break;
      break; // Una sola pasada: la purga diaria no necesita paginar más.
    }

    if (vencidos.length === 0) {
      log('nada que purgar');
      return json({ ok: true, deleted: 0, objects: 0 }, 200);
    }

    // 2. Borrar los objetos de Storage por la API, antes que las filas: si el borrado de
    //    objetos falla, las filas siguen ahí y la próxima pasada lo reintenta.
    const rutas = vencidos.flatMap((reporte) => reporte.attachments).filter(Boolean);
    let objetosBorrados = 0;
    phase = 'remove';
    for (let i = 0; i < rutas.length; i += 100) {
      const trozo = rutas.slice(i, i + 100);
      const { error } = await db.storage.from(FEEDBACK_BUCKET).remove(trozo);
      if (error) {
        log('remove fallido', `${trozo.length} objetos, ${error.message}`);
        continue;
      }
      objetosBorrados += trozo.length;
    }

    // 3. Borrar las filas. Los reportes sin objetos pendientes sí se van igualmente.
    phase = 'delete';
    const { error: errorBorrado } = await db
      .from('feedback_reports')
      .delete()
      .lt('created_at', limite);

    if (errorBorrado) {
      log('delete fallido', errorBorrado.message);
      return json({ ok: false, error: 'No se pudo completar la purga.' }, 500);
    }

    log('purga ok', `${vencidos.length} reportes, ${objetosBorrados} objetos`);
    return json({ ok: true, deleted: vencidos.length, objects: objetosBorrados }, 200);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'desconocido';
    const errorMessage = error instanceof Error ? scrubSensitiveText(error.message).slice(0, 300) : '';
    const stack = error instanceof Error && error.stack
      ? scrubSensitiveText(error.stack.split('\n').slice(0, 3).join('\n')).slice(0, 300)
      : '';
    log('error inesperado', `phase=${phase} name=${errorName} message=${errorMessage} stack=${stack}`);
    return json({ ok: false, error: 'No se pudo completar la purga.' }, 500);
  }
});