import { Component } from '@angular/core';
import { LegalPageComponent } from '../../shared/components/legal-page/legal-page.component';

/**
 * Ruta pública /terms: los términos de uso todavía no están escritos, así que la pantalla
 * delega en el componente legal compartido y solo fija su título.
 */
@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [LegalPageComponent],
  template: '<app-legal-page title="Términos de uso" />'
})
export class TermsPage {}