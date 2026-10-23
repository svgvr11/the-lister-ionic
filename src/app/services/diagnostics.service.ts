import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { APP_VERSION_LABEL } from '../core/app-version';
import { readStoredThemeId } from '../core/board-themes';
import { snapshotRecentErrors } from '../core/recent-errors';
import { FeedbackCounts, FeedbackDiagnostics, collectDiagnostics } from '../core/feedback-core';

/**
 * DIAGNÓSTICO TÉCNICO
 *
 * Junta lo de `collectDiagnostics` (puro, en feedback-core) con lo que hay que leer del
 * entorno. La separación es deliberada: la lista blanca se decide y se prueba sin navegador,
 * y aquí solo se junta lo de la pantalla.
 *
 * NÚNCA incluye títulos o contenido de listas o tareas, el correo o el nombre de la cuenta,
 * el avatar, ningún token, el contenido de localStorage ni la ubicación. Solo los tres números
 * de conteo, la versión, la plataforma y datos del dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class DiagnosticsService {
  private readonly router = inject(Router);

  /** Contadores que publica el tablero: solo tres números, nunca contenido. */
  private readonly counts: FeedbackCounts = { lists: 0, archivedLists: 0, trashedLists: 0 };

  /**
   * El tablero publica los tres números del tablero. Es el único punto por el que la app
   * comunica datos del tablero, y solo admite cifras: por diseño no hay forma de que desde
   * aquí salga el nombre de una lista.
   */
  setCounts(counts: FeedbackCounts): void {
    this.counts.lists = Number.isFinite(counts.lists) ? Math.max(0, counts.lists) : 0;
    this.counts.archivedLists = Number.isFinite(counts.archivedLists) ? Math.max(0, counts.archivedLists) : 0;
    this.counts.trashedLists = Number.isFinite(counts.trashedLists) ? Math.max(0, counts.trashedLists) : 0;
  }

  /**
   * El diagnóstico tal como se enviará, ya pasado por la lista blanca.
   *
   * `navigator` y `window` se leen con guardas porque `collectDiagnostics` debe degradar a
   * cadenas vacías en un entorno sin DOM (pruebas) en lugar de romperse.
   */
  collect(): FeedbackDiagnostics {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    const view = typeof window === 'undefined' ? undefined : window;
    // userAgentData solo existe en navegadores modernos; en el WebView de Android y en
    // navegadores viejos se cae a navigator.platform, que es deprecado pero el mejor dato.
    const userAgentData = (nav as { userAgentData?: { platform?: string } } | undefined)?.userAgentData;

    return collectDiagnostics({
      appVersion: APP_VERSION_LABEL,
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform(),
      userAgent: nav?.userAgent ?? '',
      uaPlatform: userAgentData?.platform ?? nav?.platform ?? '',
      language: nav?.language ?? '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
      screen: view ? { width: view.screen.width, height: view.screen.height } : { width: 0, height: 0 },
      viewport: view ? { width: view.innerWidth, height: view.innerHeight } : { width: 0, height: 0 },
      pixelRatio: view?.devicePixelRatio ?? 1,
      online: nav?.onLine !== false,
      route: this.router?.url ?? '',
      themeId: readStoredThemeId() ?? '',
      counts: { ...this.counts },
      recentErrors: snapshotRecentErrors()
    });
  }
}
