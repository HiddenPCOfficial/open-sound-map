import { normalizeChangeset } from '../lib/osm';
import type { ConnectionStatus, WikiEvent } from '../types/wiki';

/** Poll cached public changesets; pace each batch instead of playing it at once. */
export class OpenStreetMapStream {
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  connect(onEvent: (event: WikiEvent) => void, onStatus: (status: ConnectionStatus) => void): void {
    this.close();
    const controller = new AbortController();
    this.controller = controller;
    const counts = new Map<number, number>();
    onStatus('connecting');
    const poll = async () => {
      try {
        const response = await fetch('/api/osm/changesets', { signal: controller.signal });
        if (!response.ok) throw new Error('OSM unavailable');
        const data = await response.json();
        if (!Array.isArray(data.changesets)) throw new Error('Invalid changesets');
        onStatus('connected');
        const batch: WikiEvent[] = [];
        for (const item of [...data.changesets].reverse()) {
          const event = normalizeChangeset(item);
          if (!event) continue;
          const previous = counts.get(item.id);
          counts.set(item.id, item.changes_count);
          if (previous !== undefined && item.changes_count <= previous) continue;
          batch.push({ ...event, delta: previous === undefined ? event.delta : item.changes_count - previous });
        }
        if (counts.size > 4000) for (const id of [...counts.keys()].slice(0, 2000)) counts.delete(id);
        for (const event of batch) {
          if (controller.signal.aborted) return;
          onEvent({ ...event, receivedAt: Date.now() });
          if (controller.signal.aborted) return;
          await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, Math.min(500, 10000 / Math.max(1, batch.length)));
            controller.signal.addEventListener('abort', finish, { once: true });
          });
        }
      } catch { if (!controller.signal.aborted) onStatus('reconnecting'); }
      if (!controller.signal.aborted) this.timer = setTimeout(() => void poll(), 15000);
    };
    void poll();
  }
  close(): void { this.controller?.abort(); this.controller = null; if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
