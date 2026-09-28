import { Injectable } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly enabled = this.hasCredentials();
  private readonly client: SupabaseClient | null = this.enabled
    ? createClient(environment.supabase.url, environment.supabase.anonKey)
    : null;
  private activeSession: Session | null = null;

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
    const { error } = await this.requireClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.requireClient().auth.signOut();
    if (error) throw error;
    this.activeSession = null;
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