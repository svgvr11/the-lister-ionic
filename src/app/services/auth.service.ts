import { Injectable, NgZone, inject, InjectionToken } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DeleteAccountResponseBody,
  DeleteAccountResult,
  classifyDeleteAccountInvoke,
  deleteAccountMessage,
} from '../delete-account';
import { buildGoogleOAuthOptions } from '../google-auth';
import { SESSION_BLOCKED_MESSAGE, isSessionBlocked, markLocalAuthChange } from '../session-guard';

// Debe coincidir con el intent-filter de AndroidManifest.xml y con las Redirect URLs de Supabase
const NATIVE_REDIRECT = 'dev.vmunoz.thelister://auth/callback';

/**
 * Cliente de Supabase, inyectable.
 *
 * Se extrae a un token único por una razón práctica: para poder probar `AuthService` con
 * un cliente falso, sin crear uno real con las credenciales de verdad. La factoría sigue
 * siendo la misma regla de antes (credenciales válidas → cliente; si no → null), así que
 * el comportamiento de la app no cambia.
 */
export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient | null>('SUPABASE_CLIENT', {
  providedIn: 'root',
  factory: () => createSupabaseClient()
});

/** Crea el cliente solo si hay credenciales completas; si no, la app va en modo local. */
function createSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = environment.supabase;
  const hasCredentials = Boolean(
    url.trim() && anonKey.trim() && !url.includes('YOUR_') && !anonKey.includes('YOUR_')
  );
  return hasCredentials ? createClient(url, anonKey, { auth: { flowType: 'pkce' } }) : null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client: SupabaseClient | null = inject(SUPABASE_CLIENT);
  readonly enabled = this.client !== null;
  private activeSession: Session | null = null;
  private readonly sessionChangesSubject = new Subject<Session | null>();
  readonly sessionChanges = this.sessionChangesSubject.asObservable();

  constructor(private readonly zone: NgZone) {
    // Única fuente de emisión de sesión: también cubre el canje del deep link
    this.client?.auth.onAuthStateChange((_event, session) => {
      this.zone.run(() => {
        this.activeSession = session;
        this.sessionChangesSubject.next(session);
      });
    });

    if (this.client && Capacitor.isNativePlatform()) {
      void App.addListener('appUrlOpen', ({ url }) => {
        this.zone.run(() => void this.handleAuthCallback(url));
      });
    }
  }

  get session(): Session | null {
    return this.activeSession;
  }

  get supabaseClient(): SupabaseClient | null {
    return this.client;
  }

  async getSession(): Promise<Session | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    this.activeSession = data.session;
    return this.activeSession;
  }

  /**
   * Inicio de sesión con Google. El `prompt: 'select_account'` (ver `google-auth.ts`)
   * obliga a Google a mostrar SIEMPRE el selector de cuenta: sin él, Google reutiliza
   * su sesión del navegador del sistema y entra directo con la última cuenta usada,
   * sin dejar elegir otra tras un cierre de sesión.
   */
  async signInWithGoogle(): Promise<void> {
    markLocalAuthChange();
    const isNative = Capacitor.isNativePlatform();
    const { data, error } = await this.requireClient().auth.signInWithOAuth({
      provider: 'google',
      options: buildGoogleOAuthOptions(isNative, isNative ? NATIVE_REDIRECT : window.location.origin)
    });
    if (error) throw error;

    if (isNative && data.url) {
      await Browser.open({ url: data.url });
    }
  }

  async signOut(options?: { scope: 'global' | 'local' | 'others' }): Promise<void> {
    markLocalAuthChange();
    const { error } = await this.requireClient().auth.signOut(options);
    if (error) throw error;
    this.activeSession = null;
  }

  /**
   * Borrado de cuenta (exigencia de Google Play). Llama a la Edge Function
   * `delete-account` con el cliente compartido y cierra la sesión LOCAL por dentro
   * tanto en éxito como ante un 401 persistente (la cuenta puede haberse borrado en
   * el servidor aunque el token ya no valga: no tiene sentido conservar la sesión).
   *
   * - Éxito (`{ ok: true }`) → `signOut local` y `{ ok: true }`.
   * - 401 → refresca la sesión y repite la petición UNA vez; si sigue en 401,
   *   `signOut local` y el mensaje de sesión expirada. NUNCA se trata como éxito.
   * - Red o 5xx → mensaje claro y la sesión INTACTA, para poder reintentar.
   */
  async deleteAccount(): Promise<DeleteAccountResult> {
    // Pestaña bloqueada: otra pestaña cambió la sesión compartida, así que no se ni
    // invoca la Edge Function ni se intenta refrescar/cerrar la sesión.
    if (isSessionBlocked()) return this.blockedResult();
    const client = this.requireClient();
    const intento = await this.invokeDeleteAccount(client);
    if (intento !== 'session-expired') return this.toDeleteAccountResult(intento);

    // Un 401 puede ser solo un access token caducado: se refresca y se reintenta UNA vez.
    // Si durante el primer intento la otra pestaña cambió la sesión, no se refresca ni se
    // repite: la pestaña ya está bloqueada y tocar Supabase sería escribir con otra cuenta.
    if (isSessionBlocked()) return this.blockedResult();
    try {
      const { data, error } = await client.auth.refreshSession();
      if (error || !data?.session) return this.expiredAfterLocalSignOut();
    } catch {
      return this.expiredAfterLocalSignOut();
    }
    if (isSessionBlocked()) return this.blockedResult();
    return this.toDeleteAccountResult(await this.invokeDeleteAccount(client));
  }

  /** Resultado de `deleteAccount` cuando la pestaña está bloqueada por otra pestaña. */
  private blockedResult(): DeleteAccountResult {
    return { ok: false, reason: 'session-expired', message: SESSION_BLOCKED_MESSAGE };
  }

  /** Un intento contra la función; nunca lanza: todo fallo se clasifica. */
  private async invokeDeleteAccount(
    client: SupabaseClient
  ): Promise<ReturnType<typeof classifyDeleteAccountInvoke>> {
    try {
      const { data, error } = await client.functions.invoke('delete-account', { body: {} });
      return classifyDeleteAccountInvoke(
        data as DeleteAccountResponseBody | null,
        error ? { status: (error as { status?: number }).status, message: error.message } : null
      );
    } catch {
      return 'network';
    }
  }

  /** Convierte el resultado de un intento en respuesta, cerrando la sesión local si toca. */
  private async toDeleteAccountResult(
    outcome: ReturnType<typeof classifyDeleteAccountInvoke>
  ): Promise<DeleteAccountResult> {
    if (outcome === 'ok') {
      await this.signOut({ scope: 'local' });
      return { ok: true };
    }
    if (outcome === 'session-expired') return this.expiredAfterLocalSignOut();
    return { ok: false, reason: outcome, message: deleteAccountMessage(outcome) };
  }

  /** 401 persistente: se cierra la sesión local y se avisa, sin tratarlo como éxito. */
  private async expiredAfterLocalSignOut(): Promise<DeleteAccountResult> {
    try {
      await this.signOut({ scope: 'local' });
    } catch {
      this.activeSession = null;
    }
    return {
      ok: false,
      reason: 'session-expired',
      message: deleteAccountMessage('session-expired'),
    };
  }

  private async handleAuthCallback(url: string): Promise<void> {
    if (!url.startsWith(NATIVE_REDIRECT)) return;

    // Se parsea a mano: new URL() es poco fiable con esquemas personalizados en WebViews antiguos
    const queryStart = url.indexOf('?');
    const hashStart = url.indexOf('#');
    const query = queryStart >= 0
      ? url.substring(queryStart + 1, hashStart > queryStart ? hashStart : undefined)
      : '';
    const params = new URLSearchParams(query);

    const authError = params.get('error_description');
    if (authError) {
      console.error('Error de autenticación:', authError);
      await this.closeBrowser();
      return;
    }

    const code = params.get('code');
    if (!code) return;

    // onAuthStateChange se encarga de actualizar la sesión y notificar a la UI
    const { error } = await this.requireClient().auth.exchangeCodeForSession(code);
    if (error) console.error('No se pudo crear la sesión:', error.message);

    await this.closeBrowser();
  }

  private async closeBrowser(): Promise<void> {
    try {
      await Browser.close(); // No implementado en Android: se ignora el error
    } catch {
      /* noop */
    }
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error('Configura las credenciales de Supabase para habilitar el acceso.');
    return this.client;
  }
}