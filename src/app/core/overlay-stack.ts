export type OverlayCloseResult = 'closed' | 'blocked' | 'empty';

interface OverlayEntry {
  id: string;
  close: () => void;
  dismissible: boolean;
}

/** Pila de overlays abierta; los ids permiten retirar entradas al desmontar cada capa. */
export class OverlayStack {
  private entries: OverlayEntry[] = [];

  register(id: string, close: () => void, dismissible = true): () => void {
    this.unregister(id);
    this.entries.push({ id, close, dismissible });
    return () => this.unregister(id);
  }

  unregister(id: string): boolean {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    this.entries.splice(index, 1);
    return true;
  }

  unregisterPrefix(prefix: string): void {
    this.entries = this.entries.filter((entry) => !entry.id.startsWith(prefix));
  }

  closeTop(): OverlayCloseResult {
    const top = this.entries[this.entries.length - 1];
    if (!top) return 'empty';
    if (!top.dismissible) return 'blocked';
    this.entries.pop();
    top.close();
    return 'closed';
  }

  get topId(): string | null {
    return this.entries[this.entries.length - 1]?.id ?? null;
  }

  get size(): number {
    return this.entries.length;
  }
}
