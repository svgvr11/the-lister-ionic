import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_VERSION_LABEL } from '../../core/app-version';
import { ConnectivityService } from '../../core/services/connectivity.service';

/**
 * Pie común del tablero, el archivo y el basurero: estado de la sincronización, copyright y
 * enlaces legales con la versión de la app.
 *
 * Sigue living dentro de <ion-content>, al final del contenido: no es fijo ni tapa nada, se
 * lee al llegar al final del scroll. Solo se usa donde hay sesión abierta; el login no lo
 * monta porque no hay nada que sincronizar.
 */
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
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