/**
 * INSTRUMENTACIÓN TEMPORAL — solo activa con `?debug=1` en la URL. Nada por defecto.
 *
 * Para quitarla: borra este archivo y las dos líneas que lo mencionan en `main.ts`.
 *
 * Muestra, tras focusin/focusout/resize/visualViewport.resize, el estado que decide si el
 * hueco bajo el pie viene del relleno de Ionic:
 *   - viewports (visualViewport.height vs window.innerHeight) y su diferencia,
 *   - el elemento realmente enfocado,
 *   - y, del scroll element de <ion-content> (`div.inner-scroll`, dentro del shadow root):
 *     scrollHeight, clientHeight, scrollTop, padding-bottom y scroll-padding-bottom, el
 *     estilo inline de ion-content y del propio scroll element, y `--keyboard-offset`.
 *
 * El botón "Copiar" pone el informe en el portapapeles para pegarlo sin transcribirlo.
 */
export function installKeyboardProbe(): void {
  if (!new URLSearchParams(location.search).has('debug')) return;

  const pre = document.createElement('pre');
  pre.id = 'kb-probe';
  Object.assign(pre.style, {
    position: 'fixed', zIndex: '2147483647', inset: '0 0 auto 0', maxHeight: '62vh',
    overflow: 'auto', margin: '0', padding: '8px', background: '#111', color: '#0f0',
    font: '11px/1.35 ui-monospace, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
  });

  const copy = document.createElement('button');
  copy.textContent = 'Copiar';
  Object.assign(copy.style, {
    position: 'fixed', zIndex: '2147483647', top: '8px', right: '8px',
    padding: '4px 8px', font: '11px ui-monospace, monospace'
  });

  /** Scroll element real de <ion-content>: `div.inner-scroll` dentro de su shadow root. */
  function scrollElementOf(el: Element | null): HTMLElement | null {
    const ionContent = el?.closest('ion-content') ?? document.querySelector('ion-content');
    return (ionContent?.shadowRoot?.querySelector('.inner-scroll') as HTMLElement) ?? null;
  }

  function dump(reason: string): void {
    const vv = window.visualViewport;
    const active = document.activeElement as HTMLElement | null;
    const scroll = scrollElementOf(active);
    const ionContent = (active?.closest('ion-content') ?? document.querySelector('ion-content')) as HTMLElement | null;
    const sc = scroll ? getComputedStyle(scroll) : null;

    // El hueco que ve el usuario es lo que el scroll element deja por debajo de su
    // contenido: scrollHeight - clientHeight - scrollTop es el sobrante alcanzable.
    const sobrante = scroll ? scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop : 0;

    pre.textContent = [
      `evento: ${reason}`,
      `vv.height=${vv ? Math.round(vv.height) : 'n/a'}  innerHeight=${window.innerHeight}` +
        `  delta=${vv ? Math.round(window.innerHeight - vv.height) : 'n/a'}`,
      `activeElement: ${active ? active.tagName.toLowerCase() + '.' + (active.className || '(sin clase)') : 'null'}`,
      `pointer:coarse=${window.matchMedia('(pointer: coarse)').matches}`,
      scroll
        ? [
            `scrollHeight=${scroll.scrollHeight}  clientHeight=${scroll.clientHeight}  scrollTop=${Math.round(scroll.scrollTop)}`,
            `paddingBottom=${sc!.paddingBottom}  scrollPaddingBottom=${sc!.scrollPaddingBottom}`,
            `--keyboard-offset=${sc!.getPropertyValue('--keyboard-offset').trim() || '(sin definir)'}`,
            `SOBRANTE BAJO EL CONTENIDO=${sobrante}px`,
            `scrollElement inline="${scroll.getAttribute('style') ?? ''}"`,
            `ion-content inline="${ionContent?.getAttribute('style') ?? ''}"`,
            `ion-content --keyboard-offset=${ionContent ? getComputedStyle(ionContent).getPropertyValue('--keyboard-offset').trim() : 'n/a'}`
          ].join('\n')
        : 'sin scroll element'
    ].join('\n');
  }

  copy.onclick = () => navigator.clipboard?.writeText(pre.textContent ?? '');
  document.addEventListener('DOMContentLoaded', () => {
    document.body.append(pre, copy);
  });
  for (const ev of ['focusin', 'focusout', 'resize'] as const) {
    window.addEventListener(ev, () => dump(ev), true);
  }
  window.visualViewport?.addEventListener('resize', () => dump('visualViewport.resize'));
  setTimeout(() => dump('inicio'), 0);
}
