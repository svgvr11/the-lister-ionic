import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline } from 'ionicons/icons';
import { Session } from '@supabase/supabase-js';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { APP_VERSION_LABEL } from '../../core/app-version';
import { DELETE_ACCOUNT_PAGE_URL, PRIVACY_PAGE_URL } from '../../core/platform/legal-urls/legal-urls';
import {
  abrirConBrowserNativo,
  avisoDeNavegacion,
  decidirInicioLogin,
  debeDesbloquearTrasReanudar,
  mensajeErrorLogin
} from '../../core/login-rules';

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
    // En nativo el login vuelve por deep link: la sesión no está disponible hasta
    // que AuthService la canjee, así que escuchamos en lugar de leer getSession().
    this.subscription.add(this.auth.sessionChanges.subscribe((session) => {
      void this.onSessionChange(session);
    }));
    this.listenForNativeResume();

    const destino = decidirInicioLogin({
      credenciales: this.auth.enabled,
      sesion: await this.auth.getSession(),
      aviso: avisoDeNavegacion(this.router.getCurrentNavigation()?.extras?.state)
    });
    if (destino.tipo === 'ir-a') {
      await this.router.navigateByUrl(destino.ruta, { replaceUrl: true });
      return;
    }
    // Aviso tras un borrado con sesión expirada: la cuenta puede seguir activa y hay
    // que repetir la eliminación. Viaja en el estado de navegación de board.page.
    if (destino.aviso) this.errorMessage = destino.aviso;
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    void this.appStateHandle?.remove();
  }

  async signInWithGoogle(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.errorMessage = '';
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      this.errorMessage = mensajeErrorLogin(error);
      this.busy = false;
    }
  }

  private async onSessionChange(session: Session | null): Promise<void> {
    if (session) {
      await this.router.navigateByUrl('/board', { replaceUrl: true });
      return;
    }
    this.busy = false;
  }

  /**
   * Click en un enlace legal: en nativo se abre con el plugin Browser (y se frena la
   * navegación del `<a>`); en web se deja que el propio enlace abra la pestaña nueva.
   * Devuelve `false` en nativo para cancelar el click, `true` en web para seguirlo.
   */
  openLegal(url: string): boolean {
    if (abrirConBrowserNativo(url, this.isNative)) {
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