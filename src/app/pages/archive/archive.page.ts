import { CommonModule } from '@angular/common';
import { Component, HostBinding, inject } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar, NavController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { archiveOutline, arrowBack, chevronBack } from 'ionicons/icons';
import { readStoredTheme } from '../../core/board-themes';
import { APP_VERSION_LABEL } from '../../core/app-version';

/**
 * Archivo de listas: pantalla preparada para las listas archivadas. Por ahora solo
 * muestra el estado vacío; lo que se guarde aquí se define en otra tarea, así que esta
 * página no abre el tablero, no lee datos y no escribe nada.
 *
 * Replica la estructura de trash.page.* (mismo header, mismo tema y mismas safe areas).
 */
@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar],
  templateUrl: './archive.page.html',
  styleUrls: ['./archive.page.scss']
})
export class ArchivePage {
  private readonly navController = inject(NavController);

  /** Versión de la app, leída del único archivo donde está definida. */
  readonly appVersionLabel = APP_VERSION_LABEL;

  @HostBinding('style.--board-bg') boardBackground = readStoredTheme().background;

  constructor() {
    addIcons({ archiveOutline, arrowBack, chevronBack });
  }

  /**
   * navigateBack saca la página del stack del router outlet, de modo que la transición
   * es de retroceso. Si se abrió directamente en /archive no hay historial y cae a esa
   * misma ruta hacia adelante.
   */
  goBack(): void {
    void this.navController.navigateBack('/board');
  }
}
