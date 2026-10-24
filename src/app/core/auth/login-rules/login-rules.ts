/**
 * Reglas de la pantalla de inicio de sesión.
 *
 * Decide a dónde navegar al entrar, qué aviso mostrar y cuándo el botón se desbloquea.
 * Sin Angular ni DOM, para poder probarlo sin montar la página.
 */

/** A dónde hay que ir al abrir la pantalla de login. */
export type DestinoInicial =
  /** No hay nada que hacer aquí: se va al tablero. */
  | { tipo: 'ir-a'; ruta: '/board' }
  /** Se queda en el login esperando que el usuario pulse el botón. */
  | { tipo: 'quedarse'; aviso: string };

/** Lo que la página necesita saber al arrancar. */
export interface EstadoInicioLogin {
  /** ¿Hay credenciales de Supabase configuradas? */
  credenciales: boolean;
  /** Sesión ya disponible (leda del almacenamiento). */
  sesion: unknown;
  /** Aviso que viene en el estado de navegación, si lo hay. */
  aviso: string;
}

/**
 * Decide el primer movimiento de la pantalla de login.
 *
 * Sin credenciales la app va en modo local, así que el login no pinta nada: se va directo
 * al tablero. Con sesión ya iniciada, también. El aviso de borrado de cuenta se muestra
 * solo cuando la pantalla se queda (si se navega, el mensaje no se vería).
 */
export function decidirInicioLogin(estado: EstadoInicioLogin): DestinoInicial {
  if (!estado.credenciales) return { tipo: 'ir-a', ruta: '/board' };
  if (estado.sesion) return { tipo: 'ir-a', ruta: '/board' };
  return { tipo: 'quedarse', aviso: estado.aviso };
}

/** Texto del aviso que viaja en el estado de navegación. */
export function avisoDeNavegacion(estado: unknown): string {
  if (!estado || typeof estado !== 'object') return '';
  const deleteMessage = (estado as Record<string, unknown>)['deleteMessage'];
  return typeof deleteMessage === 'string' ? deleteMessage : '';
}

/**
 * Mensaje de error cuando el inicio de sesión falla.
 *
 * El de AuthService ya viene en español y pensado para el usuario; solo se sustituye si
 * no es un Error de verdad.
 */
export function mensajeErrorLogin(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.';
}

/**
 * Los enlaces legales, en nativo, se abren con el plugin Browser y hay que frenar el
 * click del enlace. En web se deja pasar y el propio enlace abre la pestaña.
 */
export function abrirConBrowserNativo(url: string, esNativo: boolean): boolean {
  if (!esNativo) return false;
  void url; // la llamada a Browser.open la hace la página
  return true;
}

/** Lo que hace falta saber para decidir si se desbloquea el botón al volver a la app. */
export interface EstadoReanudacion {
  credenciales: boolean;
  esNativo: boolean;
  /** La app vuelve a primer plano. */
  activa: boolean;
  /** Hay sesión (el login se completó). */
  sesion: unknown;
}

/**
 * Si el usuario vuelve del navegador sin completar el login, el botón se desbloquea: se
 * había quedado en `busy` esperando una sesión que no llegó.
 */
export function debeDesbloquearTrasReanudar(estado: EstadoReanudacion): boolean {
  if (!estado.credenciales || !estado.esNativo) return false;
  if (!estado.activa) return false;
  return !estado.sesion;
}
