import { describe, expect, it } from 'vitest';
import {
  abrirConBrowserNativo,
  avisoDeNavegacion,
  decidirInicioLogin,
  debeDesbloquearTrasReanudar,
  mensajeErrorLogin
} from './login-rules';

/** Pruebas de las reglas de la pantalla de inicio de sesión. */
describe('login-rules: a dónde ir al abrir', () => {
  it('sin credenciales configuradas se va al tablero (modo local)', () => {
    expect(decidirInicioLogin({ credenciales: false, sesion: null, aviso: '' })).toEqual({
      tipo: 'ir-a',
      ruta: '/board'
    });
  });

  it('con sesión ya iniciada se va al tablero', () => {
    const sesion = { user: { id: 'user-1' }, access_token: 'tok' };
    expect(decidirInicioLogin({ credenciales: true, sesion, aviso: '' })).toEqual({
      tipo: 'ir-a',
      ruta: '/board'
    });
  });

  it('sin sesión se queda en el login y arrastra el aviso', () => {
    expect(decidirInicioLogin({ credenciales: true, sesion: null, aviso: '' })).toEqual({
      tipo: 'quedarse',
      aviso: ''
    });
    expect(decidirInicioLogin({ credenciales: true, sesion: undefined, aviso: 'Cuenta eliminada' })).toEqual({
      tipo: 'quedarse',
      aviso: 'Cuenta eliminada'
    });
  });

  it('el aviso se pierde si se navega al tablero', () => {
    // Con sesión o sin credenciales se va al tablero: el mensaje no se mostraría.
    expect(decidirInicioLogin({ credenciales: true, sesion: { id: 'u' }, aviso: 'x' })).not.toHaveProperty('aviso');
  });
});

describe('login-rules: aviso de borrado de cuenta', () => {
  it('lee el mensaje del estado de navegación', () => {
    expect(avisoDeNavegacion({ deleteMessage: 'Tu cuenta fue eliminada' })).toBe(
      'Tu cuenta fue eliminada'
    );
  });

  it('sin estado o sin mensaje no avisa', () => {
    expect(avisoDeNavegacion(null)).toBe('');
    expect(avisoDeNavegacion(undefined)).toBe('');
    expect(avisoDeNavegacion({})).toBe('');
    expect(avisoDeNavegacion({ deleteMessage: 42 })).toBe('');
    expect(avisoDeNavegacion('no soy un objeto')).toBe('');
  });
});

describe('login-rules: error al iniciar sesión', () => {
  it('usa el mensaje del error si viene', () => {
    expect(mensajeErrorLogin(new Error('El proveedor de Google no respondió'))).toBe(
      'El proveedor de Google no respondió'
    );
  });

  it('si no es un Error, usa el mensaje genérico', () => {
    for (const raro of [null, undefined, 'texto', 42, {}, new Error('')]) {
      expect(mensajeErrorLogin(raro), JSON.stringify(raro)).toBe(
        'No se pudo iniciar sesión con Google. Inténtalo de nuevo.'
      );
    }
  });
});

describe('login-rules: enlaces legales', () => {
  it('en nativo hay que frenar el click del enlace', () => {
    expect(abrirConBrowserNativo('https://x/privacidad', true)).toBe(true);
  });

  it('en web se deja pasar', () => {
    expect(abrirConBrowserNativo('https://x/privacidad', false)).toBe(false);
  });
});

describe('login-rules: volver del navegador sin completar el login', () => {
  it('desbloquea el botón al volver a la app sin sesión', () => {
    expect(
      debeDesbloquearTrasReanudar({
        credenciales: true,
        esNativo: true,
        activa: true,
        sesion: null
      })
    ).toBe(true);
  });

  it('con sesión ya iniciada no hace nada', () => {
    expect(
      debeDesbloquearTrasReanudar({
        credenciales: true,
        esNativo: true,
        activa: true,
        sesion: { user: { id: 'u' } }
      })
    ).toBe(false);
  });

  it('si la app se va a segundo plano no desbloquea', () => {
    expect(
      debeDesbloquearTrasReanudar({
        credenciales: true,
        esNativo: true,
        activa: false,
        sesion: null
      })
    ).toBe(false);
  });

  it('en web o sin credenciales no se vigila la reanudación', () => {
    for (const base of [
      { credenciales: false, esNativo: true },
      { credenciales: true, esNativo: false }
    ]) {
      expect(debeDesbloquearTrasReanudar({ ...base, activa: true, sesion: null })).toBe(false);
    }
  });
});
