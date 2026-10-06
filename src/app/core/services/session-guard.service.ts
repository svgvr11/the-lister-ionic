import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Subscription } from 'rxjs';
import { AuthService } from './auth.service';
import {
  SessionBlockedState,
  classifySessionChange,
  consumeLocalAuthChange,
  extractStoredUserId,
  isSupabaseSessionKey,
  markLocalAuthChange as markLocalAuthChangeFlag,
  setSessionBlockedFlag,
} from '../session-guard';

/**
 * Bloqueo de pestaña vieja (solo web).
 *
 * La pestaña recuerda el userId con el que arrancó su sesión. Cuando la sesión
 * compartida cambia de forma relevante por OTRA pestaña, esta se BLOQUEA de forma
 * pegajosa: una vez en 'signed-out' u 'other-account' solo se sale con el botón
 * del modal (`resetAfterNavigation()`) o con `markLocalAuthChange()`. Ningún
 * evento posterior la desbloquea.
 *
 * Detección combinada:
 * - (a) `AuthService.sessionChanges` (señal principal: supabase-js la reemite
 *   entre pestañas por BroadcastChannel con SIGNED_OUT / SIGNED_IN).
 * - (b) evento `window 'storage'` sobre la clave `sb-<ref>-auth-token` como
 *   respaldo (valor null = cerrada; user.id distinto = otra cuenta).
 *
 * No cuentan como cambio: el refresco de token del mismo userId, la carga
 * inicial sin sesión previa, ni el cambio local de ESTA pestaña (logout/login
 * propios, marcados ANTES con `markLocalAuthChange()` y consumidos al procesar
 * el evento resultante). En nativo no hace nada: todo queda desactivado.
 */
@Injectable({ providedIn: 'root' })
export class SessionGuardService {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);

  /** null = operativa; 'signed-out' | 'other-account' = bloqueada con modal. */
  readonly blocked = signal<SessionBlockedState>(null);

  /** Único punto de escritura del bloqueo: mantiene sincronizado el flag de módulo. */
  private setBlocked(state: SessionBlockedState): void {
    this.blocked.set(state);
    setSessionBlockedFlag(state);
  }

  /** userId con el que arrancó la sesión ESTA pestaña. */
  private startUserId: string | null = null;
  private subscription: Subscription | null = null;
  private storageListener: ((event: StorageEvent) => void) | null = null;
  private listening = false;

  /** Solo web: en nativo el servicio queda desactivado por completo. */
  get active(): boolean {
    return !Capacitor.isNativePlatform();
  }

  /** La pestaña está bloqueada: deja de escribir y de recibir datos. */
  isBlocked(): boolean {
    return this.blocked() !== null;
  }

  /**
   * Marca que el próximo cambio de sesión lo provoca ESTA pestaña
   * (logout/login propios). Llamar ANTES de signOut/signIn/deleteAccount.
   * Delega en la marca de módulo para evitar el ciclo con AuthService.
   */
  markLocalAuthChange(): void {
    if (!this.active) return;
    markLocalAuthChangeFlag();
  }

  /**
   * Arranca la vigilancia cuando hay sesión. Idempotente: no duplica listeners
   * al navegar ni al reiniciar. Si ya está bloqueada, no hace nada (pegajoso).
   */
  arm(): void {
    if (!this.active || this.listening || this.isBlocked()) return;
    const current = this.auth.session?.user.id ?? null;
    if (!current) return;
    this.startUserId = current;
    consumeLocalAuthChange();

    this.subscription = this.auth.sessionChanges.subscribe((session) => {
      this.handleSessionEvent(session?.user.id ?? null);
    });

    this.storageListener = (event: StorageEvent) => {
      if (!isSupabaseSessionKey(event.key)) return;
      // El evento 'storage' no se dispara en la pestaña que escribe, así que
      // esto siempre viene de OTRA pestaña: la marca local no aplica aquí.
      this.zone.run(() => this.handleSessionEvent(extractStoredUserId(event.newValue)));
    };
    window.addEventListener('storage', this.storageListener);
    this.listening = true;
  }

  /** Desarma sin bloquear: al salir a una ruta pública. Corta los listeners. */
  disarm(): void {
    this.stopListening();
    this.startUserId = null;
    consumeLocalAuthChange();
    if (!this.isBlocked()) this.setBlocked(null);
  }

  /** Sale del bloqueo tras pulsar el botón del modal y navegar a /login. */
  resetAfterNavigation(): void {
    this.stopListening();
    this.startUserId = null;
    consumeLocalAuthChange();
    this.setBlocked(null);
  }

  /** Cambio de sesión: local consumido, mismo usuario ignorado, resto bloquea. */
  private handleSessionEvent(newUserId: string | null): void {
    if (!this.listening || this.startUserId === null || this.isBlocked()) {
      if (this.listening && !this.isBlocked()) consumeLocalAuthChange();
      return;
    }
    if (consumeLocalAuthChange()) {
      this.startUserId = newUserId;
      if (newUserId === null) this.stopListening();
      return;
    }
    const kind = classifySessionChange(this.startUserId, newUserId);
    if (kind === 'same') return;
    this.stopListening();
    this.setBlocked(kind);
  }

  /** Corta la suscripción y el listener 'storage' sin tocar el bloqueo. */
  private stopListening(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    if (this.storageListener) window.removeEventListener('storage', this.storageListener);
    this.storageListener = null;
    this.listening = false;
  }
}
