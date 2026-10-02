import { Injectable, NgZone } from '@angular/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

// Debe coincidir con el intent-filter de AndroidManifest.xml y con las Redirect URLs de Supabase
const NATIVE_REDIRECT = 'dev.vmunoz.thelister://auth/callback';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly enabled = this.hasCredentials();
  private readonly client: SupabaseClient | null = this.enabled
    ? createClient(environment.supabase.url, environment.supabase.anonKey, {
        auth: { flowType: 'pkce' }
      })
    : null;
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

  async getSession(): Promise<Session | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    this.activeSession = data.session;
    return this.activeSession;
  }

  async signInWithGoogle(): Promise<void> {
    const isNative = Capacitor.isNativePlatform();
    const { data, error } = await this.requireClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: isNative ? NATIVE_REDIRECT : window.location.origin,
        skipBrowserRedirect: isNative
      }
    });
    if (error) throw error;

    if (isNative && data.url) {
      await Browser.open({ url: data.url });
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.requireClient().auth.signOut();
    if (error) throw error;
    this.activeSession = null;
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

  private hasCredentials(): boolean {
    const { url, anonKey } = environment.supabase;
    return Boolean(url.trim() && anonKey.trim() && !url.includes('YOUR_') && !anonKey.includes('YOUR_'));
  }
}