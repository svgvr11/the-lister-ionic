/**
 * Opciones de inicio de sesión con Google (lógica pura y sin dependencias).
 *
 * El `prompt: 'select_account'` es lo que obliga a Google a mostrar SIEMPRE el
 * selector de cuenta: sin él, Google reutiliza su sesión del navegador del sistema
 * (Custom Tabs en el APK, el propio navegador en web) y entra directo con la última
 * cuenta, sin dejar elegir otra. Vale tanto en nativo como en web.
 *
 * Otras opciones de Google descartadas:
 * - `prompt: 'consent'` pediría aceptar permisos en cada login (fricción inútil).
 * - `prompt: 'login'` re-pide la contraseña pero NO muestra el selector si solo hay
 *   una sesión; `select_account` sí muestra la lista (y "usar otra cuenta").
 * - `access_type: 'offline'` pediría refresh tokens de Google que no usamos.
 */
export interface GoogleOAuthOptions {
  redirectTo: string;
  skipBrowserRedirect: boolean;
  queryParams: { prompt: string };
}

/** Construye las opciones de `signInWithOAuth` para Google. Probada en Node. */
export function buildGoogleOAuthOptions(isNative: boolean, redirectTo: string): GoogleOAuthOptions {
  return {
    redirectTo,
    skipBrowserRedirect: isNative,
    queryParams: { prompt: 'select_account' },
  };
}
