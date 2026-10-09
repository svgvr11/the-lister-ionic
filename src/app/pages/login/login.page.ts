import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { Router, NavigationEnd, Event } from '@angular/router';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline } from 'ionicons/icons';
import { Session } from '@supabase/supabase-js';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { APP_VERSION_LABEL } from '../../core/app-version';
import { DELETE_ACCOUNT_PAGE_URL, PRIVACY_PAGE_URL } from '../../core/legal-urls';
import { LOGIN_SPINNER_MIN_MS, LOGIN_SPINNER_MAX_MS, remainingMinMs, shouldForceStop } from '../../core/login-spinner';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon, IonSpinner],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage implements OnInit, OnDestroy {
  /** Versión de la app, leída del único archivo donde está definida. */
  readonly appVersionLabel = APP_VERSION_LABEL;

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly subscription = new Subscription();
  private appStateHandle?: PluginListenerHandle;
  private spinnerInterval?: ReturnType<typeof setInterval>;
  private navigationTriggered = false;

  /** Spinner overlay state (local a esta página). */
  signingIn = signal(false);
  /** Momento en que se activó el overlay. */
  private startedAt = 0;
  /** Si ya pasó el mínimo de 3s. */
  private minElapsed = signal(false);

  busy = false;
  errorMessage = '';
  /** Enlaces legales públicos (páginas estáticas). */
  readonly privacyUrl = PRIVACY_PAGE_URL;
  readonly deleteAccountUrl = DELETE_ACCOUNT_PAGE_URL;
  /** En nativo los enlaces externos se abren con el plugin Browser. */
  readonly isNative = Capacitor.isNativePlatform();

  constructor() {
    addIcons({ checkmarkCircleOutline });
  }

  async ngOnInit(): Promise<void> {
    // Detectar código/error en URL (web: retorno de Google OAuth)
    const search = window.location.search;
    const hasCode = search.includes('code=');
    const hasError = search.includes('error=');

    if (hasError) {
      this.errorMessage = 'No se pudo iniciar sesión. Inténtalo de nuevo.';
      return;
    }

    if (hasCode) {
      this.startSpinner();
    }

    // Suscripción a cambios de sesión (cubre nativo deep link y web)
    this.subscription.add(this.auth.sessionChanges.subscribe((session) => {
      void this.onSessionChange(session);
    }));

    // Detectar navegación a /board (backup por si onSessionChange no navega)
    this.subscription.add(
      this.router.events.pipe(filter((e: Event): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe((e: NavigationEnd) => {
          if (e.urlAfterRedirects === '/board' || e.urlAfterRedirects.startsWith('/board?')) {
            this.navigationTriggered = true;
          }
        })
    );

    this.listenForNativeResume();

    if (!this.auth.enabled) {
      await this.router.navigateByUrl('/board', { replaceUrl: true });
      return;
    }

    // Aviso tras un borrado con sesión expirada
    const navegacion = this.router.getCurrentNavigation();
    const aviso = (navegacion?.extras?.state?.['deleteMessage'] as string | undefined) ?? '';
    if (aviso) this.errorMessage = aviso;

    // Si ya hay sesión, entrar directo sin spinner
    if (await this.auth.getSession()) {
      await this.router.navigateByUrl('/board', { replaceUrl: true });
    }

    // Iniciar timer de verificación
    this.startSpinnerTimer();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    void this.appStateHandle?.remove();
    this.stopSpinnerTimer();
  }

  /** Inicia el overlay spinner y registra startedAt. */
  private startSpinner(): void {
    if (this.signingIn()) return;
    this.startedAt = Date.now();
    this.minElapsed.set(false);
    this.signingIn.set(true);
    this.errorMessage = '';
  }

  /** Detiene el overlay spinner. */
  private stopSpinner(): void {
    this.signingIn.set(false);
    this.startedAt = 0;
    this.minElapsed.set(false);
    this.navigationTriggered = false;
  }

  /** Timer único que verifica min/max cada 100ms. */
  private startSpinnerTimer(): void {
    this.stopSpinnerTimer();
    this.spinnerInterval = setInterval(() => {
      const now = Date.now();
      if (!this.signingIn()) return;

      // Forzar parada a los 20s
      if (shouldForceStop(this.startedAt, now)) {
        this.zone.run(() => {
          this.stopSpinner();
          this.errorMessage = 'No se pudo iniciar sesión. Inténtalo de nuevo.';
        });
        return;
      }

      // Marcar mínimo cumplido
      if (!this.minElapsed() && remainingMinMs(this.startedAt, now) === 0) {
        this.minElapsed.set(true);
      }

      // Parar si mínimo cumplido Y navegación disparada
      if (this.minElapsed() && this.navigationTriggered) {
        this.zone.run(() => this.stopSpinner());
      }
    }, 100);
  }

  private stopSpinnerTimer(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }
  }

  async signInWithGoogle(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.errorMessage = '';
    try {
      await this.auth.signInWithGoogle();
      // En nativo: el botón se re-habilita al volver a primer plano o a los 5s
      if (this.isNative) {
        setTimeout(() => this.zone.run(() => this.busy = false), 5000);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.';
      this.busy = false;
    }
  }

  private async onSessionChange(session: Session | null): Promise<void> {
    if (session) {
      this.navigationTriggered = true;
      await this.router.navigateByUrl('/board', { replaceUrl: true });
      return;
    }
    // Sesión null: login cancelado o fallido
    this.busy = false;
    // Si estábamos en spinner overlay, parar (el timer lo hará al ver navigationTriggered=false + minElapsed)
    // Pero si no había navigationTriggered, el timer esperará al mínimo y luego parará solo.
  }

  /**
   * Click en un enlace legal: en nativo se abre con el plugin Browser (y se frena la
   * navegación del `<a>`); en web se deja que el propio enlace abra la pestaña nueva.
   * Devuelve `false` en nativo para cancelar el click, `true` en web para seguirlo.
   */
  openLegal(url: string): boolean {
    if (this.isNative) {
      void Browser.open({ url });
      return false;
    }
    return true;
  }

  /** Si el usuario vuelve del navegador sin completar el login, desbloqueamos el botón. */
  private listenForNativeResume(): void {
    if (!this.auth.enabled || !Capacitor.isNativePlatform()) return;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive || this.auth.session) return;
      this.zone.run(() => (this.busy = false));
    }).then((handle) => (this.appStateHandle = handle));
  }
}