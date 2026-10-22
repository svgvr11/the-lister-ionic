import { Session } from '@supabase/supabase-js';

/**
 * Cliente de Supabase falso para las pruebas.
 *
 * Sustituye al `SupabaseClient` real para que los repositorios se puedan probar sin red
 * ni credenciales. Es configurable: cada prueba dice qué debe devolver cada consulta, y
 * el helper guarda todas las llamadas para poder comprobarlas después.
 */

/**
 * Respuesta de la búsqueda: un valor fijo, o una función que recibe el número de
 * búsqueda (empezando en 0) para simular que la fila aparece más adelante.
 */
export type FilaFalsa = ((numeroDeBusqueda: number) => unknown) | Record<string, unknown> | null;

/** Error con la misma forma que devuelve supabase-js. */
export interface FakeSupabaseError {
  code?: string;
  message: string;
}

/** Respuesta configurable de cada consulta. */
export interface FakeSupabaseOpciones {
  /** Fila que devuelve la búsqueda (`select().eq().maybeSingle()`). */
  fila?: FilaFalsa;
  errorBusqueda?: FakeSupabaseError | null;
  /** Fila que devuelve la creación (`insert().select().single()`). */
  filaInsertada?: unknown;
  errorInsert?: FakeSupabaseError | null;
  /**
   * Fila que devuelve el guardado (`update().eq()…select().maybeSingle()`).
   * Igual que `fila`, admite una función del número de guardado (empezando en 0),
   * que es la forma de simular que el primer intento no casa y el reintento sí.
   */
  filaActualizada?: FilaFalsa;
  errorActualizacion?: FakeSupabaseError | null;
  /**
   * Emite por el canal de realtime el eco de la propia escritura. Es justo lo que hace
   * Supabase al guardar: devuelve el mismo cambio que se acaba de hacer.
   */
  ecoPropioEnUpdate?: boolean;
}

/** Evento del canal de realtime. */
interface EventoRealtime {
  evento: 'UPDATE' | 'INSERT';
  filtro: unknown;
  cb: (payload: { new: unknown }) => void;
}

/** Cliente falso, con todo lo que se necesita para inspeccionarlo. */
export interface FakeSupabase {
  /** El cliente, para pasarlo como `supabaseClient`. */
  cliente: unknown;
  /** Historial legible de llamadas: `select:id, title`, `eq:owner_id:user-1`, `update`… */
  llamadas: string[];
  /** Payload del último `insert`. */
  insertado: Record<string, unknown> | null;
  /** Payload del último `update`. */
  actualizado: Record<string, unknown> | null;
  /** `true` si el canal de realtime llegó a suscribirse. */
  suscrito: boolean;
  /** Número de búsquedas (`select().eq().maybeSingle()`) hechas hasta ahora. */
  totalBusquedas: number;
  /** Emite un cambio por el canal, como haría Supabase. */
  emitirCambio: (nuevo: unknown) => void;
  /** Opciones en uso, por si una prueba quiere ajustarlas a mitad de camino. */
  opciones: FakeSupabaseOpciones;
}

/** Crea un cliente falso con las respuestas indicadas. */
export function fakeSupabase(opciones: FakeSupabaseOpciones = {}): FakeSupabase {
  const llamadas: string[] = [];
  const eventos: EventoRealtime[] = [];
  let busquedasHechas = 0;
  let updatesHechos = 0;
  let suscrito = false;
  let insertado: Record<string, unknown> | null = null;
  let actualizado: Record<string, unknown> | null = null;

  /** Constructor encadenado: `from('boards').update({…}).eq(…).select(…).maybeSingle()`. */
  const consulta = (tabla: string) => {
    let modo: 'select' | 'insert' | 'update' | null = null;

    const encadenado = {
      select: (columnas: string) => {
        llamadas.push(`${tabla}.select:${columnas}`);
        return encadenado;
      },
      insert: (payload: Record<string, unknown>) => {
        modo = 'insert';
        insertado = payload;
        llamadas.push(`${tabla}.insert`);
        return encadenado;
      },
      update: (payload: Record<string, unknown>) => {
        modo = 'update';
        actualizado = payload;
        llamadas.push(`${tabla}.update`);
        return encadenado;
      },
      eq: (columna: string, valor: unknown) => {
        llamadas.push(`eq:${columna}:${String(valor)}`);
        return encadenado;
      },
      maybeSingle: () => {
        llamadas.push(`maybeSingle:${modo ?? 'select'}`);
        // El eco de la propia escritura llega por realtime antes de que el guardado
        // resuelva: es el caso que el repositorio debe reconocer y descartar.
        if (modo === 'update' && opciones.ecoPropioEnUpdate && actualizado) {
          for (const evento of eventos) {
            evento.cb({
              new: { id: actualizado['id'], updated_at: actualizado['updated_at'] }
            });
          }
        }
        if (modo === 'update') {
          const numero = updatesHechos++;
          const filaUpdate = typeof opciones.filaActualizada === 'function'
            ? opciones.filaActualizada(numero)
            : opciones.filaActualizada;
          return Promise.resolve({
            data: filaUpdate ?? null,
            error: opciones.errorActualizacion ?? null
          });
        }
        const numero = busquedasHechas++;
        const fila = typeof opciones.fila === 'function'
          ? opciones.fila(numero)
          : opciones.fila;
        return Promise.resolve({ data: fila ?? null, error: opciones.errorBusqueda ?? null });
      },
      single: () => {
        llamadas.push(`single:insert`);
        return Promise.resolve({
          data: opciones.filaInsertada ?? null,
          error: opciones.errorInsert ?? null
        });
      }
    };
    return encadenado;
  };

  const cliente = {
    from: (tabla: string) => consulta(tabla),
    realtime: {
      setAuth: (token: string) => {
        llamadas.push(`realtime.setAuth:${token}`);
        return Promise.resolve();
      }
    },
    channel: (nombre: string) => {
      llamadas.push(`channel:${nombre}`);
      const canal = {
        on: (evento: 'UPDATE' | 'INSERT', filtro: unknown, cb: (payload: { new: unknown }) => void) => {
          eventos.push({ evento, filtro, cb });
          llamadas.push(`on:${evento}`);
          return canal;
        },
        subscribe: () => {
          suscrito = true;
          llamadas.push('subscribe');
          return canal;
        }
      };
      return canal;
    },
    removeChannel: () => {
      llamadas.push('removeChannel');
      return Promise.resolve();
    }
  };

  return {
    cliente,
    llamadas,
    get insertado() {
      return insertado;
    },
    get actualizado() {
      return actualizado;
    },
    get suscrito() {
      return suscrito;
    },
    get totalBusquedas() {
      return busquedasHechas;
    },
    opciones,
    emitirCambio: (nuevo: unknown) => {
      for (const evento of eventos) evento.cb({ new: nuevo });
    }
  };
}

/** Sesión mínima de supabase-js: solo hacen falta el id y el token. */
export const fakeSession = (userId: string, token = 'token-de-prueba'): Session =>
  ({ user: { id: userId }, access_token: token }) as Session;
