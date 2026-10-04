import { Component, HostBinding, Input, inject } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar, NavController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBack } from 'ionicons/icons';
import { readStoredTheme } from '../../core/board-themes';
import { AuthService } from '../../core/services/auth.service';

/**
 * Pantalla legal provisional (política de privacidad y términos de uso).
 *
 * Replica la estructura de archive.page.* (mismo header con botón de volver, mismo tema del
 * dispositivo y mismas safe areas) y deja un único texto de aviso: el contenido legal de
 * verdad lo escribe quien corresponda, así que aquí no se inventa ninguno.
 */
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar],
  templateUrl: './legal-page.component.html',
  styleUrls: ['./legal-page.component.scss']
})
export class LegalPageComponent {
  private readonly auth = inject(AuthService);
  private readonly navController = inject(NavController);

  /** Título de la pantalla: "Política de privacidad" o "Términos de uso". */
  @Input({ required: true }) title = '';

  @HostBinding('style.--board-bg') boardBackground = readStoredTheme().background;

  constructor() {
    addIcons({ chevronBack });
  }

  /**
   * navigateBack saca la página del stack del router outlet, de modo que la transición es
   * de retroceso; si se abrió directamente no hay historial y cae a esa misma ruta.
   * Con sesión abierta se vuelve al tablero y sin ella, al login: estas rutas son públicas
   * y pueden alcanzarse sin haber iniciado sesión.
   */
  async goBack(): Promise<void> {
    await this.navController.navigateBack(await this.backRoute());
  }

  private async backRoute(): Promise<string> {
    // Sin credenciales de Supabase la app funciona en local: el tablero es la pantalla de inicio.
    if (!this.auth.enabled || this.auth.session) return '/board';
    try {
      // Puede haberse abierto en frío: la sesión guardada aún no está en memoria.
      return (await this.auth.getSession()) ? '/board' : '/login';
    } catch {
      return '/login';
    }
  }
}