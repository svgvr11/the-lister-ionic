import { Injectable } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { Subject } from 'rxjs';
import type { DeleteAccountResult } from '../core/auth/delete-account/delete-account';
import { markLocalAuthChange } from '../core/auth/session-guard/session-guard';

function createMockSession(): Session {
  return {
    access_token: 'mock-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'mock-refresh-token',
    user: {
      id: 'mock-user-id',
      app_metadata: { provider: 'mock', providers: ['mock'] },
      user_metadata: { full_name: 'Usuario de prueba' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: 'demo@thelister.test'
    }
  } as Session;
}

@Injectable()
export class MockAuthService {
  readonly enabled = true;
  readonly mockMode = true;
  readonly supabaseClient = null;
  private activeSession: Session | null = createMockSession();
  private readonly sessionChangesSubject = new Subject<Session | null>();
  readonly sessionChanges = this.sessionChangesSubject.asObservable();

  get session(): Session | null {
    return this.activeSession;
  }

  async getSession(): Promise<Session | null> {
    return this.activeSession;
  }

  async signInWithGoogle(): Promise<void> {
    markLocalAuthChange();
    this.activeSession ??= createMockSession();
    this.sessionChangesSubject.next(this.activeSession);
  }

  async signOut(_options?: { scope: 'global' | 'local' | 'others' }): Promise<void> {
    markLocalAuthChange();
    this.activeSession = null;
    this.sessionChangesSubject.next(null);
  }

  async deleteAccount(): Promise<DeleteAccountResult> {
    return {
      ok: false,
      reason: 'network',
      message: 'El borrado de cuenta no está disponible en modo demo.'
    };
  }
}
