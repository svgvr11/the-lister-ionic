import { describe, expect, it } from 'vitest';
import {
  esEnvioCorrecto,
  mensajeErrorDeEnvio,
  mensajeParaError,
  mensajeRespuestaNoOk,
  mensajeSinConexion,
  mensajeSinSesion
} from './feedback-messages';

/**
 * Pruebas de los mensajes de error del envío de comentarios.
 *
 * Lo importante es que cada fallo tenga un texto que el usuario pueda entender y que no
 * se filtre un detalle técnico donde no toca.
 */
describe('feedback-messages: según el código de error', () => {
  it('sin status es un fallo de red', () => {
    expect(mensajeParaError({ message: 'Failed to fetch' })).toMatch(/Revisa la conexión/);
    expect(mensajeParaError({})).toMatch(/Revisa la conexión/);
    expect(mensajeParaError(null)).toMatch(/Revisa la conexión/);
  });

  it('401 pide iniciar sesión', () => {
    expect(mensajeParaError({ status: 401, message: 'jwt expirado' })).toBe(
      'Inicia sesión para enviar comentarios.'
    );
  });

  it('429 avisa de demasiados envíos', () => {
    expect(mensajeParaError({ status: 429, message: 'rate limit' })).toBe(
      'Has enviado demasiados comentarios. Inténtalo más tarde.'
    );
  });

  it('413 avisa del tamaño de las imágenes', () => {
    expect(mensajeParaError({ status: 413, message: 'too large' })).toBe(
      'Las imágenes son demasiado grandes. Adjunta menos o más pequeñas.'
    );
  });

  it('5xx es fallo del servidor', () => {
    for (const status of [500, 502, 503, 599]) {
      expect(mensajeParaError({ status, message: 'boom' }), `status ${status}`).toBe(
        'El servidor no ha podido guardar el reporte. Inténtalo en un momento.'
      );
    }
  });

  it('otros 4xx con mensaje respetan el texto del servidor', () => {
    // El servidor ya pensó ese texto para el usuario (validación de campos).
    expect(mensajeParaError({ status: 400, message: 'Falta el tipo de reporte.' })).toBe(
      'Falta el tipo de reporte.'
    );
  });

  it('otros 4xx sin mensaje caen en el genérico', () => {
    expect(mensajeParaError({ status: 400 })).toBe('No se pudo enviar el reporte. Inténtalo de nuevo.');
    expect(mensajeParaError({ status: 404 })).toBe('No se pudo enviar el reporte. Inténtalo de nuevo.');
  });
});

describe('feedback-messages: otros casos', () => {
  it('una excepción siempre es transitoria', () => {
    expect(mensajeErrorDeEnvio()).toMatch(/Revisa la conexión/);
  });

  it('una respuesta sin error ni éxito usa el mensaje del servidor', () => {
    expect(mensajeRespuestaNoOk({ ok: false, error: 'El reporte está duplicado.' })).toBe(
      'El reporte está duplicado.'
    );
  });

  it('una respuesta vacía cae en el genérico', () => {
    for (const respuesta of [null, undefined, {}, { ok: false }]) {
      expect(mensajeRespuestaNoOk(respuesta as never)).toBe(
        'No se pudo enviar el reporte. Inténtalo de nuevo.'
      );
    }
  });

  it('solo ok:true es éxito', () => {
    expect(esEnvioCorrecto({ ok: true })).toBe(true);
    expect(esEnvioCorrecto({ ok: false })).toBe(false);
    expect(esEnvioCorrecto(null)).toBe(false);
    expect(esEnvioCorrecto({})).toBe(false);
  });

  it('avisos de conexión y sesión', () => {
    expect(mensajeSinConexion()).toBe('Sin conexión: no se puede enviar ahora.');
    expect(mensajeSinSesion()).toBe('Inicia sesión para enviar comentarios.');
  });
});
