/**
 * Reglas del estado de conexión.
 *
 * El servicio escucha los eventos del navegador; aquí está la decisión de cuándo eso
 * merece un refresco del tablero, que es la única parte con regla.
 */

/**
 * Lee `navigator.onLine` con un valor seguro por defecto.
 *
 * El navegador solo sabe si el EQUIPO tiene red, no si llega a Supabase: si el entorno no
 * tiene `navigator` (pruebas, SSR) se asume que hay conexión, que es el caso que no
 * bloquea al usuario.
 */
export function leerConexionNavegador(onLine: boolean | undefined): boolean {
  return onLine !== false;
}

/**
 * ¿Hay que refrescar el tablero?
 *
 * Solo en el flanco offline → online. Un `online` repetido (o un `offline` que llega
 * tarde) no disparan nada: el evento ya se filtra en el servicio, pero la regla se repite
 * aquí para que quede probada y documentada.
 */
export function esFlancoDeReconexion(anterior: boolean, nuevo: boolean): boolean {
  return anterior === false && nuevo === true;
}
