import { describe, expect, it } from 'vitest';
import {
  avisoSinConexion,
  decidirCierre,
  decidirDescarte,
  estadoTrasEnviar,
  limpiezaAlCerrar,
  mensajeDemasiadoCorto,
  puedeEnviar,
  tieneContenido
} from './feedback-modal-state';
import { esFlancoDeReconexion, leerConexionNavegador } from '../../platform/connectivity-rules/connectivity-rules';

/** Estado del modal por defecto: recién abierto, vacío y sin enviar. */
const estado = (cambios: Partial<Parameters<typeof decidirCierre>[0]> = {}) => ({
  enviado: false,
  ocupado: false,
  confirmandoDescarte: false,
  tieneContenido: false,
  ...cambios
});

describe('feedback-modal-state: cerrar el modal', () => {
  it('un modal vacío se cierra sin preguntar', () => {
    expect(decidirCierre(estado())).toBe('cerrar');
  });

  it('con algo escrito hay que preguntar antes de perderlo', () => {
    // Escape o clic en el fondo son cierres accidentales.
    expect(decidirCierre(estado({ tieneContenido: true }))).toBe('preguntar');
  });

  it('con el envío ya hecho se cierra directo', () => {
    // La vista de confirmación no tiene nada que perder.
    expect(decidirCierre(estado({ tieneContenido: true, enviado: true }))).toBe('cerrar');
  });

  it('con un envío en curso no se cierra', () => {
    expect(decidirCierre(estado({ ocupado: true }))).toBe('nada');
    expect(decidirCierre(estado({ ocupado: true, tieneContenido: true }))).toBe('nada');
  });

  it('si ya se está preguntando, un segundo Escape no repite la pregunta', () => {
    expect(decidirCierre(estado({ confirmandoDescarte: true, tieneContenido: true }))).toBe('nada');
  });
});

describe('feedback-modal-state: qué se limpia al cerrar', () => {
  it('un envío correcto limpia todo', () => {
    expect(limpiezaAlCerrar({ enviado: true })).toEqual({
      borrarBorrador: true,
      resetearFormulario: true
    });
  });

  it('un fallo de red deja el texto para reintentar', () => {
    expect(limpiezaAlCerrar({ enviado: false })).toEqual({
      borrarBorrador: false,
      resetearFormulario: false
    });
  });

  it('descartar siempre limpia todo', () => {
    expect(decidirDescarte()).toEqual({
      soltarImagenes: true,
      resetearFormulario: true,
      borrarBorrador: true
    });
  });
});

describe('feedback-modal-state: resultado del envío', () => {
  it('un éxito pasa a la vista de confirmación', () => {
    expect(estadoTrasEnviar({ ok: true })).toEqual({ tipo: 'enviado' });
  });

  it('un fallo muestra el mensaje', () => {
    expect(estadoTrasEnviar({ ok: false, message: 'Sin sesión' })).toEqual({
      tipo: 'error',
      mensaje: 'Sin sesión'
    });
  });
});

describe('feedback-modal-state: botón de enviar', () => {
  it('se habilita con formulario válido, en línea y sin envío en curso', () => {
    expect(puedeEnviar({ ocupado: false, enviado: false, enLinea: true, valido: true })).toBe(true);
  });

  it('se deshabilita en cada situación que lo bloquea', () => {
    const base = { ocupado: false, enviado: false, enLinea: true, valido: true };
    expect(puedeEnviar({ ...base, ocupado: true })).toBe(false);
    expect(puedeEnviar({ ...base, enviado: true })).toBe(false);
    expect(puedeEnviar({ ...base, enLinea: false })).toBe(false);
    expect(puedeEnviar({ ...base, valido: false })).toBe(false);
  });

  it('el aviso de sin conexión solo aparece sin conexión', () => {
    expect(avisoSinConexion(false)).toBe('Sin conexión: no se puede enviar ahora.');
    expect(avisoSinConexion(true)).toBe('');
  });
});

describe('feedback-modal-state: contenido del borrador', () => {
  it('hay contenido con texto o con imágenes', () => {
    expect(tieneContenido('hola', 0)).toBe(true);
    expect(tieneContenido('', 1)).toBe(true);
    expect(tieneContenido('   ', 0)).toBe(false);
    expect(tieneContenido('', 0)).toBe(false);
  });

  it('el aviso de texto corto solo cuando hay algo escrito', () => {
    expect(mensajeDemasiadoCorto('', 15)).toBe(false);
    expect(mensajeDemasiadoCorto('   ', 15)).toBe(false);
    expect(mensajeDemasiadoCorto('hola', 15)).toBe(true);
    expect(mensajeDemasiadoCorto('a'.repeat(15), 15)).toBe(false);
  });
});

/**
 * El estado de conexión es del servicio `ConnectivityService`, pero la regla que decide
 * si merece un refresco está en `connectivity-rules.ts` y se prueba aquí al lado.
 */
describe('connectivity-rules: flanco de reconexión', () => {
  it('solo el paso de sin red a con red refresca', () => {
    expect(esFlancoDeReconexion(false, true)).toBe(true);
    expect(esFlancoDeReconexion(true, false)).toBe(false);
    expect(esFlancoDeReconexion(true, true)).toBe(false);
    expect(esFlancoDeReconexion(false, false)).toBe(false);
  });

  it('sin información de navigator se asume que hay conexión', () => {
    expect(leerConexionNavegador(undefined)).toBe(true);
    expect(leerConexionNavegador(undefined)).toBe(true);
    expect(leerConexionNavegador(false)).toBe(false);
    expect(leerConexionNavegador(true)).toBe(true);
  });
});
