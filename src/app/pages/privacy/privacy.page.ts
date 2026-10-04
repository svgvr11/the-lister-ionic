import { Component } from '@angular/core';
import { LegalPageComponent } from '../../shared/legal-page/legal-page.component';

/**
 * Ruta pública /privacy: la política de privacidad todavía no está escrita, así que la
 * pantalla delega en el componente legal compartido y solo fija su título.
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [LegalPageComponent],
  template: '<app-legal-page title="Política de privacidad" />'
})
export class PrivacyPage {}