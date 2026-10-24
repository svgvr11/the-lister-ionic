/**
 * Logica pura del editor en linea (tareas y titulo de lista).
 * Decide que hace cada tecla y como se normaliza el texto pegado.
 * La composicion IME (Android/acentos) se respeta: con isComposing no se guarda.
 */
export type EditKeyAction = 'save' | 'cancel' | 'ignore-newline' | 'none';
export interface EditKeyEvent { key: string; shiftKey?: boolean; isComposing?: boolean; }
export function editKeyAction(event: EditKeyEvent): EditKeyAction {
  if (event.key === 'Escape') return 'cancel';
  if (event.key !== 'Enter') return 'none';
  if (event.isComposing) return 'none';
  if (event.shiftKey) return 'ignore-newline';
  return 'save';
}
export function normalizePastedEditText(raw: string): string {
  if (!raw) return '';
  let out = '';
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    const isSpace = code === 32 || (code >= 9 && code <= 13);
    if (isSpace) {
      if (out.length === 0 || out.charCodeAt(out.length - 1) !== 32) out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}
export function splitEditOnNewline(value: string): { before: string; hadNewline: boolean } {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 10 || code === 13) return { before: value.slice(0, i), hadNewline: true };
  }
  return { before: value, hadNewline: false };
}
