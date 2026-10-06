import { Component, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { APP_VERSION_LABEL } from '../../core/app-version';
import { DELETE_ACCOUNT_PAGE_URL, PRIVACY_PAGE_URL } from '../../core/legal-urls';
import { ConnectivityService } from '../../core/services/connectivity.service';

/**
 * Pie del tablero: estado de la sincronización, copyright y enlaces legales con la versión
 * de la app. Solo se monta en el tablero; el archivo y el basurero, que se leen de un vistazo
 * y se vuelven con el botón de atrás, lo muestran sin pie.
 *
 * Sigue living dentro de <ion-content>, al final del contenido: no es fijo ni tapa nada, se
 * lee al llegar al final del scroll. Solo se usa donde hay sesión abierta; el login no lo
 * monta porque no hay nada que sincronizar.
 *
 * Los enlaces son las páginas estáticas públicas (URLs absolutas): en nativo se abren con
 * el plugin Browser de Capacitor y en web en pestaña nueva.
 */
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [],
  templateUrl: './app-footer.component.html',
  styleUrls: ['./app-footer.component.scss']
})
export class AppFooterComponent {
  private readonly connectivity = inject(ConnectivityService);

  /** Conexión en vivo: la señal del servicio, sin suscripciones propias. */
  readonly online = this.connectivity.online;
  /** Año actual, para que el copyright no tenga que editarse cada año. */
  readonly year = new Date().getFullYear();
  /** Versión de la app, leída del único archivo donde está definida. */
  readonly appVersionLabel = APP_VERSION_LABEL;
  /** Enlaces legales públicos (páginas estáticas). */
  readonly privacyUrl = PRIVACY_PAGE_URL;
  readonly deleteAccountUrl = DELETE_ACCOUNT_PAGE_URL;
  /** En nativo los enlaces externos se abren con el plugin Browser. */
  readonly isNative = Capacitor.isNativePlatform();

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

  /**
   * El estado no se apoya solo en el color: el texto cambia con el punto, y es el texto el
   * que vive dentro de role="status" para que un lector de pantalla lo anuncie.
   */
  get syncLabel(): string {
    return this.online()
      ? 'Sincronización con la nube activa'
      : 'Sincronización con la nube interrumpida';
  }
}