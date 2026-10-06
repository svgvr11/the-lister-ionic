/**
 * EDGE FUNCTION: delete-account
 *
 * Borrado de cuenta (exigencia de Google Play). Cableado fino: CORS, solo POST,
 * JWT del usuario con `anonClient().auth.getUser(token)` y llamada a la lógica
 * de `./core.ts` con el cliente `service_role`. La lógica no importa nada de
 * Deno ni de URLs, así que los tests la ejercitan en Node con un cliente simulado.
 *
 * CONFIGURACIÓN (Dashboard > Edge Functions > delete-account):
 *   - verify_jwt = true (obligatorio; el userId sale del JWT verificado, nunca
 *     del cuerpo — el cuerpo ni siquiera se lee).
 *   - Supabase inyecta SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  FEEDBACK_BUCKET,
  extractBearerToken,
  scrubSensitiveText,
} from '../_shared/feedback-core.ts';
import { deleteAccount, DeleteAccountError } from './core.ts';

/** Cabeceras de CORS, iguales que en `submit-feedback`. */
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

/** Log sin datos personales: nunca el token, el id ni las rutas completas. */
function log(stage: string, detail?: string): void {
  console.log(`[delete-account] ${stage}${detail ? `: ${detail}` : ''}`);
}

/** Cliente con service_role: el único que puede saltarse la RLS y borrar Auth. */
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
 * `persistSession: false` y `autoRefreshToken: false` son obligatorios en una
 * Edge Function (runtime efímero, sin navegador); `detectSessionInUrl: false`
 * evita que interprete el hash de la URL como sesión PKCE.
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

Deno.serve(async (req: Request): Promise<Response> => {
  // OPTIONS: el preflight del navegador de supabase-js llega antes del POST.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  // ── Usuario: sale SIEMPRE del JWT verificado, nunca del cuerpo ──
  // (El cuerpo ni se lee: aunque trajera un `user_id`, se ignora.)
  const token = extractBearerToken(req.headers.get('Authorization'));
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

  try {
    await deleteAccount(adminClient(), userId, { bucket: FEEDBACK_BUCKET });
    log('cuenta eliminada');
    return json({ ok: true }, 200);
  } catch (error) {
    const userless = (value: string): string =>
      scrubSensitiveText(value, 1000).replaceAll(userId, '[id]');
    if (error instanceof DeleteAccountError) {
      log('rechazado', `phase=${error.phase} ${userless(error.logDetail ?? '')}`);
      return json({ ok: false, error: error.message }, 500);
    }
    const errorName = error instanceof Error ? error.name : 'desconocido';
    const errorMessage = error instanceof Error ? userless(error.message).slice(0, 300) : '';
    log('error inesperado', `name=${errorName} message=${errorMessage}`);
    return json(
      { ok: false, error: 'No se pudo eliminar la cuenta. Inténtalo de nuevo.' },
      500
    );
  }
});
