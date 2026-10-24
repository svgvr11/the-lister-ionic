import { Injectable, Injector, NgZone, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable } from 'rxjs';
import { BoardSessionService } from './board-session.service';
import { esFlancoDeReconexion, leerConexionNavegador } from '../core/platform/connectivity-rules/connectivity-rules';

/** Valor inicial: el navegador solo sabe si el equipo tiene red, no si llega a Supabase. */
function readNavigatorOnline(): boolean {
  return typeof navigator === 'undefined' ? true : leerConexionNavegador(navigator.onLine);
}

/**
 * Estado de la conexión del dispositivo, en una sola señal.
 *
 * Se apoya en `navigator.onLine` y en los eventos 'online' / 'offline' de `window`, sin
 * dependencias nuevas (@capacitor/network no está instalado). LIMITACIÓN CONOCIDA: esa
 * información dice si el equipo tiene red, no si la nube responde; una caída que solo
 * afecte a Supabase (servidor caído, DNS bloqueado) no se ve aquí y el indicador seguirá
 * en verde. Por eso no se mezcla con ningún estado de Realtime: el repositorio y
 * BoardSessionService no exponen ninguno, y paraaveriguarlo con los eventos de guardado
 * o de error habría que tocar el repositorio, que queda fuera de esta tarea.
 *
 * Al volver la conexión pide UN refresco del tablero por el mismo camino que usa el
 * pull-to-refresh (BoardSessionService.refresh), que ya evita refrescos solapados. Los
 * listeners se registran una sola vez, en el servicio root: navegar entre tablero, archivo
 * y basurero no los duplica.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService implements OnDestroy {
  private readonly zone = inject(NgZone);
  /** Se resuelve solo al volver la conexión, para no crear la sesión del tablero antes de tiempo. */
  private readonly injector = inject(Injector);
  private readonly onlineSubject = new BehaviorSubject<boolean>(readNavigatorOnline());

  /** La misma conexión en modo observable, para quien no use señales. */
  readonly online$: Observable<boolean> = this.onlineSubject.asObservable();
  /** La conexión en vivo: true con red, false sin ella. */
  readonly online = toSignal(this.onlineSubject, { requireSync: true });

  private readonly handleOnline = () => this.zone.run(() => this.setOnline(true));
  private readonly handleOffline = () => this.zone.run(() => this.setOnline(false));

  constructor() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  private setOnline(value: boolean): void {
    const previous = this.onlineSubject.value;
    if (previous === value) return;
    this.onlineSubject.next(value);
    // Solo en el flanco offline → online, y una sola vez: el evento se dispara por cambio real.
    // Solo en el flanco offline → online; la regla está en connectivity-rules.ts.
    if (esFlancoDeReconexion(previous, value)) void this.refreshBoard();
  }

  /** Trae lo que se quedó pendiente mientras no había red. */
  private async refreshBoard(): Promise<void> {
    try {
      await this.injector.get(BoardSessionService).refresh();
    } catch (error) {
      console.warn('No se pudo actualizar el tablero al volver la conexión', error);
    }
  }
}