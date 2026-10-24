import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, effect, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { IonApp, IonIcon, IonRippleEffect, IonRouterOutlet } from '@ionic/angular/standalone';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { addIcons } from 'ionicons';
import { shieldCheckmarkOutline } from 'ionicons/icons';
import { Subscription, filter } from 'rxjs';
import { AuthService } from './services/auth.service';
import { FeedbackService } from './services/feedback.service';
import { SessionGuardService } from './services/session-guard.service';
import { OverlayStackService } from './services/overlay-stack.service';

/** Rutas públicas: no se vigila la sesión desde ellas (el guardia queda desarmado). */
const PUBLIC_ROUTE_PATTERN = /^\/(login|privacy|terms)([/?#]|$)/;

/**
 * Raíz de la app. Además del outlet, gestiona el guardia de sesión entre pestañas
 * (solo web): arma la vigilancia cuando hay sesión en una ruta protegida, la desarma
 * en rutas públicas y muestra el modal de bloqueo a pantalla completa cuando otra
 * pestaña cierra la sesión o entra con otra cuenta.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, IonApp, IonRouterOutlet, IonIcon, IonRippleEffect],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly sessionGuard = inject(SessionGuardService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly feedback = inject(FeedbackService);
  private readonly overlays = inject(OverlayStackService);
  private readonly zone = inject(NgZone);

  /** Botón del modal de bloqueo: único elemento enfocable; recibe el foco al aparecer. */
  @ViewChild('blockedFocusButton') private blockedFocusButton?: ElementRef<HTMLButtonElement>;
  @ViewChild(IonRouterOutlet) private routerOutlet?: IonRouterOutlet;

  private readonly subscription = new Subscription();
  private backButtonHandle?: PluginListenerHandle;
  private unregisterBlockedOverlay?: () => void;
  private destroyed = false;
  /** URL actual (tras redirecciones), para decidir armar/desarmar el guardia. */
  private currentUrl = '';

  constructor() {
    addIcons({ shieldCheckmarkOutline });
    // Al bloquearse, el foco pasa al botón del modal tras el siguiente pintado
    // (el *ngIf debe haber creado el elemento antes de poder enfocarlo).
    effect(() => {
      if (this.sessionGuard.blocked()) {
        this.unregisterBlockedOverlay ??= this.overlays.register({
          id: 'session:blocked',
          close: () => undefined,
          dismissible: false
        });
        setTimeout(() => this.blockedFocusButton?.nativeElement.focus(), 0);
      } else {
        this.unregisterBlockedOverlay?.();
        this.unregisterBlockedOverlay = undefined;
      }
    });
  }

  ngOnInit(): void {
    this.subscription.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.currentUrl = event.urlAfterRedirects;
          this.syncGuard();
        })
    );
    // La sesión puede llegar DESPUÉS de la navegación (INITIAL_SESSION al arrancar):
    // cada emisión vuelve a intentar armar el guardia si procede.
    this.subscription.add(this.auth.sessionChanges.subscribe(() => this.syncGuard()));
    this.currentUrl = this.router.url;
    this.syncGuard();
  }

  ngAfterViewInit(): void {
    if (Capacitor.isNativePlatform()) void this.installBackButtonHandler();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscription.unsubscribe();
    this.unregisterBlockedOverlay?.();
    void this.removeBackButtonHandler();
  }

  private async installBackButtonHandler(): Promise<void> {
    try {
      const handle = await App.addListener('backButton', () => {
        this.zone.run(() => void this.handleNativeBack());
      });
      if (this.destroyed) {
        await handle.remove();
        return;
      }
      this.backButtonHandle = handle;
    } catch (error) {
      console.error('No se pudo registrar el botón Atrás nativo', error);
    }
  }

  private async removeBackButtonHandler(): Promise<void> {
    try {
      await this.backButtonHandle?.remove();
    } catch (error) {
      console.error('No se pudo retirar el listener del botón Atrás nativo', error);
    } finally {
      this.backButtonHandle = undefined;
    }
  }

  private async handleNativeBack(): Promise<void> {
    if (this.sessionGuard.blocked()) return;
    const result = this.overlays.closeTop();
    if (result !== 'empty') return;

    try {
      if (this.routerOutlet?.canGoBack() && await this.routerOutlet.pop()) return;
      await App.exitApp();
    } catch (error) {
      console.error('No se pudo gestionar el botón Atrás nativo', error);
    }
  }

  /**
   * Arma o desarma el guardia según el estado actual: bloqueado no se toca (la única
   * salida es el botón del modal), en rutas públicas se desarma y en rutas protegidas
   * con sesión se arma (idempotente; sin sesión no hace nada).
   */
  private syncGuard(): void {
    if (this.sessionGuard.isBlocked()) return;
    if (PUBLIC_ROUTE_PATTERN.test(this.currentUrl)) {
      this.sessionGuard.disarm();
      return;
    }
    if (this.auth.session) this.sessionGuard.arm();
  }

  /**
   * Botón «Ir al inicio de sesión»: descarta SOLO el borrador de comentarios en memoria
   * (nunca localStorage), cierra el bloqueo y navega al login reemplazando el historial
   * para que «atrás» no vuelva aquí.
   */
  async goToLogin(): Promise<void> {
    this.feedback.clearDraft();
    this.sessionGuard.resetAfterNavigation();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /**
   * Teclado dentro del modal: Tab se queda en su único botón (trampa de foco) y
   * Escape no cierra — el bloqueo solo se levanta con el botón.
   */
  onBlockedKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.blockedFocusButton?.nativeElement.focus();
      return;
    }
    event.stopPropagation();
  }
}
