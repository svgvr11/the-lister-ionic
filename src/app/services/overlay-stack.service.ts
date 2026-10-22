import { Injectable } from '@angular/core';
import { OverlayStack } from '../core/overlay-stack';

export interface RegisteredOverlay {
  id: string;
  close: () => void;
  dismissible?: boolean;
}

@Injectable({ providedIn: 'root' })
export class OverlayStackService {
  private readonly stack = new OverlayStack();
  private readonly owners = new Map<string, Set<string>>();

  sync(owner: string, overlays: RegisteredOverlay[]): void {
    const desired = new Map(overlays.map((overlay) => [overlay.id, overlay]));
    const owned = this.owners.get(owner) ?? new Set<string>();

    for (const id of [...owned]) {
      if (!desired.has(id)) {
        this.stack.unregister(id);
        owned.delete(id);
      }
    }

    for (const overlay of overlays) {
      if (owned.has(overlay.id)) continue;
      this.stack.register(overlay.id, overlay.close, overlay.dismissible ?? true);
      owned.add(overlay.id);
    }
    this.owners.set(owner, owned);
  }

  unregisterOwner(owner: string): void {
    for (const id of this.owners.get(owner) ?? []) this.stack.unregister(id);
    this.owners.delete(owner);
  }

  register(overlay: RegisteredOverlay): () => void {
    return this.stack.register(overlay.id, overlay.close, overlay.dismissible ?? true);
  }

  closeTop() {
    return this.stack.closeTop();
  }

  get topId(): string | null {
    return this.stack.topId;
  }
}
