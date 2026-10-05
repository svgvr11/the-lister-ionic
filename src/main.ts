import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withHashLocation } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { installKeyboardProbe } from './app/core/keyboard-probe'; // TEMPORAL: borrar con el archivo
import { installRecentErrors } from './app/core/recent-errors';

/** INSTRUMENTACIÓN TEMPORAL — solo con `?debug=1`. Quitar junto a keyboard-probe.ts. */
installKeyboardProbe();

/**
 * Errores recientes: buffer circular de los últimos RECENT_ERRORS_LIMIT `error` y
 * `unhandledrejection`, que alimenta la información técnica del reporte de comentarios.
 *
 * Se registra AQUÍ, en el arranque, y no al abrir el modal, a propósito: así el buffer recoge
 * fallos que pasaron antes de que el usuario decidiera escribirnos, que es justo cuando más
 * sirven. `installRecentErrors()` es idempotente, así que llamarla de más no duplica listeners.
 */
installRecentErrors();

/**
 * En Android web, el navegador NO encoge el layout al abrir el teclado: solo reduce el
 * "viewport visual" y desplaza el documento para tapar el campo enfocado. Pedir
 * `interactive-widget=resizes-content` hace que el layout sí se encoja con el teclado.
 *
 * NO es la causa del hueco bajo el pie (esa está en el input-shim y se corrige con
 * `scrollPadding: false`, más abajo). Se mantiene porque mejora el comportamiento del
 * teclado en general —el input queda dentro del layout encogido en vez de tapado— y no
 * afecta al nativo, donde el WebView ya se redimensiona.
 */
function applyWebKeyboardViewport(): void {
  if (Capacitor.isNativePlatform()) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta?.content || meta.content.includes('interactive-widget')) return;
  meta.content = `${meta.content}, interactive-widget=resizes-content`;
}

applyWebKeyboardViewport();

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(
      // El input-shim de Ionic (node_modules/@ionic/core/components/p-DmzFY5IC.js) escribe
      // `--keyboard-offset` = altura del teclado en el scroll element de <ion-content>
      // cuando el teclado se abre, y solo lo retira al recibir `focusout`. En Android web,
      // ocultar el teclado con SU BOTÓN no dispara `focusout` (el input sigue enfocado), así
      // que el relleno se quedaba puesto y abría un hueco de ~290px bajo el pie.
      // Desactivar `scrollPadding` evita esa escritura. NO se toca `scrollAssist`: es el que
      // sube el input para que no quede tapado por el teclado, y eso hay que conservarlo.
      // Solo web: en el APK el WebView ya se redimensiona y esto no aplica.
      Capacitor.isNativePlatform() ? {} : { scrollPadding: false }
    ),
    provideRouter(routes, withHashLocation())
  ]
}).catch((err) => console.error(err));
